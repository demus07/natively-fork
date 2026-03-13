export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function streamOllamaResponse(
  model: string,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onComplete: () => void
): Promise<void> {
  const response = await fetch(`http://localhost:11434/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama request failed with status ${response.status}.`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line) as { message?: { content?: string } };
      const content = parsed.message?.content;
      if (content) {
        onChunk(content);
      }
    }
  }

  onComplete();
}
