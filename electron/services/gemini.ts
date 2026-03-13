import { GoogleGenerativeAI } from '@google/generative-ai';

export async function streamGeminiResponse(
  prompt: string,
  imageBase64: string | undefined,
  onChunk: (text: string) => void,
  onComplete: () => void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is missing.');
  }

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash-exp'
  });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [{ text: prompt }];
  if (imageBase64) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: 'image/png'
      }
    });
  }

  const result = await model.generateContentStream({
    contents: [
      {
        role: 'user',
        parts
      }
    ]
  });

  try {
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        onChunk(text);
      }
    }
    onComplete();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Gemini request failed.');
  }
}
