import { useCallback, useState } from 'react';

export function useScreenshot() {
  const [screenshot, setScreenshot] = useState<string | null>(null);

  const captureFull = useCallback(async () => {
    const image = await window.electronAPI.captureFullScreen();
    setScreenshot(image);
    return image;
  }, []);

  const captureSelective = useCallback(async () => {
    const image = await window.electronAPI.captureSelectiveScreen();
    setScreenshot(image);
    return image;
  }, []);

  return {
    screenshot,
    setScreenshot,
    captureFull,
    captureSelective
  };
}
