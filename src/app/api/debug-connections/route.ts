import { NextResponse } from 'next/server';
import { mcpConnectionManager } from '@/lib/mcp-connections';

export async function GET() {
    try {
        const connections = mcpConnectionManager.getAllConnections();
        const connectionInfo = Array.from(connections.entries()).map(([serverId, connection]) => ({
            serverId,
            hasClient: !!connection.client,
            hasProcess: !!connection.process
        }));

        return NextResponse.json({
            success: true,
            activeConnections: connectionInfo.length,
            connections: connectionInfo
        });
    } catch (error) {
        console.error('Debug connections error:', error);
        return NextResponse.json({
            error: 'Failed to get connection info',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
