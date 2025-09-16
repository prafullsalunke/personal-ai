import { NextResponse } from 'next/server';
import { MCPDatabase } from '@/lib/database';

export async function GET() {
    try {
        // Get all servers with their tools
        const servers = MCPDatabase.getAllServersWithTools();

        return NextResponse.json({
            success: true,
            servers
        });

    } catch (error) {
        console.error('Get servers error:', error);
        return NextResponse.json({
            error: 'Failed to retrieve servers',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}