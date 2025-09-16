import { NextRequest, NextResponse } from 'next/server';
import { MCPToolCall } from '@/types/mcp';
import { mcpConnectionManager } from '@/lib/mcp-connections';

export async function POST(request: NextRequest) {
    try {
        const { toolName, arguments: toolArgs, serverId }: MCPToolCall = await request.json();

        if (!toolName || !serverId) {
            return NextResponse.json(
                { error: 'Tool name and server ID are required' },
                { status: 400 }
            );
        }

        // Get the active connection for this server
        const connection = mcpConnectionManager.getConnection(serverId);

        if (!connection) {
            // No active connection found - user needs to test connection first
            return NextResponse.json(
                { error: 'No active connection found for server. Please test connection first to establish a connection.' },
                { status: 400 }
            );
        }

        try {
            // Execute the tool using the MCP client
            const result = await connection.client.callTool({
                name: toolName,
                arguments: toolArgs
            });

            // Log the raw result for debugging
            console.log('=== MCP TOOL EXECUTION DEBUG ===');
            console.log('Tool name:', toolName);
            console.log('Server ID:', serverId);
            console.log('Raw result:', JSON.stringify(result, null, 2));
            console.log('Result content:', JSON.stringify(result.content, null, 2));
            console.log('Result type:', typeof result);
            console.log('Content type:', typeof result.content);

            return NextResponse.json({
                success: true,
                toolName,
                result: result.content || result,
                timestamp: new Date().toISOString()
            });

        } catch (toolError) {
            console.error('Tool execution error:', toolError);

            // If the connection is broken, remove it from active connections
            if (toolError instanceof Error && (
                toolError.message.includes('connection') ||
                toolError.message.includes('closed') ||
                toolError.message.includes('disconnected')
            )) {
                mcpConnectionManager.deleteConnection(serverId);
            }

            return NextResponse.json(
                {
                    error: 'Tool execution failed: ' + (toolError instanceof Error ? toolError.message : 'Unknown error'),
                    details: toolError
                },
                { status: 400 }
            );
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