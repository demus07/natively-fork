import { LEGACY_PROVIDER_VALUES, PROVIDER_DEFAULTS } from '../../src/config';
import type { Settings } from '../../renderer/types';
import { CodexProvider } from '../providers/CodexProvider';
import { DeepgramProvider } from '../providers/DeepgramProvider';
import { GeminiProvider } from '../providers/GeminiProvider';
import { OllamaProvider } from '../providers/OllamaProvider';
import { WhisperProvider } from '../providers/WhisperProvider';

function normalizeCodexModel(model?: string): string {
  const trimmedModel = (model || '').trim();
  if (trimmedModel === LEGACY_PROVIDER_VALUES.codexUnsupportedDefaultModel) {
    return '';
  }
  return trimmedModel;
}

export async function testLlmProvider(settings: Partial<Settings>): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  try {
    if (settings.llmProvider === 'codex') {
      const provider = new CodexProvider({
        model: normalizeCodexModel(settings.codexModel || PROVIDER_DEFAULTS.codexModel),
        extraFlags: settings.codexExtraFlags || ''
      });
      return await provider.testConnection();
    }

    if (settings.llmProvider === 'gemini') {
      const provider = new GeminiProvider({
        apiKey: settings.geminiApiKey || '',
        model: settings.geminiModel || PROVIDER_DEFAULTS.geminiModel
      });
      return await provider.testConnection();
    }

    if (settings.llmProvider === 'ollama') {
      const provider = new OllamaProvider({
        endpoint: settings.ollamaEndpoint || PROVIDER_DEFAULTS.ollamaEndpoint,
        model: settings.ollamaModel || PROVIDER_DEFAULTS.ollamaModel
      });
      return await provider.testConnection();
    }

    return {
      ok: false,
      error: `${settings.llmProvider || 'Selected'} LLM testing is not available in the dashboard yet. Use Codex, Gemini, or Ollama.`
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'LLM connection test failed'
    };
  }
}

export async function testSttProvider(settings: Partial<Settings>): Promise<{ ok: boolean; error?: string }> {
  try {
    if (settings.sttProvider === 'deepgram') {
      const provider = new DeepgramProvider({
        apiKey: settings.deepgramApiKey || '',
        model: settings.deepgramModel || PROVIDER_DEFAULTS.deepgramModel
      });
      return await provider.testConnection();
    }

    if (settings.sttProvider === 'whisper') {
      const provider = new WhisperProvider({
        model: settings.whisperModel || PROVIDER_DEFAULTS.whisperModel,
        language: settings.whisperLanguage || PROVIDER_DEFAULTS.whisperLanguage,
        computeType: settings.whisperComputeType || PROVIDER_DEFAULTS.whisperComputeType,
        device: settings.whisperDevice || PROVIDER_DEFAULTS.whisperDevice,
        pythonBin: settings.whisperPythonBin || ''
      });
      return await provider.testConnection();
    }

    return {
      ok: false,
      error: `${settings.sttProvider || 'Selected'} STT testing is not available in the dashboard yet. Use Deepgram or Whisper.`
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'STT connection test failed'
    };
  }
}
