export default function EmptyState() {
  return (
    <div className="dashboard-empty-state">
      <div className="dashboard-empty-state-icon" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <h2>No sessions yet</h2>
      <p>Start a session from the overlay to see your review here.</p>
    </div>
  );
}
