import { useEffect, useState } from 'react';

type TranscriptSnapshot = {
  finalLines: string[];
  interimText: string;
};

const transcriptStore: TranscriptSnapshot = {
  finalLines: [],
  interimText: ''
};

const subscribers = new Set<(snapshot: TranscriptSnapshot) => void>();

let listenersAttached = false;
let cleanupInterim: (() => void) | undefined;
let cleanupFinal: (() => void) | undefined;

function emitSnapshot(): void {
  const snapshot = {
    finalLines: [...transcriptStore.finalLines],
    interimText: transcriptStore.interimText
  };

  for (const subscriber of subscribers) {
    subscriber(snapshot);
  }
}

function attachListeners(): void {
  if (listenersAttached) {
    return;
  }

  listenersAttached = true;

  const handleInterim = (text: string) => {
    transcriptStore.interimText = text;
    emitSnapshot();
  };

  const handleFinal = (payload: { text: string }) => {
    const text = payload.text.trim();
    if (!text) {
      return;
    }

    const updated = [...transcriptStore.finalLines, text];
    transcriptStore.finalLines = updated.length > 100 ? updated.slice(-100) : updated;
    transcriptStore.interimText = '';
    emitSnapshot();
  };

  cleanupInterim = window.electronAPI.onTranscriptInterim?.(handleInterim);
  cleanupFinal = window.electronAPI.onTranscriptUpdate(handleFinal);
}

export function resetTranscriptStore(): void {
  transcriptStore.finalLines = [];
  transcriptStore.interimText = '';
  emitSnapshot();
}

export function hydrateTranscriptStore(lines: string[]): void {
  transcriptStore.finalLines = lines.filter((line) => line.trim().length > 0);
  transcriptStore.interimText = '';
  emitSnapshot();
}

export function useTranscript() {
  const [finalLines, setFinalLines] = useState<string[]>(transcriptStore.finalLines);
  const [interimText, setInterimText] = useState<string>(transcriptStore.interimText);

  useEffect(() => {
    attachListeners();

    const subscriber = (snapshot: TranscriptSnapshot) => {
      setFinalLines(snapshot.finalLines);
      setInterimText(snapshot.interimText);
    };

    subscribers.add(subscriber);
    subscriber({
      finalLines: transcriptStore.finalLines,
      interimText: transcriptStore.interimText
    });

    return () => {
      subscribers.delete(subscriber);

      if (subscribers.size === 0) {
        cleanupInterim?.();
        cleanupFinal?.();
        cleanupInterim = undefined;
        cleanupFinal = undefined;
        listenersAttached = false;
      }
    };
  }, []);

  return { finalLines, interimText };
}
