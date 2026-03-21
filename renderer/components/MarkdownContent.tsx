import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const codeFontFamily = "'Geist Mono', 'Fira Code', 'JetBrains Mono', monospace";
const codeBlockStyle = {
  position: 'relative',
  background: '#1a1a1a',
  borderRadius: '10px',
  padding: '20px 24px',
  border: '1px solid rgba(255,255,255,0.07)',
  margin: '0',
  boxShadow: 'none',
  fontFamily: codeFontFamily,
  fontSize: '13px',
  lineHeight: '1.7'
} as const;

const codeTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...(oneDark['pre[class*="language-"]'] || {}),
    background: '#1a1a1a',
    color: 'rgba(255,255,255,0.85)',
    textShadow: 'none',
    fontFamily: codeFontFamily,
    fontSize: '13px',
    lineHeight: '1.7'
  },
  'code[class*="language-"]': {
    ...(oneDark['code[class*="language-"]'] || {}),
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    textShadow: 'none',
    fontFamily: codeFontFamily,
    fontSize: '13px',
    lineHeight: '1.7'
  },
  comment: {
    color: 'rgba(255,255,255,0.28)',
    fontStyle: 'normal'
  },
  prolog: {
    color: 'rgba(255,255,255,0.28)',
    fontStyle: 'normal'
  },
  doctype: {
    color: 'rgba(255,255,255,0.28)',
    fontStyle: 'normal'
  },
  cdata: {
    color: 'rgba(255,255,255,0.28)',
    fontStyle: 'normal'
  },
  punctuation: {
    color: 'rgba(255,255,255,0.6)'
  },
  operator: {
    color: 'rgba(255,255,255,0.6)'
  },
  entity: {
    color: 'rgba(255,255,255,0.6)'
  },
  url: {
    color: 'rgba(255,255,255,0.6)'
  },
  keyword: {
    color: '#e06c75'
  },
  selector: {
    color: '#e06c75'
  },
  important: {
    color: '#e06c75'
  },
  atrule: {
    color: '#e06c75'
  },
  property: {
    color: 'rgba(255,255,255,0.85)'
  },
  variable: {
    color: 'rgba(255,255,255,0.85)'
  },
  char: {
    color: '#98c379'
  },
  string: {
    color: '#98c379'
  },
  inserted: {
    color: '#98c379'
  },
  number: {
    color: '#d19a66'
  },
  boolean: {
    color: '#d19a66'
  },
  constant: {
    color: '#d19a66'
  },
  function: {
    color: '#61afef'
  },
  'function-variable': {
    color: '#61afef'
  },
  'class-name': {
    color: '#61afef'
  },
  builtin: {
    color: '#61afef'
  },
  symbol: {
    color: 'rgba(255,255,255,0.85)'
  },
  regex: {
    color: '#98c379'
  }
};

function guessCodeLanguage(code: string): string {
  if (/(^|\n)\s*#include\b|std::|vector<|public:\s*$/m.test(code)) {
    return 'cpp';
  }

  if (/(^|\n)\s*(from\s+\w+\s+import|import\s+\w+|class\s+\w+|def\s+\w+\(|self\b)/m.test(code)) {
    return 'python';
  }

  if (/(^|\n)\s*(const|let|var|function)\b|=>|console\.|interface\s+\w+/m.test(code)) {
    return 'typescript';
  }

  return 'text';
}

function looksLikeCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return (
    /^(from\s+\w+\s+import|import\s+\w+|class\s+\w+|def\s+\w+\(|#include|public:|private:|protected:|const\s+|let\s+|var\s+|function\s+|if\s*\(|for\s*\(|while\s*\(|return\b)/.test(trimmed) ||
    /[{}();:=<>[\]]/.test(trimmed) ||
    /^\s{2,}\S/.test(line)
  );
}

function normalizeMarkdownForCodeBlocks(content: string): string {
  if (!content.includes('\n') || content.includes('```')) {
    return content;
  }

  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => looksLikeCodeLine(line));
  if (startIndex === -1) {
    return content;
  }

  const codeLines = lines.slice(startIndex);
  const codeishLines = codeLines.filter(looksLikeCodeLine);
  if (codeLines.length < 3 || codeishLines.length / codeLines.length < 0.45) {
    return content;
  }

  const prose = lines.slice(0, startIndex).join('\n').trim();
  const code = codeLines.join('\n').trimEnd();
  const language = guessCodeLanguage(code);

  if (!prose) {
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }

  return `${prose}\n\n\`\`\`${language}\n${code}\n\`\`\``;
}

function splitCodeDominantContent(content: string): { prose: string; code: string; language: string } | null {
  if (content.includes('```')) {
    return null;
  }

  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => looksLikeCodeLine(line));
  if (startIndex === -1) {
    return null;
  }

  const proseLines = lines.slice(0, startIndex);
  const codeLines = lines.slice(startIndex);
  const nonEmptyCodeLines = codeLines.filter((line) => line.trim().length > 0);
  const codeishLines = nonEmptyCodeLines.filter(looksLikeCodeLine);

  if (nonEmptyCodeLines.length < 4 || codeishLines.length / nonEmptyCodeLines.length < 0.6) {
    return null;
  }

  const code = codeLines.join('\n').trimEnd();
  if (!code) {
    return null;
  }

  return {
    prose: proseLines.join('\n').trim(),
    code,
    language: guessCodeLanguage(code)
  };
}

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export default function MarkdownContent({ content, className }: MarkdownContentProps) {
  const codeDominant = splitCodeDominantContent(content);
  const normalized = normalizeMarkdownForCodeBlocks(content);

  if (codeDominant) {
    return (
      <div className={className}>
        {codeDominant.prose ? <p>{codeDominant.prose}</p> : null}
        <div className="markdown-code-block">
          <span className="markdown-code-label">{codeDominant.language}</span>
          <SyntaxHighlighter
            style={codeTheme as any}
            language={codeDominant.language}
            PreTag="div"
            showLineNumbers={false}
            wrapLongLines={false}
            customStyle={codeBlockStyle}
            codeTagProps={{
              style: {
                fontFamily: codeFontFamily,
                fontSize: '13px',
                lineHeight: '1.7'
              }
            }}
          >
            {codeDominant.code}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          code({ className: codeClassName, children, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const isInline = !match;
            if (!isInline && match) {
              const language = match[1];
              return (
                <div className="markdown-code-block">
                  <span className="markdown-code-label">{language}</span>
                  <SyntaxHighlighter
                    style={codeTheme as any}
                    language={language}
                    PreTag="div"
                    showLineNumbers={false}
                    wrapLongLines={false}
                    customStyle={codeBlockStyle}
                    codeTagProps={{
                      style: {
                        fontFamily: codeFontFamily,
                        fontSize: '13px',
                        lineHeight: '1.7'
                      }
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }

            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
