import { NextRequest, NextResponse } from 'next/server';
import { MCPServer, MCPTool } from '@/types/mcp';
import { ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { mcpConnectionManager } from '@/lib/mcp-connections';
import { MCPDatabase } from '@/lib/database';

export async function POST(request: NextRequest) {
    try {
        const server: MCPServer = await request.json();

        if (!server || !server.config) {
            return NextResponse.json({
                error: 'Invalid server configuration - missing config'
            }, { status: 400 });
        }

        if (server.config.transport === 'sse') {
            // For SSE servers, use MCP SSE client
            try {
                if (!server.config.url) {
                    return NextResponse.json({
                        error: 'URL is required for SSE transport'
                    }, { status: 400 });
                }

                // Clean up any existing connection for this server
                mcpConnectionManager.deleteConnection(server.id);

                const transport = new SSEClientTransport(
                    new URL(server.config.url),
                    {
                        requestInit: {
                            headers: server.config.headers || {}
                        }
                    }
                );

                const client = new Client(
                    { name: 'personal-ai-client', version: '1.0.0' },
                    { capabilities: { tools: {} } }
                );

                const connectPromise = client.connect(transport);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('SSE connection timeout')), 10000)
                );

                await Promise.race([connectPromise, timeoutPromise]);
                console.log(`SSE connection successful for server ${server.id}`);

                const toolsResult = await client.listTools();
                console.log(`Found ${toolsResult.tools?.length || 0} tools for server ${server.id}`);

                // For SSE, we don't have a process to manage, so we'll store just the client
                mcpConnectionManager.setConnection(server.id, client, null);
                console.log(`SSE connection stored for server ${server.id}`);

                const tools: MCPTool[] = (toolsResult.tools || []).map((tool: { name: string; description?: string; inputSchema?: unknown }) => ({
                    name: tool.name,
                    description: tool.description || '',
                    inputSchema: (tool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {}, required: [] }
                }));

                // Save server and tools to database
                const serverWithStatus = { ...server, status: 'connected' as const };
                MCPDatabase.saveServer(serverWithStatus);
                MCPDatabase.saveTools(server.id, tools);

                return NextResponse.json({
                    success: true,
                    tools,
                    serverInfo: { name: server.name, version: '1.0.0', description: 'MCP SSE Server' }
                });

            } catch (error) {
                console.error('SSE MCP connection error:', error);
                return NextResponse.json({
                    error: 'SSE connection failed: ' + (error instanceof Error ? error.message : 'Unknown error')
                }, { status: 400 });
            }
        } else if (server.config.transport === 'stdio' && server.config.command) {
            // For STDIO servers, start the process and communicate via MCP protocol
            try {
                // Clean up any existing connection for this server
                mcpConnectionManager.deleteConnection(server.id);

                // Create MCP client with stdio transport
                const transport = new StdioClientTransport({
                    command: server.config.command,
                    args: server.config.args || [],
                    env: server.config.env || {}
                });

                const client = new Client(
                    {
                        name: 'personal-ai-client',
                        version: '1.0.0',
                    },
                    {
                        capabilities: {
                            tools: {},
                        },
                    }
                );

                // Connect to the server with timeout
                const connectPromise = client.connect(transport);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), 10000)
                );

                await Promise.race([connectPromise, timeoutPromise]);

                // List available tools (client automatically initializes on connect)
                const toolsResult = await client.listTools();

                // Get the process from the transport for cleanup
                const process = (transport as unknown as { process: ChildProcess }).process;

                // Store the connection for later use
                mcpConnectionManager.setConnection(server.id, client, process);

                const tools: MCPTool[] = (toolsResult.tools || []).map((tool: { name: string; description?: string; inputSchema?: unknown }) => ({
                    name: tool.name,
                    description: tool.description || '',
                    inputSchema: (tool.inputSchema as Record<string, unknown>) || {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                }));

                // Save server and tools to database
                const serverWithStatus = { ...server, status: 'connected' as const };
                MCPDatabase.saveServer(serverWithStatus);
                MCPDatabase.saveTools(server.id, tools);

                return NextResponse.json({
                    success: true,
                    tools,
                    serverInfo: {
                        name: server.name,
                        version: '1.0.0',
                        description: 'MCP Server'
                    }
                });

            } catch (error) {
                console.error('STDIO MCP connection error:', error);
                return NextResponse.json({
                    error: 'STDIO connection failed: ' + (error instanceof Error ? error.message : 'Unknown error')
                }, { status: 400 });
            }
        } else {
            return NextResponse.json({
                error: 'Invalid server configuration'
            }, { status: 400 });
        }
    } catch (error) {
        console.error('MCP connection test error:', error);
        return NextResponse.json({
            error: 'Failed to test MCP connection',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}