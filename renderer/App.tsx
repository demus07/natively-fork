import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  AUDIO_RUNTIME_CONFIG,
  SCREEN_CAPTURE_CONFIG,
  WINDOW_CONFIG
} from '../src/config';
import ChatPanel from './components/ChatPanel';
import QuickActions from './components/QuickActions';
import SettingsModal from './components/SettingsModal';
import TitleBar from './components/TitleBar';
import TranscriptPanel from './components/TranscriptPanel';
import { useAI } from './hooks/useAI';
import { useAudio } from './hooks/useAudio';
import { useScreenshot } from './hooks/useScreenshot';
import { useSettings } from './hooks/useSettings';
import { resetTranscriptStore, useTranscript } from './hooks/useTranscript';
import type { ActionType, AIRequestType, Message } from './types';

type StreamState = 'idle' | 'active' | 'not-found' | 'error';

interface AudioDiagnosticStatus {
  mic?: StreamState;
  blackhole?: StreamState;
  pcmBytesPerSec?: number;
  whisperStatus?: string;
  whisperPreview?: string;
}

interface AudioCaptureController {
  stop: () => Promise<void> | void;
}

function logToTerminal(level: 'log' | 'warn' | 'error', message: string, data?: unknown): void {
  window.electronAPI.logDebug?.({ level, message, data });
}

function rmsLevel(data: Float32Array): number {
  if (data.length === 0) {
    return 0;
  }

  let sumSquares = 0;
  for (let i = 0; i < data.length; i += 1) {
    sumSquares += data[i] * data[i];
  }

  return Math.sqrt(sumSquares / data.length);
}

function createMessage(role: Message['role'], content: string, isError = false): Message {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
    isError
  };
}

function appendUniqueSystemMessage(
  setMessages: Dispatch<SetStateAction<Message[]>>,
  content: string
): void {
  setMessages((current) => {
    const last = current[current.length - 1];
    if (last?.role === 'system' && last.content === content) {
      return current;
    }

    return [...current, createMessage('system', content, true)];
  });
}

function updateDiagnostic(
  setDiagnostic: Dispatch<SetStateAction<AudioDiagnosticStatus>>,
  patch: AudioDiagnosticStatus
): void {
  setDiagnostic((current) => ({ ...current, ...patch }));
}

async function startAudioCapture(
  onStatusUpdate: (status: AudioDiagnosticStatus) => void
): Promise<AudioCaptureController | null> {
  const isMac = navigator.userAgent.includes('Macintosh');
  logToTerminal('log', '[AUDIO] Starting renderer capture pipeline', { isMac });

  let micStream: MediaStream | null = null;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: AUDIO_RUNTIME_CONFIG.sampleRate,
        channelCount: AUDIO_RUNTIME_CONFIG.channelCount
      }
    });
    logToTerminal('log', '[AUDIO] Mic stream active', {
      trackCount: micStream.getAudioTracks().length,
      label: micStream.getAudioTracks()[0]?.label ?? 'unknown',
      settings: micStream.getAudioTracks()[0]?.getSettings?.()
    });
    onStatusUpdate({ mic: 'active' });
  } catch (error) {
    logToTerminal('error', '[AUDIO] Mic access failed', error);
    onStatusUpdate({ mic: 'error' });
  }

  let systemStream: MediaStream | null = null;
  if (isMac) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      logToTerminal(
        'log',
        '[AUDIO] Enumerated audioinput devices',
        devices
          .filter((device) => device.kind === 'audioinput')
          .map((device) => ({ label: device.label, id: device.deviceId.slice(0, 8) }))
      );
      const blackholeDevice = devices.find(
        (device) =>
          device.kind === 'audioinput' &&
          device.label.toLowerCase().includes(AUDIO_RUNTIME_CONFIG.blackholeDeviceMatch)
      );

      if (blackholeDevice) {
        logToTerminal('log', '[AUDIO] BlackHole candidate found', {
          label: blackholeDevice.label,
          id: blackholeDevice.deviceId.slice(0, 8)
        });
        onStatusUpdate({ blackhole: 'idle' });
        try {
          systemStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: blackholeDevice.deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              channelCount: AUDIO_RUNTIME_CONFIG.channelCount
            }
          });
          logToTerminal('log', '[AUDIO] BlackHole stream active', {
            trackCount: systemStream.getAudioTracks().length,
            label: systemStream.getAudioTracks()[0]?.label ?? 'unknown',
            settings: systemStream.getAudioTracks()[0]?.getSettings?.()
          });
          onStatusUpdate({ blackhole: 'active' });
        } catch (error) {
          logToTerminal('warn', '[AUDIO] BlackHole found but could not open', error);
          onStatusUpdate({ blackhole: 'error' });
        }
      } else {
        logToTerminal('warn', '[AUDIO] BlackHole device not found in enumerateDevices()');
        onStatusUpdate({ blackhole: 'not-found' });
      }
    } catch (error) {
      logToTerminal('warn', '[AUDIO] Could not enumerate audio devices', error);
      onStatusUpdate({ blackhole: 'error' });
    }
  }

  if (!micStream && !systemStream) {
    logToTerminal('error', '[AUDIO] No audio streams available');
    return null;
  }

  const audioCtx = new AudioContext({ sampleRate: AUDIO_RUNTIME_CONFIG.sampleRate, latencyHint: 'interactive' });
  await audioCtx.resume().catch(() => undefined);
  logToTerminal('log', '[AUDIO] AudioContext ready', {
    sampleRate: audioCtx.sampleRate,
    state: audioCtx.state
  });

  try {
    await audioCtx.audioWorklet.addModule(AUDIO_RUNTIME_CONFIG.workletPath);
    logToTerminal('log', '[AUDIO] AudioWorklet module loaded');
  } catch (error) {
    logToTerminal('error', '[AUDIO] Failed to load AudioWorklet module', error);
    return startAudioCaptureFallback(micStream, systemStream, audioCtx, onStatusUpdate);
  }

  const workletNode = new AudioWorkletNode(audioCtx, 'pcm-extractor');
  const meterNodes: Array<{ analyser: AnalyserNode; label: string }> = [];
  let levelTimer: number | null = null;
  let bytesThisSecond = 0;
  let lastBytesReport = Date.now();

  workletNode.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer }>) => {
    const pcmBuffer = event.data?.pcm;
    if (!pcmBuffer) {
      return;
    }

    const byteArray = new Uint8Array(pcmBuffer);
    bytesThisSecond += byteArray.length;

    const now = Date.now();
    if (now - lastBytesReport >= AUDIO_RUNTIME_CONFIG.levelLogIntervalMs) {
      logToTerminal('log', `[AUDIO] Worklet PCM throughput: ${bytesThisSecond} bytes/s`);
      onStatusUpdate({ pcmBytesPerSec: bytesThisSecond });
      bytesThisSecond = 0;
      lastBytesReport = now;
    }

    window.electronAPI.pushAudioChunk(byteArray);
  };

  if (micStream) {
    const micSource = audioCtx.createMediaStreamSource(micStream);
    const micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = AUDIO_RUNTIME_CONFIG.analyserFftSize;
    micSource.connect(micAnalyser);
    micSource.connect(workletNode);
    meterNodes.push({ analyser: micAnalyser, label: 'mic' });
  }

  if (systemStream) {
    const systemSource = audioCtx.createMediaStreamSource(systemStream);
    const systemAnalyser = audioCtx.createAnalyser();
    systemAnalyser.fftSize = AUDIO_RUNTIME_CONFIG.analyserFftSize;
    systemSource.connect(systemAnalyser);
    systemSource.connect(workletNode);
    meterNodes.push({ analyser: systemAnalyser, label: 'blackhole' });
  }

  const sink = audioCtx.createGain();
  sink.gain.value = 0;
  workletNode.connect(sink);
  sink.connect(audioCtx.destination);

  if (meterNodes.length > 0) {
    levelTimer = window.setInterval(() => {
      for (const meter of meterNodes) {
        const data = new Float32Array(meter.analyser.fftSize);
        meter.analyser.getFloatTimeDomainData(data);
        const level = rmsLevel(data);
        logToTerminal(
          'log',
          `[AUDIO] ${meter.label} rms=${level.toFixed(5)} active=${level > AUDIO_RUNTIME_CONFIG.rmsActivityThreshold}`
        );
      }
    }, AUDIO_RUNTIME_CONFIG.levelLogIntervalMs);
  }

  return {
    stop: async () => {
      if (levelTimer) {
        window.clearInterval(levelTimer);
      }
      workletNode.disconnect();
      sink.disconnect();
      micStream?.getTracks().forEach((track) => track.stop());
      systemStream?.getTracks().forEach((track) => track.stop());
      await audioCtx.close().catch(() => undefined);
    }
  };
}

function startAudioCaptureFallback(
  micStream: MediaStream | null,
  systemStream: MediaStream | null,
  audioCtx: AudioContext,
  onStatusUpdate: (status: AudioDiagnosticStatus) => void
): AudioCaptureController {
  logToTerminal('warn', '[AUDIO] Using ScriptProcessor fallback');
  const processor = audioCtx.createScriptProcessor(4096, AUDIO_RUNTIME_CONFIG.channelCount, AUDIO_RUNTIME_CONFIG.channelCount);
  const sink = audioCtx.createGain();
  sink.gain.value = 0;
  const meterNodes: Array<{ analyser: AnalyserNode; label: string }> = [];
  let levelTimer: number | null = null;
  let accumulator: Int16Array[] = [];
  let lastSend = Date.now();
  let bytesThisSecond = 0;
  let lastBytesReport = Date.now();

  processor.onaudioprocess = (event) => {
    const float32 = event.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    accumulator.push(int16);
    const now = Date.now();

    if (now - lastSend >= AUDIO_RUNTIME_CONFIG.fallbackFlushIntervalMs) {
      const totalLength = accumulator.reduce((sum, chunk) => sum + chunk.length, 0);
      const merged = new Int16Array(totalLength);
      let offset = 0;
      for (const chunk of accumulator) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      accumulator = [];
      lastSend = now;
      const bytes = new Uint8Array(merged.buffer);
      bytesThisSecond += bytes.length;
      window.electronAPI.pushAudioChunk(bytes);
    }

    if (now - lastBytesReport >= AUDIO_RUNTIME_CONFIG.levelLogIntervalMs) {
      logToTerminal('log', `[AUDIO] Fallback PCM throughput: ${bytesThisSecond} bytes/s`);
      onStatusUpdate({ pcmBytesPerSec: bytesThisSecond });
      bytesThisSecond = 0;
      lastBytesReport = now;
    }
  };

  if (micStream) {
    const micSource = audioCtx.createMediaStreamSource(micStream);
    const micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = AUDIO_RUNTIME_CONFIG.analyserFftSize;
    micSource.connect(micAnalyser);
    micSource.connect(processor);
    meterNodes.push({ analyser: micAnalyser, label: 'mic' });
  }

  if (systemStream) {
    const systemSource = audioCtx.createMediaStreamSource(systemStream);
    const systemAnalyser = audioCtx.createAnalyser();
    systemAnalyser.fftSize = AUDIO_RUNTIME_CONFIG.analyserFftSize;
    systemSource.connect(systemAnalyser);
    systemSource.connect(processor);
    meterNodes.push({ analyser: systemAnalyser, label: 'blackhole' });
  }

  processor.connect(sink);
  sink.connect(audioCtx.destination);

  if (meterNodes.length > 0) {
    levelTimer = window.setInterval(() => {
      for (const meter of meterNodes) {
        const data = new Float32Array(meter.analyser.fftSize);
        meter.analyser.getFloatTimeDomainData(data);
        const level = rmsLevel(data);
        logToTerminal(
          'log',
          `[AUDIO] ${meter.label} rms=${level.toFixed(5)} active=${level > AUDIO_RUNTIME_CONFIG.rmsActivityThreshold}`
        );
      }
    }, AUDIO_RUNTIME_CONFIG.levelLogIntervalMs);
  }

  return {
    stop: async () => {
      if (levelTimer) {
        window.clearInterval(levelTimer);
      }
      processor.disconnect();
      sink.disconnect();
      micStream?.getTracks().forEach((track) => track.stop());
      systemStream?.getTracks().forEach((track) => track.stop());
      await audioCtx.close().catch(() => undefined);
    }
  };
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [diagnostic, setDiagnostic] = useState<AudioDiagnosticStatus>({
    mic: 'idle',
    blackhole: 'idle',
    pcmBytesPerSec: 0,
    whisperStatus: 'waiting',
    whisperPreview: ''
  });

  const aiMutation = useAI();
  const { isRecording, startRecording, stopRecording } = useAudio();
  const { finalLines, interimText } = useTranscript();
  const { captureFull } = useScreenshot();
  const { settings, setSettings, saveSettings } = useSettings();

  const transcriptRef = useRef('');
  const screenContextRef = useRef<string | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const displayVideoRef = useRef<HTMLVideoElement | null>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);
  const glassBodyRef = useRef<HTMLDivElement | null>(null);
  const resizeDebounceRef = useRef<number | null>(null);
  const audioControllerRef = useRef<AudioCaptureController | null>(null);
  const transcriptSeenRef = useRef(false);
  const aiCharQueueRef = useRef('');
  const aiDrainTimerRef = useRef<number | null>(null);
  const aiCompletePendingRef = useRef(false);
  const aiErrorPendingRef = useRef<string | null>(null);

  const flushAIState = () => {
    if (aiDrainTimerRef.current) {
      window.clearInterval(aiDrainTimerRef.current);
      aiDrainTimerRef.current = null;
    }
    aiCharQueueRef.current = '';
    aiCompletePendingRef.current = false;
    aiErrorPendingRef.current = null;
  };

  const reportOverlayDimensions = () => {
    const root = overlayRootRef.current;
    if (!root) {
      return;
    }

    void window.electronAPI.updateContentDimensions({
      width: WINDOW_CONFIG.overlay.width,
      height: root.scrollHeight
    });
  };

  const ensureAIDrain = () => {
    if (aiDrainTimerRef.current) {
      return;
    }

    aiDrainTimerRef.current = window.setInterval(() => {
      if (!aiCharQueueRef.current) {
        if (aiCompletePendingRef.current) {
          aiCompletePendingRef.current = false;
          setIsStreaming(false);
          setActiveAction(null);
        }

        if (aiErrorPendingRef.current) {
          const error = aiErrorPendingRef.current;
          aiErrorPendingRef.current = null;
          setMessages((current) => {
            const next = [...current];
            const last = next[next.length - 1];
            if (last?.role === 'assistant' && last.content === '') {
              next.pop();
            }
            next.push(createMessage('system', error, true));
            return next;
          });
          setIsStreaming(false);
          setActiveAction(null);
        }

        if (!aiCompletePendingRef.current && !aiErrorPendingRef.current) {
          window.clearInterval(aiDrainTimerRef.current!);
          aiDrainTimerRef.current = null;
        }
        return;
      }

      const nextChunk = aiCharQueueRef.current.slice(0, 1);
      aiCharQueueRef.current = aiCharQueueRef.current.slice(1);

      setMessages((current) => {
        const next = [...current];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && !last.isError) {
          next[next.length - 1] = { ...last, content: last.content + nextChunk };
          return next;
        }

        next.push(createMessage('assistant', nextChunk));
        return next;
      });
      window.requestAnimationFrame(() => reportOverlayDimensions());
    }, 10);
  };

  useEffect(() => {
    const transcript = finalLines.join('\n');
    transcriptRef.current = transcript;
    if (transcript.trim()) {
      transcriptSeenRef.current = true;
      updateDiagnostic(setDiagnostic, {
        whisperStatus: 'running',
        whisperPreview: transcript.trim().split('\n').at(-1)?.slice(0, 60) ?? ''
      });
    }
  }, [finalLines]);

  useEffect(() => {
    if (typeof settings?.windowOpacity === 'number') {
      void window.electronAPI.setWindowOpacity?.(settings.windowOpacity);
    }
    if (typeof settings?.includeOverlayInScreenshots === 'boolean') {
      void window.electronAPI.setScreenshotOverlayVisibility?.(settings.includeOverlayInScreenshots);
    }
  }, [settings?.windowOpacity, settings?.includeOverlayInScreenshots]);

  useEffect(() => {
    void window.electronAPI.getSettings().then((result) => {
      setSettings(result);
    });

    void window.electronAPI.clearHistory().then(() => {
      setMessages([]);
      resetTranscriptStore();
      transcriptRef.current = '';
      transcriptSeenRef.current = false;
      updateDiagnostic(setDiagnostic, {
        whisperPreview: '',
        whisperStatus: 'waiting'
      });
    });
  }, [setSettings]);

  useEffect(() => {
    const offTranscriptStatus = window.electronAPI.onTranscriptStatus?.((payload) => {
      updateDiagnostic(setDiagnostic, { whisperStatus: payload.status });
    });

    const offTranscriptError = window.electronAPI.onTranscriptError?.((payload) => {
      updateDiagnostic(setDiagnostic, { whisperStatus: `error: ${payload.message.slice(0, 40)}` });
      appendUniqueSystemMessage(setMessages, payload.message);
    });

    const offAIChunk = window.electronAPI.onAIChunk((chunk) => {
      if (!chunk) {
        return;
      }
      aiCharQueueRef.current += chunk;
      ensureAIDrain();
    });

    const offAIComplete = window.electronAPI.onAIComplete(() => {
      aiCompletePendingRef.current = true;
      ensureAIDrain();
    });

    const offAIError = window.electronAPI.onAIError((error) => {
      aiErrorPendingRef.current = error;
      ensureAIDrain();
    });

    const offTriggerAnswer = window.electronAPI.onTriggerAnswer(() => {
      void handleQuickAction('answer_now');
    });

    const offScreenshot = window.electronAPI.onScreenshotCaptured((image) => {
      screenContextRef.current = image;
    });

    return () => {
      flushAIState();
      offTranscriptStatus?.();
      offTranscriptError?.();
      offAIChunk();
      offAIComplete();
      offAIError();
      offTriggerAnswer();
      offScreenshot();
    };
  }, []);

  useEffect(() => {
    const startScreenPreview = async () => {
      const isMac = navigator.userAgent.includes('Macintosh');
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: {
              ideal: SCREEN_CAPTURE_CONFIG.frameRateIdeal,
              max: SCREEN_CAPTURE_CONFIG.frameRateMax
            },
            width: { ideal: SCREEN_CAPTURE_CONFIG.widthIdeal },
            height: { ideal: SCREEN_CAPTURE_CONFIG.heightIdeal }
          },
          audio: isMac
            ? false
            : {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              }
        });

        displayStreamRef.current = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
        displayVideoRef.current = video;
        displayCanvasRef.current = document.createElement('canvas');
      } catch {
        void captureFull()
          .then((image) => {
            screenContextRef.current = image;
          })
          .catch(() => undefined);
      }
    };

    const interval = window.setInterval(() => {
      const video = displayVideoRef.current;
      const canvas = displayCanvasRef.current;

      if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', SCREEN_CAPTURE_CONFIG.previewJpegQuality);
      screenContextRef.current = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
    }, SCREEN_CAPTURE_CONFIG.previewIntervalMs);

    void startScreenPreview();

    return () => {
      window.clearInterval(interval);
      displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [captureFull]);

  useEffect(() => {
    let active = true;

    const bootAudio = async () => {
      const recordingStarted = await startRecording().catch((error) => {
        const message = error instanceof Error ? error.message : 'Unable to start transcript backend.';
        appendUniqueSystemMessage(setMessages, message);
        return false;
      });

      if (!recordingStarted) {
        if (active) {
          updateDiagnostic(setDiagnostic, { mic: 'error', pcmBytesPerSec: 0, whisperStatus: 'error' });
        }
        return;
      }

      const controller = await startAudioCapture((status) => {
        if (!active) {
          return;
        }
        updateDiagnostic(setDiagnostic, status);
      });

      if (!controller) {
        await stopRecording().catch(() => undefined);
        if (active) {
          updateDiagnostic(setDiagnostic, { mic: 'error', pcmBytesPerSec: 0, whisperStatus: 'error' });
          appendUniqueSystemMessage(setMessages, 'Unable to start microphone capture. Toggle the mic to retry.');
        }
        return;
      }

      if (!active) {
        await controller?.stop?.();
        return;
      }

      audioControllerRef.current = controller;
    };

    void captureFull()
      .then((image) => {
        if (active) {
          screenContextRef.current = image;
        }
      })
      .catch(() => undefined);

    void bootAudio();

    return () => {
      active = false;
      void audioControllerRef.current?.stop?.();
      audioControllerRef.current = null;
      void window.electronAPI.stopAudioCapture().catch(() => undefined);
    };
  }, [captureFull, startRecording, stopRecording]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setShowDiagnostics((current) => !current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const element = glassBodyRef.current;
    if (!element) {
      return;
    }

    const reportDimensions = () => {
      if (resizeDebounceRef.current) {
        window.clearTimeout(resizeDebounceRef.current);
      }

      resizeDebounceRef.current = window.setTimeout(() => {
        reportOverlayDimensions();
      }, 80);
    };

    reportDimensions();
    const observer = new ResizeObserver(() => reportDimensions());
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (resizeDebounceRef.current) {
        window.clearTimeout(resizeDebounceRef.current);
      }
    };
  }, [messages, isStreaming, settingsOpen, finalLines, interimText, showDiagnostics]);

  const sendAI = async (payload: { type: AIRequestType; userMessage?: string }) => {
    await aiMutation.mutateAsync({
      type: payload.type,
      userMessage: payload.userMessage,
      transcript: transcriptRef.current,
      screenshot: screenContextRef.current
    });
  };

  const handleQuickAction = async (type: ActionType) => {
    const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant')?.content ?? '';
    const requestType: AIRequestType = type === 'answer_now' ? 'custom' : (type as AIRequestType);
    const userMessage = type === 'answer_now' ? 'Answer using the current context.' : type === 'shorten' ? latestAssistant : undefined;

    logToTerminal('log', '[AI] Quick action triggered', {
      action: type,
      requestType,
      hasTranscript: Boolean(transcriptRef.current.trim()),
      hasScreenshot: Boolean(screenContextRef.current),
      latestAssistantLength: latestAssistant.length
    });

    flushAIState();
    setActiveAction(type);
    setIsStreaming(true);
    setMessages((current) => [...current, createMessage('assistant', '')]);

    await sendAI({ type: requestType, userMessage });
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const whisperLabel = diagnostic.whisperStatus === 'running'
    ? 'ready'
    : diagnostic.whisperStatus === 'starting'
      ? 'loading'
      : diagnostic.whisperStatus || 'waiting';
  const micActive = diagnostic.mic === 'active' && isRecording;
  const blackholeActive = diagnostic.blackhole === 'active' && (diagnostic.pcmBytesPerSec ?? 0) > 0;
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim());
  const hasExpandedAnswer = Boolean(isStreaming || latestAssistant);

  const handleToggleRecording = async () => {
    if (isRecording) {
      await audioControllerRef.current?.stop?.();
      audioControllerRef.current = null;
      await stopRecording();
      updateDiagnostic(setDiagnostic, { mic: 'idle', pcmBytesPerSec: 0, whisperStatus: 'stopped' });
      return;
    }

    const recordingStarted = await startRecording();
    if (!recordingStarted) {
      updateDiagnostic(setDiagnostic, { mic: 'error', pcmBytesPerSec: 0, whisperStatus: 'error' });
      appendUniqueSystemMessage(setMessages, 'Unable to start transcript backend.');
      return;
    }

    const controller = await startAudioCapture((status) => updateDiagnostic(setDiagnostic, status));
    if (!controller) {
      await stopRecording();
      updateDiagnostic(setDiagnostic, { mic: 'error', pcmBytesPerSec: 0, whisperStatus: 'error' });
      appendUniqueSystemMessage(setMessages, 'Unable to start microphone capture. Toggle the mic to retry.');
      return;
    }
    audioControllerRef.current = controller;
  };

  const handleToggleScreenshotOverlay = async () => {
    const next = !settings.includeOverlayInScreenshots;
    const nextSettings = { ...settings, includeOverlayInScreenshots: next };
    setSettings(nextSettings);
    await window.electronAPI.setScreenshotOverlayVisibility?.(next);
    await saveSettings(nextSettings);
  };

  return (
    <div className="app-shell">
      <div className="overlay-column">
        <div id="overlay-root" ref={overlayRootRef} className="overlay-shell">
          <TitleBar
            isRecording={isRecording}
            includeOverlayInScreenshots={settings.includeOverlayInScreenshots}
            onEndAndReview={() => void window.electronAPI.endSessionAndReview?.()}
            onHide={() => void window.electronAPI.hideWindow()}
            onToggleRecording={() => void handleToggleRecording()}
            onToggleScreenshotOverlay={() => void handleToggleScreenshotOverlay()}
          />
          {hasExpandedAnswer ? (
            <ChatPanel messages={messages} isStreaming={isStreaming} onCopyMessage={(text) => void handleCopy(text)} />
          ) : null}
          <div ref={glassBodyRef} className="glass-body">
            <QuickActions
              onAction={(type) => void handleQuickAction(type)}
              isStreaming={isStreaming}
              activeAction={activeAction}
            />
            <TranscriptPanel />
          </div>
          {showDiagnostics ? (
            <div className="diagnostics-strip">
              MIC: {micActive ? '●' : '○'}
              <span className="diagnostics-separator">·</span>
              BH: {blackholeActive ? '●' : '○'}
              <span className="diagnostics-separator">·</span>
              PCM: {Math.round((diagnostic.pcmBytesPerSec ?? 0) / 1024)}kb/s
              <span className="diagnostics-separator">·</span>
              WHISPER: {whisperLabel}
              {diagnostic.whisperPreview ? (
                <>
                  <span className="diagnostics-separator">·</span>
                  {diagnostic.whisperPreview.slice(0, 30)}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
