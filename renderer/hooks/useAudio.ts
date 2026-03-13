import { useEffect, useState } from 'react';

function normalizeTranscriptSegment(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useAudio() {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    let lastSegment = '';
    const unsubscribe = window.electronAPI.onTranscriptUpdate((payload) => {
      const cleaned = payload.text.trim();
      if (!cleaned) {
        return;
      }

      const normalized = normalizeTranscriptSegment(cleaned);
      const lastNormalized = normalizeTranscriptSegment(lastSegment);

      if (!normalized || normalized === lastNormalized) {
        return;
      }

      setTranscript((current) => {
        const lines = current.split('\n').map((line) => line.trim()).filter(Boolean);
        const previous = lines.at(-1) ?? '';
        const previousNormalized = normalizeTranscriptSegment(previous);

        if (previousNormalized === normalized) {
          return current;
        }

        if (normalized.startsWith(previousNormalized) && previousNormalized.length > 0) {
          lines[lines.length - 1] = cleaned;
          lastSegment = cleaned;
          return lines.join('\n').slice(-4000);
        }

        if (previousNormalized.startsWith(normalized) && normalized.length > 0) {
          return current;
        }

        lastSegment = cleaned;
        return [...lines, cleaned].join('\n').slice(-4000);
      });
    });

    return unsubscribe;
  }, []);

  const startRecording = async () => {
    await window.electronAPI.startAudioCapture();
    setIsRecording(true);
  };

  const stopRecording = async () => {
    await window.electronAPI.stopAudioCapture();
    setIsRecording(false);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopRecording();
      return;
    }

    await startRecording();
  };

  return { transcript, isRecording, toggleRecording, startRecording, stopRecording, setTranscript };
}
