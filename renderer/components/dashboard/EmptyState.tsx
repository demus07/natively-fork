interface EmptyStateProps {
  onLaunchOverlay: () => void;
}

export default function EmptyState({ onLaunchOverlay }: EmptyStateProps) {
  return (
    <div className="dashboard-empty-state">
      <svg className="dashboard-empty-state-wave" viewBox="0 0 120 64" aria-hidden="true">
        <path
          d="M6 34h10l7-18 11 34 10-22 8 13 10-30 10 42 12-22h10"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h2>No sessions yet</h2>
      <p>Start a session from the overlay to see your review here.</p>
      <button type="button" className="dashboard-empty-state-cta" onClick={onLaunchOverlay}>
        Launch overlay →
      </button>
    </div>
  );
}
