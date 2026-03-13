import { useState } from 'react';

export function useScreenshot() {
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const captureFull = async () => {
    const image = await window.electronAPI.captureFullScreen();
    setScreenshot(image);
    return image;
  };

  const captureSelective = async () => {
    const image = await window.electronAPI.captureSelectiveScreen();
    setScreenshot(image);
    return image;
  };

  return {
    screenshot,
    setScreenshot,
    captureFull,
    captureSelective
  };
}
