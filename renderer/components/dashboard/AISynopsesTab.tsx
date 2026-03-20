import type { DashboardChatMessage } from '../../types';

interface AISynopsesTabProps {
  messages: DashboardChatMessage[];
}

function formatMessageTimestamp(timestamp: string): string {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return value.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

export default function AISynopsesTab({ messages }: AISynopsesTabProps) {
  if (messages.length === 0) {
    return (
      <div className="dashboard-ai-pane">
        <section className="dashboard-card dashboard-card-full">
          <div className="dashboard-card-header">
            <p className="dashboard-card-label">AI synopses & responses</p>
          </div>
          <p className="dashboard-card-empty">No AI prompts or responses were captured for this session.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="dashboard-ai-pane">
      <section className="dashboard-card dashboard-card-full">
        <div className="dashboard-card-header">
          <p className="dashboard-card-label">AI synopses & responses</p>
        </div>

        <div className="dashboard-ai-thread">
          {messages.map((message) => (
            <article
              key={message.id}
              className={`dashboard-ai-message dashboard-ai-message-${message.role}`}
            >
              <div className="dashboard-ai-message-meta">
                <span className="dashboard-ai-message-role">
                  {message.role === 'assistant' ? 'AI response' : 'Asked'}
                </span>
                {formatMessageTimestamp(message.timestamp) ? (
                  <span className="dashboard-ai-message-time">{formatMessageTimestamp(message.timestamp)}</span>
                ) : null}
              </div>
              <p className="dashboard-ai-message-copy">{message.content}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
