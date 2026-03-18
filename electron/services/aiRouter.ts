import type { AIPayload, Settings } from '../../renderer/types';
import { getSettingsCache } from './database';
import { registry } from './providerRegistry';
import type { BrowserWindow } from 'electron';

const SYSTEM_PROMPT = `You are Natively, a real-time AI assistant helping during meetings, interviews, and conversations.
Use the attached screenshot as the current source of visual truth whenever one is available.
Answer directly, concretely, and with strong situational awareness.
Keep answers concise unless the prompt explicitly asks for structure or detail.
When providing code, always wrap it in a markdown code block with the language specified. Use inline backticks for inline code.`;

function formatTranscriptContext(transcript: string, rollingContextSize: number): string {
  const segments = transcript
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-Math.min(rollingContextSize, 8));

  return [
    '[LIVE TRANSCRIPT - last segments]',
    segments.length > 0 ? segments.join('\n') : '(no transcript yet)',
    '',
    '[SCREEN CONTEXT - see attached image]'
  ].join('\n');
}

export function buildAnswerPrompt(transcript: string): string {
  return `You are a real-time meeting and interview assistant. You have access to the current screen (attached image) and a live transcript of the ongoing conversation.

Based on the screen content and conversation so far, determine what question or problem is being presented and provide the best, most direct answer or response.

Be concise. Respond as if you are coaching the user on exactly what to say next. If there is a coding problem, solve it. If there is a question, answer it. If there is a concept, explain it clearly.

LIVE TRANSCRIPT:
${transcript || '(no transcript yet)'}`;
}

export function buildShortenPrompt(lastResponse: string): string {
  return `Take the following response and make it significantly more concise while keeping all critical information. Remove filler words and unnecessary elaboration. Aim for 40% shorter.

RESPONSE TO SHORTEN:
${lastResponse}`;
}

export function buildRecapPrompt(transcript: string): string {
  return `Based on the following conversation transcript and current screen, provide a clear structured summary of:
1. What has been discussed so far
2. Key decisions or conclusions reached
3. Any open questions or next steps

Keep it brief and scannable.

FULL TRANSCRIPT:
${transcript || '(no transcript yet)'}`;
}

export function buildFollowUpPrompt(transcript: string): string {
  return `You are a strategic conversation coach. Based on the transcript and screen context, suggest the 2-3 most useful follow-up questions the user could ask right now to drive the conversation forward, clarify something important, or demonstrate deeper understanding.

Format as a numbered list. Keep each question short and natural-sounding.

LIVE TRANSCRIPT:
${transcript || '(no transcript yet)'}`;
}

export function buildCustomPrompt(userMessage: string, transcript: string): string {
  return `You are a helpful AI assistant with access to the user's screen and a live conversation transcript.

The user is asking: ${userMessage}

Use the screen content and transcript as context to give the most accurate and helpful answer possible.

LIVE TRANSCRIPT:
${transcript || '(no transcript yet)'}`;
}

function buildPrompt(payload: AIPayload): string {
  switch (payload.type) {
    case 'answer':
      return buildAnswerPrompt(payload.transcript);
    case 'shorten':
      return buildShortenPrompt(payload.userMessage ?? '');
    case 'recap':
      return buildRecapPrompt(payload.transcript);
    case 'followup':
      return buildFollowUpPrompt(payload.transcript);
    case 'custom':
    default:
      return buildCustomPrompt(payload.userMessage ?? '', payload.transcript);
  }
}

export async function routeAIRequest(
  payload: AIPayload,
  _mainWindow: BrowserWindow
): Promise<{ provider: Settings['aiProvider'] | Settings['llmProvider']; prompt: string; response: string }> {
  const settings = getSettingsCache();
  const transcriptContext = formatTranscriptContext(payload.transcript, settings.rollingContextSize);
  const prompt = `${SYSTEM_PROMPT}\n\n${transcriptContext}\n\n[USER REQUEST]\n${buildPrompt(payload)}`;

  const response = await registry.getLLM().stream(prompt, payload.screenshot ?? null, _mainWindow);

  return { provider: settings.llmProvider || settings.aiProvider, prompt, response };
}
