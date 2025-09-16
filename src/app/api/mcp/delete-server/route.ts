import { NextRequest, NextResponse } from 'next/server';
import { MCPDatabase } from '@/lib/database';
import { mcpConnectionManager } from '@/lib/mcp-connections';

export async function POST(request: NextRequest) {
    try {
        const { serverId } = await request.json();

        if (!serverId) {
            return NextResponse.json({
                error: 'Server ID is required'
            }, { status: 400 });
        }

        // Clean up any active connection for this server
        mcpConnectionManager.deleteConnection(serverId);

        // Delete server from database (this also deletes associated tools due to CASCADE)
        MCPDatabase.deleteServer(serverId);

        return NextResponse.json({
            success: true,
            message: 'Server deleted successfully'
        });

    } catch (error) {
        console.error('Delete server error:', error);
        return NextResponse.json({
            error: 'Failed to delete server',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}