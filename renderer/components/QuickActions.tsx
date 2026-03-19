import type { ActionType } from '../types';

interface QuickActionsProps {
  onAction: (type: ActionType) => void;
  isStreaming: boolean;
  activeAction: ActionType | null;
}

const ACTIONS: Array<{ id: ActionType; label: string }> = [
  { id: 'answer_now', label: '⚡ Answer' }
];

export default function QuickActions({ onAction, isStreaming, activeAction }: QuickActionsProps) {
  return (
    <div className="quick-actions-row">
      {ACTIONS.map((action) => {
        const isActive = activeAction === action.id;
        return (
          <button
            key={action.id}
            type="button"
            className={`qa-pill ${isActive ? 'qa-pill-active' : ''}`}
            disabled={isStreaming && !isActive}
            onClick={() => onAction(action.id)}
          >
            {isActive ? <span className="qa-spinner" /> : null}
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
