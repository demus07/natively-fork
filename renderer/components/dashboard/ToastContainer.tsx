import type { ToastItem } from '../../hooks/useToast';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="dashboard-toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`dashboard-toast dashboard-toast-${toast.tone} ${toast.exiting ? 'dashboard-toast-exit' : ''}`}
          role="status"
        >
          <span>{toast.message}</span>
          <button type="button" className="dashboard-toast-dismiss" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
