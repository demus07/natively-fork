import { useCallback, useState } from 'react';

export function useAudio() {
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = useCallback(async () => {
    const result = await window.electronAPI.startAudioCapture();
    const didStart = Boolean(result?.success);
    setIsRecording(didStart);
    return didStart;
  }, []);

  const stopRecording = useCallback(async () => {
    await window.electronAPI.stopAudioCapture();
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
      return;
    }

    await startRecording();
  }, [isRecording, startRecording, stopRecording]);

  return { isRecording, toggleRecording, startRecording, stopRecording };
}
