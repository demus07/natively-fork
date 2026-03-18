import type { LLMProvider } from '../providers/LLMProvider';
import type { STTProvider } from '../providers/STTProvider';
import { DeepgramProvider } from '../providers/DeepgramProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { WhisperProvider } from '../providers/WhisperProvider';

export interface ProviderSettings {
  llmProvider: 'ollama' | 'gemini';
  geminiApiKey: string;
  geminiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  sttProvider: 'deepgram' | 'whisper';
  deepgramApiKey: string;
  deepgramModel: string;
  whisperModel: string;
  whisperLanguage: string;
  whisperComputeType: string;
  whisperDevice: string;
  whisperPythonBin: string;
}

class ProviderRegistry {
  private llm: LLMProvider | null = null;
  private stt: STTProvider | null = null;

  initFromSettings(settings: Partial<ProviderSettings>): void {
    if (settings.llmProvider === 'gemini' && settings.geminiApiKey) {
      this.llm = new GeminiProvider({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel || 'gemini-2.5-flash'
      });
    } else {
      this.llm = new OllamaProvider({
        endpoint: settings.ollamaEndpoint || 'http://192.168.29.234:11434',
        model: settings.ollamaModel || 'qwen3.5:35b',
        numCtx: 8192,
        maxTokens: 2048
      });
    }

    if (this.stt) {
      this.stt.stop();
      this.stt.removeAllListeners();
    }

    if (settings.sttProvider === 'deepgram' && settings.deepgramApiKey) {
      this.stt = new DeepgramProvider({
        apiKey: settings.deepgramApiKey,
        model: settings.deepgramModel || 'nova-2-meeting'
      });
    } else {
      this.stt = new WhisperProvider({
        model: settings.whisperModel || 'turbo',
        language: settings.whisperLanguage || 'en',
        computeType: settings.whisperComputeType || 'int8',
        device: settings.whisperDevice || 'cpu',
        pythonBin: settings.whisperPythonBin || ''
      });
    }

    console.log(`[REGISTRY] LLM: ${this.llm?.name ?? 'none'}, STT: ${this.stt?.name ?? 'none'}`);
  }

  getLLM(): LLMProvider {
    if (!this.llm) {
      throw new Error('LLM provider not initialised — complete setup first');
    }
    return this.llm;
  }

  getSTT(): STTProvider {
    if (!this.stt) {
      throw new Error('STT provider not initialised — complete setup first');
    }
    return this.stt;
  }

  isReady(): boolean {
    return this.llm !== null && this.stt !== null;
  }
}

export const registry = new ProviderRegistry();
