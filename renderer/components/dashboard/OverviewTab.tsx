import type { DashboardSummary } from '../../types';

interface OverviewTabProps {
  summary: DashboardSummary | null;
}

function renderList(items: string[]) {
  return (
    <ul className="dashboard-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function OverviewTab({ summary }: OverviewTabProps) {
  if (!summary) {
    return (
      <div className="dashboard-loading-card">
        <div className="dashboard-skeleton dashboard-skeleton-wide" />
        <div className="dashboard-skeleton dashboard-skeleton-medium" />
        <div className="dashboard-skeleton dashboard-skeleton-wide" />
      </div>
    );
  }

  return (
    <div className="dashboard-overview-grid">
      <section className="dashboard-card dashboard-card-full">
        <h3>Overview</h3>
        <p>{summary.overview}</p>
      </section>

      <section className="dashboard-card">
        <h3>Topics</h3>
        {renderList(summary.topics)}
      </section>

      <section className="dashboard-card">
        <h3>Decisions</h3>
        {renderList(summary.decisions)}
      </section>

      <section className="dashboard-card dashboard-card-full">
        <h3>Action items</h3>
        <ul className="dashboard-list">
          {summary.action_items.map((item) => (
            <li key={`${item.text}-${item.owner ?? 'none'}`}>
              {item.text}
              {item.owner ? <span className="dashboard-owner-tag">{item.owner}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard-card">
        <h3>Follow-ups</h3>
        {renderList(summary.follow_ups)}
      </section>

      <section className="dashboard-card">
        <h3>What went well</h3>
        {renderList(summary.went_well)}
      </section>

      <section className="dashboard-card dashboard-card-full">
        <h3>To improve</h3>
        {renderList(summary.to_improve)}
      </section>
    </div>
  );
}
