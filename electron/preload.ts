const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const IPC_CHANNELS = {
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
  transcriptInterim: 'transcript-interim',
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

const electronAPI = {
  hideWindow: () => ipcRenderer.invoke(IPC_CHANNELS.hideWindow),
  showWindow: () => ipcRenderer.invoke(IPC_CHANNELS.showWindow),
  moveWindow: (direction: 'up' | 'down' | 'left' | 'right') =>
    ipcRenderer.invoke(IPC_CHANNELS.moveWindow, direction),
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateContentDimensions, dimensions),
  setWindowOpacity: (opacity: number) => ipcRenderer.invoke(IPC_CHANNELS.setWindowOpacity, opacity),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.quitApp),
  captureFullScreen: () => ipcRenderer.invoke(IPC_CHANNELS.captureFullScreen) as Promise<string>,
  captureSelectiveScreen: () => ipcRenderer.invoke(IPC_CHANNELS.captureSelectiveScreen) as Promise<string>,
  setScreenshotOverlayVisibility: (visible: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setScreenshotOverlayVisibility, visible) as Promise<void>,
  startAudioCapture: () =>
    ipcRenderer.invoke(IPC_CHANNELS.startAudioCapture) as Promise<{ success: boolean; usingNativeCapture?: boolean }>,
  stopAudioCapture: () => ipcRenderer.invoke(IPC_CHANNELS.stopAudioCapture) as Promise<void>,
  pushAudioChunk: (chunk: Uint8Array) => ipcRenderer.send(IPC_CHANNELS.pushAudioChunk, chunk),
  logDebug: (payload: { level: 'log' | 'warn' | 'error'; message: string; data?: unknown }) =>
    ipcRenderer.send(IPC_CHANNELS.rendererDebugLog, payload),
  onTranscriptUpdate: (callback: (payload: { text: string; timestamp?: number; isFinal?: boolean }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { text: string; timestamp?: number; isFinal?: boolean }
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.transcriptUpdate, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.transcriptUpdate, listener);
  },
  onTranscriptInterim: (callback: (text: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on(IPC_CHANNELS.transcriptInterim, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.transcriptInterim, listener);
  },
  onTranscriptStatus: (callback: (payload: { status: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { status: string }) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.transcriptStatus, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.transcriptStatus, listener);
  },
  onTranscriptError: (callback: (payload: { message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { message: string }) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.transcriptError, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.transcriptError, listener);
  },
  sendMessage: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.sendAIMessage, payload),
  onAIChunk: (callback: (chunk: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.aiChunk, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.aiChunk, listener);
  },
  onAIComplete: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.aiComplete, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.aiComplete, listener);
  },
  onAIError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.aiError, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.aiError, listener);
  },
  onTriggerAnswer: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.triggerAnswer, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.triggerAnswer, listener);
  },
  onScreenshotCaptured: (callback: (image: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, image: string) => callback(image);
    ipcRenderer.on(IPC_CHANNELS.screenshotCaptured, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.screenshotCaptured, listener);
  },
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.getSettings),
  getCodexStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getCodexStatus),
  saveSettings: (settings: unknown) => ipcRenderer.invoke(IPC_CHANNELS.saveSettings, settings),
  getConversationHistory: () => ipcRenderer.invoke(IPC_CHANNELS.getConversationHistory),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.clearHistory) as Promise<void>,
  getUsageStats: () => ipcRenderer.invoke(IPC_CHANNELS.getUsageStats),
  testLLMConnection: (config: unknown) => ipcRenderer.invoke('setup:testLLM', config),
  testSTTConnection: (config: unknown) => ipcRenderer.invoke('setup:testSTT', config),
  saveProviderSettings: (settings: unknown) => ipcRenderer.invoke('setup:saveSettings', settings),
  launchOverlay: () => ipcRenderer.invoke('setup:complete'),
  openSetup: () => ipcRenderer.invoke('setup:open')
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
