'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import { cn } from '@/lib/utils';

/**
 * Renders an assistant answer as Markdown and turns `[n]` citation markers
 * into small numbered badges that visually tie the answer to the Sources
 * panel below the message.
 *
 * Mechanism: before rendering, a bare `[3]` is rewritten to `[3](#cite-3)` —
 * a plain Markdown link — so react-markdown parses it; the custom `a`
 * renderer detects the `#cite-*` href and draws a badge instead of a link.
 * Code fences are skipped so code samples are never rewritten.
 */

const CITATION_PATTERN = /\[(\d{1,2})\]/g;

function transformCitations(markdown: string): string {
  const segments = markdown.split('```');
  return segments
    .map((segment, index) =>
      index % 2 === 0 ? segment.replace(CITATION_PATTERN, '[$1](#cite-$1)') : segment
    )
    .join('```');
}

function CitationBadge({ n }: { n: number }) {
  return (
    <sup
      title={`Source [${n}] — see the Sources panel below`}
      className="mx-0.5 inline-flex h-4 min-w-4 cursor-help items-center justify-center rounded-full bg-emerald-100 px-1 text-[10px] font-semibold leading-none text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
    >
      {n}
    </sup>
  );
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children, className }) => (
    <code
      className={
        className?.includes('language-')
          ? className
          : 'rounded bg-muted px-1 py-0.5 font-mono text-xs'
      }
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{children}</pre>
  ),
  a: ({ href, children }) => {
    const match = typeof href === 'string' ? /^#cite-(\d{1,2})$/.exec(href) : null;
    if (match) return <CitationBadge n={Number(match[1])} />;
    return (
      <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
        {children}
      </a>
    );
  },
};

interface CitationMarkdownProps {
  text: string;
  /** While streaming: appends a blinking caret after the last token. */
  caret?: boolean;
  className?: string;
}

export function CitationMarkdown({ text, caret, className }: CitationMarkdownProps) {
  return (
    <div className={cn('text-sm leading-relaxed', className)}>
      <ReactMarkdown components={markdownComponents}>{transformCitations(text)}</ReactMarkdown>
      {caret && (
        <span className="animate-pulse font-semibold text-emerald-600 dark:text-emerald-400" aria-hidden>
          ▍
        </span>
      )}
    </div>
  );
}
