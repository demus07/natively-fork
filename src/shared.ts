export const IPC_CHANNELS = {
  hideWindow: 'window-hide',
  showWindow: 'window-show',
  moveWindow: 'window-move',
  updateContentDimensions: 'window-update-content-dimensions',
  setWindowOpacity: 'window-set-opacity',
  quitApp: 'window-quit',
  triggerAnswer: 'trigger-answer',
  captureFullScreen: 'capture-full-screen',
  captureSelectiveScreen: 'capture-selective-screen',
  setScreenshotOverlayVisibility: 'set-screenshot-overlay-visibility',
  startAudioCapture: 'start-audio-capture',
  stopAudioCapture: 'stop-audio-capture',
  pushAudioChunk: 'push-audio-chunk',
  rendererDebugLog: 'renderer-debug-log',
  transcriptUpdate: 'transcript-update',
  transcriptStatus: 'transcript-status',
  transcriptError: 'transcript-error',
  sendAIMessage: 'send-ai-message',
  aiChunk: 'ai-chunk',
  aiComplete: 'ai-complete',
  aiError: 'ai-error',
  screenshotCaptured: 'screenshot-captured',
  getSettings: 'get-settings',
  getCodexStatus: 'get-codex-status',
  saveSettings: 'save-settings',
  getConversationHistory: 'get-conversation-history',
  clearHistory: 'clear-history',
  getUsageStats: 'get-usage-stats'
} as const;

export const WINDOW_DIMENSIONS = {
  width: 720,
  height: 120,
  minWidth: 720,
  minHeight: 120
} as const;

export const TRANSCRIPT_LIMIT = 2000;
