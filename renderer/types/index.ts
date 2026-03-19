export type AIProvider = 'ollama' | 'gemini' | 'codex' | 'openai' | 'anthropic';
export type LLMProvider = 'codex' | 'openai' | 'anthropic' | 'gemini' | 'ollama';
export type STTProvider = 'deepgram' | 'sarvam' | 'whisper';
export type AIRequestType = 'answer' | 'shorten' | 'recap' | 'followup' | 'custom';
export type ActionType = 'answer' | 'shorten' | 'recap' | 'followup' | 'answer_now' | 'custom';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isError?: boolean;
}

export interface Settings {
  aiProvider: string;
  llmProvider: LLMProvider;
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  geminiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  sttProvider: STTProvider;
  deepgramApiKey: string;
  sarvamApiKey: string;
  deepgramModel: string;
  codexModel: string;
  codexExtraFlags: string;
  googleServiceAccountPath: string;
  transcriptLanguage: string;
  whisperModel: string;
  whisperLanguage: string;
  whisperComputeType: string;
  whisperDevice: string;
  whisperPythonBin: string;
  windowOpacity: number;
  rollingContextSize: number;
  includeOverlayInScreenshots: boolean;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  todayRequests: number;
  todayTokens: number;
}

export interface AIPayload {
  type: AIRequestType;
  userMessage?: string;
  transcript: string;
  screenshot?: string | null;
}

export interface TranscriptEvent {
  text: string;
  isFinal?: boolean;
  timestamp?: number;
}

export interface ContentDimensions {
  width: number;
  height: number;
}

export interface DashboardActionItem {
  text: string;
  owner: string | null;
}

export interface DashboardSummary {
  overview: string;
  topics: string[];
  action_items: DashboardActionItem[];
  decisions: string[];
  follow_ups: string[];
  went_well: string[];
  to_improve: string[];
}

export interface DashboardUtterance {
  id?: number;
  sessionId: string;
  startedMs: number;
  endedMs: number;
  text: string;
  isFinal: boolean;
}

export interface DashboardSessionSummary {
  id: string;
  title: string;
  createdAt: number;
  endedAt: number | null;
  durationMs: number | null;
  providerLlm: string;
  providerStt: string;
  hasSummary: boolean;
  status: 'active' | 'completed';
}

export interface DashboardSession extends DashboardSessionSummary {
  summary: DashboardSummary | null;
  transcript: string;
  utterances: DashboardUtterance[];
}

export interface IPCResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ElectronAPI {
  hideWindow: () => void;
  showWindow: () => void;
  moveWindow: (direction: 'up' | 'down' | 'left' | 'right') => void;
  updateContentDimensions: (dimensions: ContentDimensions) => Promise<void>;
  setWindowOpacity?: (opacity: number) => Promise<void>;
  quitApp: () => void;
  captureFullScreen: () => Promise<string>;
  captureSelectiveScreen: () => Promise<string>;
  startAudioCapture: () => Promise<{ success: boolean; usingNativeCapture?: boolean }>;
  stopAudioCapture: () => Promise<void>;
  pushAudioChunk: (chunk: Uint8Array) => void;
  logDebug?: (payload: { level: 'log' | 'warn' | 'error'; message: string; data?: unknown }) => void;
  onTranscriptInterim?: (callback: (text: string) => void) => () => void;
  onTranscriptUpdate: (callback: (payload: TranscriptEvent) => void) => () => void;
  onTranscriptStatus?: (callback: (payload: { status: string }) => void) => () => void;
  onTranscriptError?: (callback: (payload: { message: string }) => void) => () => void;
  sendMessage: (payload: AIPayload) => Promise<void>;
  onAIChunk: (callback: (chunk: string) => void) => () => void;
  onAIComplete: (callback: () => void) => () => void;
  onAIError: (callback: (error: string) => void) => () => void;
  onTriggerAnswer: (callback: () => void) => () => void;
  onScreenshotCaptured: (callback: (image: string) => void) => () => void;
  getSettings: () => Promise<Settings>;
  getCodexStatus?: () => Promise<{ found: boolean; path: string | null }>;
  saveSettings: (settings: Settings) => Promise<void>;
  endSessionAndReview?: () => Promise<{ success: boolean; sessionId: string | null }>;
  getConversationHistory: () => Promise<Message[]>;
  clearHistory: () => Promise<void>;
  getUsageStats: () => Promise<UsageStats>;
  setScreenshotOverlayVisibility?: (visible: boolean) => Promise<void>;
  openFileDialog?: () => Promise<string | null>;
  testLLMConnection?: (config: unknown) => Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
  testSTTConnection?: (config: unknown) => Promise<{ ok: boolean; error?: string }>;
  saveProviderSettings?: (settings: unknown) => Promise<{ ok: boolean }>;
  launchOverlay?: () => Promise<{ ok: boolean }>;
  openSetup?: () => Promise<{ ok: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
