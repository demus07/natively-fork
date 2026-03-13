import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Message } from '../types';

interface ChatPanelProps {
  messages: Message[];
  isStreaming: boolean;
  onCopyMessage: (text: string) => void;
}

export default function ChatPanel({ messages, isStreaming, onCopyMessage }: ChatPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedMessages = messages.filter((message, index) => {
    if (message.role === 'assistant') {
      return message.content.trim().length > 0 || index === messages.length - 1;
    }
    return true;
  });
  const hasVisibleMessages = renderedMessages.some(
    (message) => message.role !== 'assistant' || message.content.trim().length > 0
  );

  useEffect(() => {
    const element = containerRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, isStreaming]);

  if (!hasVisibleMessages) {
    return (
      <div className="hud-response-card hud-response-empty">
        <span>Ask anything on screen or conversation</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="hud-response-card msg-enter">
      {renderedMessages.map((message, index) => {
        if (message.role === 'user') {
          return (
            <div key={message.id} className="hud-user-chip">
              {message.content}
            </div>
          );
        }

        if (message.role === 'system') {
          return (
            <div key={message.id} className="hud-system-inline">
              {message.content}
            </div>
          );
        }

        const isLastAssistant = index === renderedMessages.length - 1;

        return (
          <div key={message.id} className="msg-ai hud-msg-ai msg-enter">
            <div className="msg-ai-content chat-selectable hud-msg-ai-content">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    return !isInline && match ? (
                      <SyntaxHighlighter
                        style={oneDark as any}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          borderRadius: '8px',
                          fontSize: '12px',
                          margin: '6px 0',
                          padding: '10px',
                          background: 'rgba(0,0,0,0.45)'
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && isLastAssistant ? <span className="cursor-blink">|</span> : null}
            </div>
            <button
              type="button"
              className="copy-btn no-drag"
              onClick={() => onCopyMessage(message.content)}
              title="Copy message"
            >
              <Copy size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
