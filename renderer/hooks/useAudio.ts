import { useEffect, useState } from 'react';

function normalizeTranscriptSegment(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) {
    return 1;
  }
  return (longer.length - levenshtein(longer, shorter)) / longer.length;
}

function isDuplicateSegment(existingTranscript: string, incoming: string): boolean {
  const incomingClean = normalizeTranscriptSegment(incoming);
  if (!incomingClean) {
    return true;
  }

  const tail = existingTranscript.slice(-300).toLowerCase();
  if (tail.includes(incomingClean)) {
    return true;
  }

  const window = tail.slice(-(incomingClean.length + 30));
  if (similarity(window, incomingClean) > 0.82) {
    return true;
  }

  const recentEnd = normalizeTranscriptSegment(existingTranscript.slice(-incomingClean.length));
  if (recentEnd.length > 8 && incomingClean.startsWith(recentEnd)) {
    return true;
  }

  return false;
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

        if (previousNormalized === normalized || isDuplicateSegment(current, cleaned)) {
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
