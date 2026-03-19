import type { BrowserWindow } from 'electron';
import { BrowserWindow as ElectronBrowserWindow } from 'electron';
import { AI_RUNTIME_CONFIG } from '../../src/config';
import { IPC_CHANNELS } from '../../src/shared';
import { dashboardEvents } from './dashboardEvents';
import { registry } from './providerRegistry';
import { sessionService } from './SessionService';
import type { ActionItem, SummaryJson } from './types';

function trimTranscript(transcript: string): string {
  if (transcript.length <= AI_RUNTIME_CONFIG.sessionSummaryMaxChars) {
    return transcript;
  }

  const head = transcript.slice(0, AI_RUNTIME_CONFIG.sessionSummaryHeadChars);
  const tail = transcript.slice(-AI_RUNTIME_CONFIG.sessionSummaryTailChars);
  return `${head}\n...\n${tail}`;
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractLikelyJsonObject(raw: string): string {
  const sanitized = stripJsonFences(raw);
  const firstBrace = sanitized.indexOf('{');
  const lastBrace = sanitized.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return sanitized;
  }
  return sanitized.slice(firstBrace, lastBrace + 1);
}

function extractSummaryJsonCandidate(raw: string): string {
  const sanitized = stripJsonFences(raw);
  const overviewIndex = sanitized.lastIndexOf('"overview"');

  if (overviewIndex !== -1) {
    const start = sanitized.lastIndexOf('{', overviewIndex);
    const end = sanitized.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return sanitized.slice(start, end + 1);
    }
  }

  return extractLikelyJsonObject(sanitized);
}

function parseStringArrayCandidate(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isStringArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseActionItemsCandidate(raw: string): ActionItem[] | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isActionItems(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function findLastLabeledValue(raw: string, label: string): string | null {
  const pattern = new RegExp(`${label}:\\s*(.+)`, 'gi');
  let match: RegExpExecArray | null = null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = pattern.exec(raw)) !== null) {
    lastMatch = match;
  }

  return lastMatch?.[1]?.trim() ?? null;
}

function extractSummaryFromLabeledDraft(raw: string): SummaryJson | null {
  const overview = findLastLabeledValue(raw, 'Overview');
  const topicsRaw = findLastLabeledValue(raw, 'Topics');
  const actionItemsRaw = findLastLabeledValue(raw, 'Action Items');
  const decisionsRaw = findLastLabeledValue(raw, 'Decisions');
  const followUpsRaw = findLastLabeledValue(raw, 'Follow Ups');
  const wentWellRaw = findLastLabeledValue(raw, 'Went Well');
  const toImproveRaw = findLastLabeledValue(raw, 'To Improve');

  if (!overview || !topicsRaw || !followUpsRaw || !wentWellRaw || !toImproveRaw) {
    return null;
  }

  const candidate: SummaryJson = {
    overview,
    topics: parseStringArrayCandidate(topicsRaw) ?? [],
    action_items: parseActionItemsCandidate(actionItemsRaw ?? '[]') ?? [],
    decisions: parseStringArrayCandidate(decisionsRaw ?? '[]') ?? [],
    follow_ups: parseStringArrayCandidate(followUpsRaw) ?? [],
    went_well: parseStringArrayCandidate(wentWellRaw) ?? [],
    to_improve: parseStringArrayCandidate(toImproveRaw) ?? []
  };

  return isSummaryJson(candidate) ? candidate : null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isActionItems(value: unknown): value is ActionItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ActionItem).text === 'string' &&
        (((item as ActionItem).owner === null) || typeof (item as ActionItem).owner === 'string')
    )
  );
}

function isSummaryJson(value: unknown): value is SummaryJson {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as SummaryJson;
  return (
    typeof candidate.overview === 'string' &&
    isStringArray(candidate.topics) &&
    isActionItems(candidate.action_items) &&
    isStringArray(candidate.decisions) &&
    isStringArray(candidate.follow_ups) &&
    isStringArray(candidate.went_well) &&
    isStringArray(candidate.to_improve)
  );
}

function createSilentSummaryWindow(): BrowserWindow {
  return {
    isDestroyed: () => false,
    webContents: {
      send: () => undefined
    }
  } as unknown as BrowserWindow;
}

async function parseSummaryResponse(
  rawResponse: string,
  sinkWindow: BrowserWindow
): Promise<SummaryJson | null> {
  const candidates = [
    stripJsonFences(rawResponse),
    extractSummaryJsonCandidate(rawResponse),
    extractLikelyJsonObject(rawResponse)
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isSummaryJson(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to repair pass.
    }
  }

  const extractedDraft = extractSummaryFromLabeledDraft(rawResponse);
  if (extractedDraft) {
    return extractedDraft;
  }

  const repairPrompt = `Convert the following draft summary into valid JSON only.

Return only a JSON object. Do not include markdown fences. Do not include explanation. Do not include a thinking process.
Start with { and end with }.

Required shape:
{
  "overview": "string",
  "topics": ["string"],
  "action_items": [{ "text": "string", "owner": "string | null" }],
  "decisions": ["string"],
  "follow_ups": ["string"],
  "went_well": ["string"],
  "to_improve": ["string"]
}

If a field has no items, return an empty array.

Draft summary:
${rawResponse}`;

  try {
    const repairedResponse = await registry.getLLM().stream(repairPrompt, null, sinkWindow, {
      timeoutMs: AI_RUNTIME_CONFIG.sessionSummaryRequestTimeoutMs
    });
    const repairedCandidate = extractLikelyJsonObject(repairedResponse);
    const repaired = JSON.parse(repairedCandidate) as unknown;
    return isSummaryJson(repaired) ? repaired : null;
  } catch {
    return null;
  }
}

function emitSummaryUpdate(sessionId: string, summary: SummaryJson): void {
  for (const window of ElectronBrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.SESSION_SUMMARY_UPDATE, { sessionId, summary });
    }
  }
}

export class SummarizationService {
  async summarizeSession(sessionId: string): Promise<void> {
    const session = await sessionService.getSession(sessionId);
    const transcript = trimTranscript(session.transcript);

    console.log('[SUMMARY] Starting session summarization', {
      sessionId,
      transcriptLength: session.transcript.length,
      trimmedLength: transcript.length
    });

    if (!transcript.trim()) {
      console.log('[SUMMARY] Skipping empty transcript summary', { sessionId });
      return;
    }

    const prompt = AI_RUNTIME_CONFIG.sessionSummaryPrompt.replace('{{TRANSCRIPT}}', transcript);
    const sinkWindow = createSilentSummaryWindow();

    try {
      const rawResponse = await registry.getLLM().stream(prompt, null, sinkWindow, {
        timeoutMs: AI_RUNTIME_CONFIG.sessionSummaryRequestTimeoutMs
      });
      const parsed = await parseSummaryResponse(rawResponse, sinkWindow);

      if (!parsed) {
        console.warn('[SUMMARY] LLM returned invalid summary shape', {
          sessionId,
          rawResponse
        });
        return;
      }

      await sessionService.updateSummary(sessionId, parsed);
      dashboardEvents.emitSummaryUpdate({ sessionId, summary: parsed });
      emitSummaryUpdate(sessionId, parsed);
      console.log('[SUMMARY] Session summary stored', { sessionId });
    } catch (error) {
      console.warn('[SUMMARY] Failed to summarize session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export const summarizationService = new SummarizationService();
