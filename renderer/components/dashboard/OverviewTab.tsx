import type { DashboardSummary } from '../../types';

interface OverviewTabProps {
  sessionId: string;
  summary: DashboardSummary | null;
  isRegenerating: boolean;
  onCopyOverview: () => void;
  onRegenerate: () => void;
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return <p className="dashboard-card-empty">Nothing noted</p>;
  }

  return (
    <ul className="dashboard-list">
      {items.map((item) => (
        <li key={item}>
          <span className="dashboard-list-dot" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function renderActionItems(summary: DashboardSummary) {
  if (summary.action_items.length === 0) {
    return <p className="dashboard-card-empty">Nothing noted</p>;
  }

  return (
    <ul className="dashboard-list">
      {summary.action_items.map((item) => (
        <li key={`${item.text}-${item.owner ?? 'none'}`}>
          <span className="dashboard-list-dot" />
          <span>
            {item.text}
            {item.owner ? <span className="dashboard-owner-tag">{item.owner}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function OverviewCard({
  label,
  children,
  fullWidth = false,
  emphasis = false,
  actions
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
  emphasis?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <section className={`dashboard-card ${fullWidth ? 'dashboard-card-full' : ''} ${emphasis ? 'dashboard-card-emphasis' : ''}`}>
      <div className="dashboard-card-header">
        <p className="dashboard-card-label">{label}</p>
        {actions ? <div className="dashboard-card-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function LoadingOverview() {
  return (
    <div className="dashboard-overview-grid">
      <div className="dashboard-summary-loading">Generating summary...</div>

      <section className="dashboard-card dashboard-card-full dashboard-loading-card">
        <div className="dashboard-skeleton dashboard-skeleton-label" />
        <div className="dashboard-skeleton dashboard-skeleton-tall" />
        <div className="dashboard-skeleton dashboard-skeleton-medium" />
      </section>

      {Array.from({ length: 6 }).map((_, index) => (
        <section
          key={index}
          className={`dashboard-card dashboard-loading-card ${index === 2 || index === 5 ? 'dashboard-card-full' : ''}`}
        >
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          {index === 2 || index === 5 ? <div className="dashboard-skeleton dashboard-skeleton-list" /> : null}
        </section>
      ))}
    </div>
  );
}

export default function OverviewTab({
  sessionId: _sessionId,
  summary,
  isRegenerating,
  onCopyOverview,
  onRegenerate
}: OverviewTabProps) {
  if (!summary) {
    return <LoadingOverview />;
  }

  return (
    <div className="dashboard-overview-grid">
      <OverviewCard
        label="Overview"
        fullWidth
        emphasis
        actions={(
          <>
            <button type="button" className="dashboard-card-icon-btn" onClick={onRegenerate} title="Regenerate summary">
              {isRegenerating ? <span className="dashboard-inline-spinner" /> : '↺'}
            </button>
            <button type="button" className="dashboard-card-icon-btn" onClick={onCopyOverview} title="Copy overview">
              ⧉
            </button>
          </>
        )}
      >
        <p className="dashboard-overview-copy">{summary.overview}</p>
      </OverviewCard>

      <OverviewCard label="Topics">{renderList(summary.topics)}</OverviewCard>
      <OverviewCard label="Decisions">{renderList(summary.decisions)}</OverviewCard>

      <OverviewCard label="Action items" fullWidth>
        {renderActionItems(summary)}
      </OverviewCard>

      <OverviewCard label="Follow-ups">{renderList(summary.follow_ups)}</OverviewCard>
      <OverviewCard label="What went well">{renderList(summary.went_well)}</OverviewCard>

      <OverviewCard label="To improve" fullWidth>
        {renderList(summary.to_improve)}
      </OverviewCard>
    </div>
  );
}
