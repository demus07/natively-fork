import type { Settings } from '../renderer/types';
import { WINDOW_DIMENSIONS } from './shared';

export const APP_METADATA = {
  name: 'Natively',
  version: '1.0.0',
  referenceRepository: 'https://github.com/evinjohnn/natively-cluely-ai-assistant'
} as const;

export const APP_BEHAVIOR = {
  alwaysShowSetupOnLaunch: true
} as const;

export const WINDOW_CONFIG = {
  overlay: {
    ...WINDOW_DIMENSIONS,
    maxHeight: 360,
    backgroundColor: '#00000000',
    alwaysOnTopLevel: 'screen-saver' as const
  },
  setup: {
    width: 620,
    height: 740
  },
  dashboard: {
    width: 1100,
    height: 700
  }
} as const;

export const DASHBOARD_WEB_CONFIG = {
  host: '127.0.0.1',
  port: 3967,
  apiBasePath: '/api/dashboard'
} as const;

export const PROVIDER_DEFAULTS = {
  geminiModel: 'gemini-2.5-flash',
  ollamaEndpoint: 'http://192.168.29.234:11434',
  ollamaModel: 'qwen3.5:35b',
  deepgramModel: 'nova-2-meeting',
  sarvamModel: 'saarika:v1',
  whisperModel: 'turbo',
  whisperLanguage: 'en',
  whisperComputeType: 'int8',
  whisperDevice: 'cpu',
  codexModel: ''
} as const;

export const LEGACY_PROVIDER_VALUES = {
  codexUnsupportedDefaultModel: 'codex-4'
} as const;

export const AI_RUNTIME_CONFIG = {
  ollamaRequestTimeoutMs: 30_000,
  sessionSummaryRequestTimeoutMs: 90_000,
  ollamaMaxTokens: 2_048,
  ollamaContextWindow: 8_192,
  ollamaTemperature: 0.2,
  transcriptSegmentCap: 8,
  screenshotCaptureTimeoutMs: 1_500,
  sessionSummaryMaxChars: 12_000,
  sessionSummaryHeadChars: 4_000,
  sessionSummaryTailChars: 8_000,
  sessionSummaryPrompt: `You are summarizing a completed session transcript.

Return ONLY valid JSON. Do not include markdown fences. Do not include commentary.

The JSON must match exactly this shape:
{
  "overview": "string",
  "topics": ["string"],
  "action_items": [{ "text": "string", "owner": "string | null" }],
  "decisions": ["string"],
  "follow_ups": ["string"],
  "went_well": ["string"],
  "to_improve": ["string"]
}

Rules:
- overview must be 2-3 sentences
- topics must be short phrases
- action_items should be concrete and concise
- owner should be null if unknown
- decisions should include only actual conclusions
- follow_ups should be things to do or ask next
- went_well and to_improve should be short bullet-style phrases

Transcript:
{{TRANSCRIPT}}`
} as const;

export const AUDIO_RUNTIME_CONFIG = {
  sampleRate: 16_000,
  channelCount: 1,
  blackholeDeviceMatch: 'blackhole',
  analyserFftSize: 1_024,
  levelLogIntervalMs: 1_000,
  rmsActivityThreshold: 0.005,
  fallbackFlushIntervalMs: 200,
  workletPath: '/audioWorklet.js'
} as const;

export const SCREEN_CAPTURE_CONFIG = {
  previewIntervalMs: 200,
  previewJpegQuality: 0.5,
  frameRateIdeal: 1,
  frameRateMax: 2,
  widthIdeal: 1_920,
  heightIdeal: 1_080
} as const;

export const STT_RUNTIME_CONFIG = {
  sampleRate: 16_000,
  bytesPerSample: 2,
  fastFlushMs: 1_500,
  fullFlushMs: 5_000,
  minFastBufferMs: 800,
  minChunkMs: 5_000,
  maxChunkMs: 8_000,
  silenceThreshold: 0.01,
  silenceFlushMs: 800,
  deepgram: {
    endpoint: 'wss://api.deepgram.com/v1/listen',
    language: 'en-US',
    keepaliveMs: 8_000,
    reconnectDelayMs: 1_500,
    maxReconnectAttempts: 10,
    maxPendingChunks: 50,
    endpointingMs: 100
  }
} as const;

export const UI_LIMITS = {
  opacityMin: 0.7,
  opacityMax: 1,
  opacityStep: 0.01,
  rollingContextMin: 5,
  rollingContextMax: 50,
  rollingContextDefault: 20
} as const;

export const PYTHON_RUNTIME_CONFIG = {
  scriptName: 'transcribe_server.py',
  checkTimeoutMs: 8_000,
  restartDelayMs: 1_200,
  pathCandidates: [
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
    'python3'
  ]
} as const;

export const DATABASE_RUNTIME_CONFIG = {
  migrationTableName: 'schema_migrations'
} as const;

export const SESSION_RUNTIME_CONFIG = {
  titlePrefix: 'Session',
  listLimit: 50 as number,
  statusActive: 'active',
  statusCompleted: 'completed',
  estimatedUtteranceMsPerCharacter: 45,
  minUtteranceDurationMs: 800,
  maxUtteranceDurationMs: 8_000
} as const;

export const SETTINGS_DEFAULTS: Settings = {
  aiProvider: 'codex',
  llmProvider: 'ollama',
  openaiApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  geminiModel: PROVIDER_DEFAULTS.geminiModel,
  ollamaEndpoint: PROVIDER_DEFAULTS.ollamaEndpoint,
  ollamaModel: PROVIDER_DEFAULTS.ollamaModel,
  sttProvider: 'whisper',
  deepgramApiKey: '',
  sarvamApiKey: '',
  deepgramModel: PROVIDER_DEFAULTS.deepgramModel,
  googleServiceAccountPath: '',
  codexModel: PROVIDER_DEFAULTS.codexModel,
  codexExtraFlags: '',
  transcriptLanguage: PROVIDER_DEFAULTS.whisperLanguage,
  whisperModel: PROVIDER_DEFAULTS.whisperModel,
  whisperLanguage: PROVIDER_DEFAULTS.whisperLanguage,
  whisperComputeType: PROVIDER_DEFAULTS.whisperComputeType,
  whisperDevice: PROVIDER_DEFAULTS.whisperDevice,
  whisperPythonBin: '',
  windowOpacity: 0.9,
  rollingContextSize: UI_LIMITS.rollingContextDefault,
  includeOverlayInScreenshots: false
};
