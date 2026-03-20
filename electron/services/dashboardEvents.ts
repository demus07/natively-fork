import { EventEmitter } from 'node:events';
import type { SummaryJson } from './types';

interface SummaryUpdatePayload {
  sessionId: string;
  summary: SummaryJson;
  title: string;
}

class DashboardEvents extends EventEmitter {
  emitSummaryUpdate(payload: SummaryUpdatePayload): void {
    this.emit('summary-update', payload);
  }

  onSummaryUpdate(listener: (payload: SummaryUpdatePayload) => void): () => void {
    this.on('summary-update', listener);
    return () => this.off('summary-update', listener);
  }
}

export const dashboardEvents = new DashboardEvents();
