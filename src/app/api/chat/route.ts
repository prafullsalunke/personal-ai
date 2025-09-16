import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, tool, NoSuchToolError, InvalidToolInputError, stepCountIs } from 'ai';
import { MCPServer } from '@/types/mcp';
import { z } from 'zod';
import { MCPDatabase } from '@/lib/database';

// Convert MCP input schema to Zod schema
function mcpSchemaToZod(mcpSchema: Record<string, unknown>): z.ZodType<Record<string, unknown>> {
  if (mcpSchema.type === 'object' && mcpSchema.properties) {
    const properties = mcpSchema.properties as Record<string, Record<string, unknown>>;
    const required = (mcpSchema.required as string[]) || [];

    const zodProperties: Record<string, z.ZodType<unknown>> = {};

    for (const [key, prop] of Object.entries(properties)) {
      if (prop.type === 'string') {
        zodProperties[key] = z.string();
      } else if (prop.type === 'number') {
        zodProperties[key] = z.number();
      } else if (prop.type === 'boolean') {
        zodProperties[key] = z.boolean();
      } else if (prop.type === 'array') {
        zodProperties[key] = z.array(z.unknown());
      } else {
        zodProperties[key] = z.unknown();
      }
    }

    const schema = z.object(zodProperties);

    // Make optional fields optional
    const optionalSchema = schema.partial();
    const requiredSchema = z.object(
      Object.fromEntries(
        required.map(key => [key, zodProperties[key]])
      )
    );

    return requiredSchema.merge(optionalSchema);
  }

  return z.record(z.string(), z.unknown());
}

// Load MCP servers from database
function getMCPServers(): MCPServer[] {
  return MCPDatabase.getEnabledServersWithTools();
}


export async function POST(req: Request) {
  const { messages, mcpServers }: { messages: UIMessage[]; mcpServers?: MCPServer[] } = await req.json();


  // Convert UI messages to the format expected by the AI SDK
  const modelMessages = messages.map((msg) => {
    let content = '';
    const msgWithContent = msg as { content?: string | Array<unknown>; parts?: Array<{ type: string; text?: string }> };

    // Handle direct content property
    if (typeof msgWithContent.content === 'string') {
      content = msgWithContent.content;
    }
    // Handle parts array (from useChat hook)
    else if (msgWithContent.parts && Array.isArray(msgWithContent.parts)) {
      content = msgWithContent.parts
        .filter(part => part.type === 'text')
        .map(part => part.text || '')
        .join('');
    }
    // Handle array content
    else if (Array.isArray(msgWithContent.content)) {
      content = msgWithContent.content.map(part =>
        typeof part === 'string' ? part : (part as { text?: string }).text || ''
      ).join('');
    }
    // Fallback
    else {
      content = String(msgWithContent.content || '');
    }


    return {
      id: msg.id,
      role: msg.role,
      content: content
    };
  });

  console.log('Converted model messages:', JSON.stringify(modelMessages, null, 2));

  // Get available MCP servers
  const servers = mcpServers || getMCPServers();
  const connectedServers = servers.filter(server =>
    server.enabled &&
    server.status === 'connected' &&
    server.tools &&
    server.tools.length > 0
    // Note: We'll establish connections on-demand when tools are called
  );

  // Note: MCP connections should already be established via test-connection API
  // We don't need to re-establish them here as it can cause hanging


  const systemPrompt = `You are a helpful, knowledgeable, and versatile AI assistant.

${connectedServers.length > 0 ? `You have access to ${connectedServers.length} MCP server(s): ${connectedServers.map(s => s.name).join(', ')}.` : ''}

Be conversational, helpful, and provide comprehensive responses when appropriate.`;

  // No system tools needed - let AI choose from available MCP tools naturally
  const systemTools = {};

  // Create dynamic tools from MCP servers
  const dynamicTools = connectedServers.flatMap(server => {
    if (!server.tools) return [];

    return server.tools.map(mcpTool => {
      const toolName = mcpTool.name;

      // Enhance descriptions with context about when to use the tool
      const enhancedDescription = mcpTool.description;

      return {
        [toolName]: tool({
          description: enhancedDescription,
          inputSchema: mcpSchemaToZod(mcpTool.inputSchema as Record<string, unknown>),
          execute: async (args: Record<string, unknown>, { abortSignal }) => {
            try {
              // Execute tool directly (lambda-style - no pre-connection needed)
              const baseUrl = `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`;
              const executeUrl = `${baseUrl}/api/mcp/execute`;
              const response = await fetch(executeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  toolName: mcpTool.name,
                  arguments: args,
                  serverId: server.id
                }),
                signal: abortSignal as AbortSignal
              } as RequestInit);

              if (!response.ok) {
                throw new Error(`MCP tool execution failed: ${response.statusText}`);
              }

              const result = await response.json();
              return result.success ? result.result : { error: result.error };
            } catch (error) {
              console.error(`Error executing MCP tool ${mcpTool.name}:`, error);
              return { error: error instanceof Error ? error.message : 'Unknown error' };
            }
          }
        })
      };
    });
  });

  // Flatten the tools object and include system tools
  const toolsObject = {
    ...systemTools,
    ...dynamicTools.reduce((acc, toolObj) => ({ ...acc, ...toolObj }), {})
  };

  console.log('Available tools:', Object.keys(toolsObject));

  const enhancedSystemPrompt = `${systemPrompt}

${connectedServers.length > 0 ? `You have access to ${connectedServers.length} MCP server(s) with ${Object.keys(toolsObject).length} specialized tools available. Use these tools intelligently when they can help answer the user's question or fulfill their request.` : ''}

You are equipped with various tools that can help you provide more accurate and up-to-date information. Use your judgment to determine when a tool would be helpful for answering a user's question.

CRITICAL CONVERSATION FLOW REQUIREMENT:
When you execute a tool, you are in the middle of a conversation, NOT at the end. After every tool execution:

1. FIRST: Execute the appropriate tool(s)
2. THEN: Always continue the conversation by providing your own analysis

MANDATORY FOLLOW-UP: After using any tool, you MUST continue with text that:
- Summarizes the tool results in plain language
- Analyzes what the data means for the user
- Provides insights and interpretation
- Explains the significance of the results
- Connects the results back to the user's original question

This is a conversational requirement - tool execution is NEVER the end of your response. You must always provide commentary and analysis after tool results.`;

  // Use AI SDK with dynamic tools and multi-step calls
  const result = streamText({
    model: openai('gpt-4'),
    system: enhancedSystemPrompt,
    messages: modelMessages, // Use properly converted messages
    tools: Object.keys(toolsObject).length > 0 ? toolsObject : undefined,
    toolChoice: 'auto',
    stopWhen: stepCountIs(5), // Allow up to 5 steps for tool calls + analysis
    onStepFinish: (step) => {
      console.log('Step finished:', {
        finishReason: step.finishReason,
        hasToolCalls: step.toolCalls.length > 0,
        hasToolResults: step.toolResults.length > 0,
        textLength: step.text?.length || 0
      });
    }
  });
  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    onError: error => {
      if (NoSuchToolError.isInstance(error)) {
        return 'The model tried to call a unknown tool.';
      } else if (InvalidToolInputError.isInstance(error)) {
        return 'The model called a tool with invalid inputs.';
      } else {
        return 'An unknown error occurred.';
      }
    },
  });
}