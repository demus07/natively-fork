import type { LLMProvider } from '../providers/LLMProvider';
import type { STTProvider } from '../providers/STTProvider';
import { DeepgramProvider } from '../providers/DeepgramProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { WhisperProvider } from '../providers/WhisperProvider';
import { AI_RUNTIME_CONFIG, PROVIDER_DEFAULTS } from '../../src/config';

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
        model: settings.geminiModel || PROVIDER_DEFAULTS.geminiModel
      });
    } else {
      this.llm = new OllamaProvider({
        endpoint: settings.ollamaEndpoint || PROVIDER_DEFAULTS.ollamaEndpoint,
        model: settings.ollamaModel || PROVIDER_DEFAULTS.ollamaModel,
        numCtx: AI_RUNTIME_CONFIG.ollamaContextWindow,
        maxTokens: AI_RUNTIME_CONFIG.ollamaMaxTokens
      });
    }

    if (this.stt) {
      this.stt.stop();
      this.stt.removeAllListeners();
    }

    if (settings.sttProvider === 'deepgram' && settings.deepgramApiKey) {
      this.stt = new DeepgramProvider({
        apiKey: settings.deepgramApiKey,
        model: settings.deepgramModel || PROVIDER_DEFAULTS.deepgramModel
      });
    } else {
      this.stt = new WhisperProvider({
        model: settings.whisperModel || PROVIDER_DEFAULTS.whisperModel,
        language: settings.whisperLanguage || PROVIDER_DEFAULTS.whisperLanguage,
        computeType: settings.whisperComputeType || PROVIDER_DEFAULTS.whisperComputeType,
        device: settings.whisperDevice || PROVIDER_DEFAULTS.whisperDevice,
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
}

export const registry = new ProviderRegistry();
