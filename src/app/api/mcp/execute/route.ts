import { NextRequest, NextResponse } from 'next/server';
import { MCPToolCall, MCPServer } from '@/types/mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { MCPDatabase } from '@/lib/database';

async function createMCPConnection(server: MCPServer): Promise<Client> {
    if (server.config.transport === 'sse') {
        if (!server.config.url) {
            throw new Error('URL is required for SSE transport');
        }

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
        return client;

    } else if (server.config.transport === 'stdio' && server.config.command) {
        const transport = new StdioClientTransport({
            command: server.config.command,
            args: server.config.args || [],
            env: server.config.env || {}
        });

        const client = new Client(
            { name: 'personal-ai-client', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        const connectPromise = client.connect(transport);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('STDIO connection timeout')), 10000)
        );

        await Promise.race([connectPromise, timeoutPromise]);
        return client;

    } else {
        throw new Error('Invalid server configuration');
    }
}

export async function POST(request: NextRequest) {
    try {
        const { toolName, arguments: toolArgs, serverId }: MCPToolCall = await request.json();

        if (!toolName || !serverId) {
            return NextResponse.json(
                { error: 'Tool name and server ID are required' },
                { status: 400 }
            );
        }

        console.log('=== MCP LAMBDA EXECUTE DEBUG ===');
        console.log('Tool name:', toolName);
        console.log('Server ID:', serverId);

        // Get server configuration from database
        const server = MCPDatabase.getServer(serverId);
        if (!server) {
            return NextResponse.json(
                { error: `Server with ID ${serverId} not found` },
                { status: 404 }
            );
        }

        let client: Client | null = null;

        try {
            // Create connection on-demand (lambda-style)
            console.log(`Creating on-demand connection to ${server.name} (${server.config.transport})`);
            client = await createMCPConnection(server);
            console.log(`Connection established successfully for ${server.name}`);

            // Execute the tool
            const result = await client.callTool({
                name: toolName,
                arguments: toolArgs
            });

            console.log('=== MCP TOOL EXECUTION SUCCESS ===');
            console.log('Tool name:', toolName);
            console.log('Server:', server.name);

            return NextResponse.json({
                success: true,
                toolName,
                result: result.content || result,
                timestamp: new Date().toISOString()
            });

        } catch (toolError) {
            console.error('Tool execution error:', toolError);

            return NextResponse.json(
                {
                    error: 'Tool execution failed: ' + (toolError instanceof Error ? toolError.message : 'Unknown error'),
                    details: toolError
                },
                { status: 400 }
            );

        } finally {
            // Clean up connection (or keep it alive for conversation duration if needed)
            if (client) {
                try {
                    await client.close();
                    console.log(`Connection closed for ${server.name}`);
                } catch (closeError) {
                    console.warn('Error closing connection:', closeError);
                }
            }
        }

    } catch (error) {
        console.error('MCP tool execution error:', error);
        return NextResponse.json(
            {
                error: 'Failed to execute MCP tool',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}