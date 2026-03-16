import { useState } from 'react';

export function useAudio() {
  const [isRecording, setIsRecording] = useState(false);

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

  return { isRecording, toggleRecording, startRecording, stopRecording };
}
