import OpenAI from "openai";
import { NextRequest, NextResponse } from 'next/server';
import { MCPDatabase } from '@/lib/database';

interface MessagePart {
  type: string;
  text?: string;
}

interface UIMessage {
  role: string;
  content?: string | unknown;
  parts?: MessagePart[];
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    // Convert messages to OpenAI format
    const openaiMessages = messages.map((msg: UIMessage) => {
      let content = '';

      if (msg.parts) {
        content = msg.parts
          .filter((part: MessagePart) => part.type === 'text')
          .map((part: MessagePart) => part.text || '')
          .join('');
      } else if (msg.content) {
        content = typeof msg.content === 'string' ? msg.content : String(msg.content);
      }

      return {
        role: msg.role,
        content: content
      };
    });

    // Get MCP servers and create OpenAI tools
    const servers = MCPDatabase.getEnabledServersWithTools();
    const tools: OpenAITool[] = [];

    servers.forEach(server => {
      if (server.tools) {
        server.tools.forEach(tool => {
          tools.push({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description || `${tool.name} from ${server.name}`,
              parameters: tool.inputSchema
            }
          });
        });
      }
    });

    console.log('OpenAI Tools:', JSON.stringify(tools, null, 2));

    // System message with strong analysis requirement
    const systemMessage = {
      role: "system" as const,
      content: `You are a helpful AI assistant with access to various tools.

CRITICAL: After using any tool, you MUST provide analysis and explanation of the results. Never just show raw tool output.

When you use a tool:
1. Execute the tool
2. Always follow up with your own analysis explaining what the results mean
3. Provide insights and interpretation in user-friendly language
4. Summarize key findings and their significance

Tool execution alone is never sufficient - you must always provide commentary and analysis.`
    };

    const completion = await client.chat.completions.create({
      model: "gpt-4",
      messages: [systemMessage, ...openaiMessages],
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: "auto",
      temperature: 0.7
    });

    let responseText = completion.choices[0].message.content || '';
    const toolCalls = completion.choices[0].message.tool_calls;

    // If there were tool calls, execute them and get follow-up response
    if (toolCalls && toolCalls.length > 0) {
      const toolResults: Array<{
        tool_call_id: string;
        role: "tool";
        content: string;
      }> = [];

      for (const toolCall of toolCalls) {
        try {
          // Skip if not a function tool call
          if (toolCall.type !== 'function') continue;

          // Execute the MCP tool
          const foundServer = servers.find(s => s.tools?.some(t => t.name === toolCall.function.name));
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log('=== OpenAI Tool Execution Debug ===');
          console.log('Tool name:', toolCall.function.name);
          console.log('Tool arguments:', toolArgs);
          console.log('Found server:', foundServer?.id, foundServer?.name);
          console.log('All servers:', servers.map(s => ({ id: s.id, name: s.name, status: s.status })));

          if (!foundServer) {
            throw new Error(`No server found for tool: ${toolCall.function.name}`);
          }

          // Execute tool directly (lambda-style - no pre-connection needed)
          const baseUrl = `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`;
          const executeUrl = `${baseUrl}/api/mcp/execute`;
          const response = await fetch(executeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              toolName: toolCall.function.name,
              arguments: toolArgs,
              serverId: foundServer.id
            })
          });

          const result = await response.json();
          const toolOutput = result.success ? result.result : { error: result.error };

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool" as const,
            content: JSON.stringify(toolOutput)
          });
        } catch (error) {
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool" as const,
            content: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
          });
        }
      }

      // Get follow-up response with tool results
      const followUpCompletion = await client.chat.completions.create({
        model: "gpt-4",
        messages: [
          systemMessage,
          ...openaiMessages,
          completion.choices[0].message,
          ...toolResults,
          {
            role: "user" as const,
            content: "Please analyze and explain the tool results above. Provide insights and summary."
          }
        ],
        temperature: 0.7
      });

      responseText = followUpCompletion.choices[0].message.content || '';
    }

    console.log('OpenAI Response:', responseText);

    // Create a simple streaming response compatible with useChat
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send the response as a simple text stream
        controller.enqueue(encoder.encode(`0:"${responseText.replace(/"/g, '\\"')}"\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('OpenAI Native API error:', error);
    return NextResponse.json({
      error: 'Failed to process request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}