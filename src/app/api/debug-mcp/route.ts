import { NextResponse } from 'next/server';
import { MCPDatabase } from '@/lib/database';

export async function GET() {
    try {
        const servers = MCPDatabase.getEnabledServersWithTools();

        return NextResponse.json({
            success: true,
            serversCount: servers.length,
            servers: servers.map(server => ({
                id: server.id,
                name: server.name,
                status: server.status,
                enabled: server.enabled,
                toolsCount: server.tools?.length || 0,
                tools: server.tools?.map(tool => tool.name) || []
            }))
        });
    } catch (error) {
        console.error('Debug MCP error:', error);
        return NextResponse.json({
            error: 'Failed to load MCP servers',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
