import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        return NextResponse.json({
            success: true,
            messagesCount: body.messages?.length || 0,
            messages: body.messages?.map((msg: unknown, index: number) => {
                const message = msg as { id?: string; role?: string; content?: unknown };
                return {
                index,
                id: message.id,
                role: message.role,
                contentType: typeof message.content,
                contentPreview: typeof message.content === 'string' ?
                    message.content.substring(0, 100) :
                    JSON.stringify(message.content).substring(0, 100),
                hasParts: Array.isArray(message.content),
                partsCount: Array.isArray(message.content) ? message.content.length : 0
                };
            }) || []
        });
    } catch (error) {
        console.error('Debug messages error:', error);
        return NextResponse.json({
            error: 'Failed to debug messages',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
