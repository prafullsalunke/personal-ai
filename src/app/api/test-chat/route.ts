import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export async function POST(request: NextRequest) {
    try {
        const { messages } = await request.json();

        const result = streamText({
            model: openai('gpt-4'),
            messages: messages,
        });

        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error('Test chat error:', error);
        return NextResponse.json({
            error: 'Failed to process chat',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
