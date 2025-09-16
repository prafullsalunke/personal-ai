import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        // Convert File to Buffer
        const audioBuffer = await audioFile.arrayBuffer();
        const audioBlob = new Blob([audioBuffer], { type: audioFile.type });

        // Create a File object for OpenAI API
        const audioFileForOpenAI = new File([audioBlob], 'audio.webm', {
            type: audioFile.type,
        });

        // Transcribe using OpenAI Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: audioFileForOpenAI,
            model: 'whisper-1',
            language: 'en', // Optional: specify language
            response_format: 'text',
        });

        return NextResponse.json({
            transcription: transcription,
            success: true
        });

    } catch (error) {
        console.error('Transcription error:', error);
        return NextResponse.json(
            {
                error: 'Failed to transcribe audio',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
