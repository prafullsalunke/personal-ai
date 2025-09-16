import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { MCPServer } from '@/types/mcp';

// Load MCP servers from localStorage (this would be passed from the client in a real implementation)
function getMCPServers(): MCPServer[] {
  // For now, return mock servers - in real implementation, this would come from the client
  return [
    {
      id: '1',
      name: 'Calculator Server',
      config: {
        command: 'python',
        args: ['-m', 'calculator_server'],
        env: {},
        transport: 'stdio'
      },
      enabled: true,
      status: 'connected',
      tools: [
        {
          name: 'calculator',
          description: 'Perform mathematical calculations',
          inputSchema: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'Mathematical expression to evaluate'
              }
            },
            required: ['expression']
          }
        }
      ]
    }
  ];
}

export async function POST(req: Request) {
  const { messages, mcpServers }: { messages: UIMessage[]; mcpServers?: MCPServer[] } = await req.json();

  // Get available MCP servers (tools integration will be added later)
  const servers = mcpServers || getMCPServers();
  const connectedServers = servers.filter(server => server.enabled && server.status === 'connected');

  const systemPrompt = `You are a helpful, knowledgeable, and versatile AI assistant.

${connectedServers.length > 0 ? `You have access to ${connectedServers.length} MCP server(s): ${connectedServers.map(s => s.name).join(', ')}.` : ''}

Be conversational, helpful, and provide comprehensive responses when appropriate.`;

  const result = streamText({
    model: openai('gpt-4'),
    system: systemPrompt,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}