import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastTone = 'default' | 'error';

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
  exiting: boolean;
};

const TOAST_LIFETIME_MS = 3000;
const TOAST_EXIT_MS = 300;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast)));

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_EXIT_MS);
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = 'default') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { id, message, tone, exiting: false }]);
      const timer = window.setTimeout(() => removeToast(id), TOAST_LIFETIME_MS);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return {
    toasts,
    pushToast,
    removeToast
  };
}
