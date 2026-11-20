'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CitationSource } from '@/lib/chat-types';

/**
 * Collapsible "Sources (k)" panel under an assistant message.
 * Each row shows the citation number, the document title, the chunk position
 * and the retrieval score, plus a line-clamped content preview that expands
 * on click.
 */
export function SourcesAccordion({ sources, className }: { sources: CitationSource[]; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(previous => !previous)}
        aria-expanded={open}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <BookOpen className="size-3.5" aria-hidden />
        Sources ({sources.length})
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {sources.map(source => (
            <SourceRow key={`${source.documentId}-${source.chunkIdx}`} source={source} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceRow({ source }: { source: CitationSource }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded(previous => !previous)}
        className="w-full rounded-lg border bg-background p-2.5 text-left transition hover:border-emerald-500/40"
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
            {source.index}
          </span>
          <span className="truncate font-medium" title={source.title}>
            {source.title}
          </span>
          <span className="shrink-0 text-muted-foreground">· chunk {source.chunkIdx + 1}</span>
          <span className="shrink-0 text-muted-foreground">· {source.score.toFixed(3)}</span>
        </div>
        <p
          className={cn(
            'mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground',
            !expanded && 'line-clamp-3'
          )}
        >
          {source.content}
        </p>
      </button>
    </li>
  );
}
