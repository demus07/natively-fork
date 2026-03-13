import { useMutation } from '@tanstack/react-query';
import type { AIPayload } from '../types';

export function useAI() {
  return useMutation({
    mutationFn: async (payload: AIPayload) => {
      await window.electronAPI.sendMessage(payload);
    }
  });
}
