import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
        model: openai('gpt-4'),
        system: 'You are a helpful, knowledgeable, and versatile AI assistant. You can help with a wide variety of tasks including answering questions, providing explanations, helping with analysis, creative writing, coding, math, research, and much more. Be conversational, helpful, and provide comprehensive responses when appropriate.',
        messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}