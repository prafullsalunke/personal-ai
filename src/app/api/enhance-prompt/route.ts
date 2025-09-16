import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const { prompt } = await request.json();

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return NextResponse.json(
                { error: 'No prompt provided' },
                { status: 400 }
            );
        }

        const systemPrompt = `You are an expert prompt engineer. Your task is to enhance user prompts to make them more precise, clear, and effective for AI models.

Guidelines for enhancement:
1. Maintain the original intent and core meaning
2. Add specific details and context where helpful
3. Structure the prompt for better clarity
4. Include relevant constraints or requirements
5. Make it more actionable and specific
6. Keep it concise but comprehensive
7. Use clear, direct language

Return ONLY the enhanced prompt, nothing else. No explanations, no meta-commentary, just the improved prompt.`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: systemPrompt
                },
                {
                    role: 'user',
                    content: `Please enhance this prompt: "${prompt.trim()}"`
                }
            ],
            max_tokens: 500,
            temperature: 0.3, // Lower temperature for more consistent, focused results
        });

        const enhancedPrompt = completion.choices[0]?.message?.content?.trim();

        if (!enhancedPrompt) {
            throw new Error('No enhanced prompt received from AI');
        }

        return NextResponse.json({
            enhancedPrompt,
            success: true
        });

    } catch (error) {
        console.error('Prompt enhancement error:', error);
        return NextResponse.json(
            {
                error: 'Failed to enhance prompt',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
