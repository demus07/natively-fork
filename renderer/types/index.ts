export type AIProvider = 'ollama' | 'gemini' | 'codex';
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
  llmProvider: 'ollama' | 'gemini';
  geminiApiKey: string;
  geminiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  sttProvider: 'deepgram' | 'whisper';
  deepgramApiKey: string;
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
