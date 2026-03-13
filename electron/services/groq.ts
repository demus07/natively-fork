import Groq from 'groq-sdk';
import type { ChatMessage } from './ollama';

export async function streamGroqResponse(
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onComplete: () => void
): Promise<void> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API key is missing.');
  }

  const groq = new Groq({
    apiKey
  });

  const stream = await groq.chat.completions.create({
    model,
    messages,
    stream: true
  });

  for await (const part of stream) {
    const content = part.choices[0]?.delta?.content;
    if (content) {
      onChunk(content);
    }
  }

  onComplete();
}
