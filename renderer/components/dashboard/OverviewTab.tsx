import type { DashboardSummary } from '../../types';

interface OverviewTabProps {
  summary: DashboardSummary | null;
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return <p className="dashboard-card-empty">Nothing noted</p>;
  }

  return (
    <ul className="dashboard-list">
      {items.map((item) => (
        <li key={item}>
          <span className="dashboard-list-marker" />
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
    <ul className="dashboard-list dashboard-action-list">
      {summary.action_items.map((item) => (
        <li key={`${item.text}-${item.owner ?? 'none'}`}>
          <span className="dashboard-list-marker" />
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
  emphasis = false
}: {
  label: string;
  children: React.ReactNode;
  fullWidth?: boolean;
  emphasis?: boolean;
}) {
  return (
    <section className={`dashboard-card ${fullWidth ? 'dashboard-card-full' : ''} ${emphasis ? 'dashboard-card-emphasis' : ''}`}>
      <div className="dashboard-card-header">
        <p className="dashboard-card-label">{label}</p>
        {emphasis ? (
          <div className="dashboard-card-actions" aria-hidden="true">
            <button type="button" className="dashboard-card-icon-btn" disabled title="Regenerate summary">
              ↺
            </button>
            <button type="button" className="dashboard-card-icon-btn" disabled title="Copy summary">
              ⧉
            </button>
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function OverviewTab({ summary }: OverviewTabProps) {
  if (!summary) {
    return (
      <div className="dashboard-overview-grid">
        <div className="dashboard-summary-loading">Generating summary...</div>

        <section className="dashboard-card dashboard-card-full dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-tall" />
          <div className="dashboard-skeleton dashboard-skeleton-medium" />
        </section>

        <section className="dashboard-card dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
        </section>

        <section className="dashboard-card dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
        </section>

        <section className="dashboard-card dashboard-card-full dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
        </section>

        <section className="dashboard-card dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
        </section>

        <section className="dashboard-card dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
        </section>

        <section className="dashboard-card dashboard-card-full dashboard-loading-card">
          <div className="dashboard-skeleton dashboard-skeleton-label" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
          <div className="dashboard-skeleton dashboard-skeleton-list" />
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard-overview-grid">
      <OverviewCard label="Overview" fullWidth emphasis>
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
