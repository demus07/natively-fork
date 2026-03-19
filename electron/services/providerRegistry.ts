import type { LLMProvider } from '../providers/LLMProvider';
import type { STTProvider } from '../providers/STTProvider';
import { DeepgramProvider } from '../providers/DeepgramProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { WhisperProvider } from '../providers/WhisperProvider';
import { CodexProvider } from '../providers/CodexProvider';
import { AI_RUNTIME_CONFIG, LEGACY_PROVIDER_VALUES, PROVIDER_DEFAULTS } from '../../src/config';

export interface ProviderSettings {
  llmProvider: 'codex' | 'openai' | 'anthropic' | 'ollama' | 'gemini';
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  geminiModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  codexModel: string;
  codexExtraFlags: string;
  sttProvider: 'deepgram' | 'sarvam' | 'whisper';
  deepgramApiKey: string;
  sarvamApiKey: string;
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
  private activeLlmLabel = '';
  private activeSttLabel = '';

  private logProviderFallback(providerType: 'llm' | 'stt', providerName: string, fallbackName: string): void {
    console.warn(
      `[REGISTRY] ${providerType.toUpperCase()} provider "${providerName}" is saved in settings but not implemented yet — falling back to ${fallbackName}`
    );
  }

  private normalizeCodexModel(model: string | undefined): string {
    const trimmedModel = (model || '').trim();
    if (trimmedModel === LEGACY_PROVIDER_VALUES.codexUnsupportedDefaultModel) {
      return '';
    }
    return trimmedModel;
  }

  initFromSettings(settings: Partial<ProviderSettings>): void {
    if (settings.llmProvider === 'codex') {
      const codexModel = this.normalizeCodexModel(settings.codexModel || PROVIDER_DEFAULTS.codexModel);
      this.llm = new CodexProvider({
        model: codexModel,
        extraFlags: settings.codexExtraFlags || ''
      });
      this.activeLlmLabel = codexModel ? `codex:${codexModel}` : 'codex:default';
    } else if (settings.llmProvider === 'gemini' && settings.geminiApiKey) {
      this.llm = new GeminiProvider({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel || PROVIDER_DEFAULTS.geminiModel
      });
      this.activeLlmLabel = `gemini:${settings.geminiModel || PROVIDER_DEFAULTS.geminiModel}`;
    } else {
      if (settings.llmProvider && settings.llmProvider !== 'ollama') {
        this.logProviderFallback('llm', settings.llmProvider, 'ollama');
      }
      const ollamaModel = settings.ollamaModel || PROVIDER_DEFAULTS.ollamaModel;
      this.llm = new OllamaProvider({
        endpoint: settings.ollamaEndpoint || PROVIDER_DEFAULTS.ollamaEndpoint,
        model: ollamaModel,
        numCtx: AI_RUNTIME_CONFIG.ollamaContextWindow,
        maxTokens: AI_RUNTIME_CONFIG.ollamaMaxTokens
      });
      this.activeLlmLabel = `ollama:${ollamaModel}`;
    }

    if (this.stt) {
      this.stt.stop();
      this.stt.removeAllListeners();
    }

    if (settings.sttProvider === 'deepgram' && settings.deepgramApiKey) {
      const deepgramModel = settings.deepgramModel || PROVIDER_DEFAULTS.deepgramModel;
      this.stt = new DeepgramProvider({
        apiKey: settings.deepgramApiKey,
        model: deepgramModel
      });
      this.activeSttLabel = `deepgram:${deepgramModel}`;
    } else {
      if (settings.sttProvider && settings.sttProvider !== 'whisper') {
        this.logProviderFallback('stt', settings.sttProvider, 'whisper');
      }
      const whisperModel = settings.whisperModel || PROVIDER_DEFAULTS.whisperModel;
      this.stt = new WhisperProvider({
        model: whisperModel,
        language: settings.whisperLanguage || PROVIDER_DEFAULTS.whisperLanguage,
        computeType: settings.whisperComputeType || PROVIDER_DEFAULTS.whisperComputeType,
        device: settings.whisperDevice || PROVIDER_DEFAULTS.whisperDevice,
        pythonBin: settings.whisperPythonBin || ''
      });
      this.activeSttLabel = `whisper:${whisperModel}`;
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

  getActiveProviderLabels(): { llm: string; stt: string } {
    return {
      llm: this.activeLlmLabel || this.getLLM().name,
      stt: this.activeSttLabel || this.getSTT().name
    };
  }
}

export const registry = new ProviderRegistry();
