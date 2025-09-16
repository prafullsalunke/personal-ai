import { NextRequest, NextResponse } from 'next/server';
import { MCPServer } from '@/types/mcp';
import { MCPDatabase } from '@/lib/database';

export async function POST(request: NextRequest) {
    try {
        const server: MCPServer = await request.json();

        if (!server.id || !server.name || !server.config) {
            return NextResponse.json({
                error: 'Server ID, name, and config are required'
            }, { status: 400 });
        }

        // Save server to database
        MCPDatabase.saveServer(server);

        return NextResponse.json({
            success: true,
            message: 'Server configuration saved successfully'
        });

    } catch (error) {
        console.error('Save server error:', error);
        return NextResponse.json({
            error: 'Failed to save server configuration',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}