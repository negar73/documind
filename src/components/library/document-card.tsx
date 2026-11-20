'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FileText, MessageSquare, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/library/status-badge';
import { cn, formatBytes, formatDate } from '@/lib/utils';
import type { DocumentDto } from '@/lib/dto';

interface DocumentCardProps {
  document: DocumentDto;
  onDeleted: (id: string) => void;
}

/**
 * One document in the library grid: file identity, ingestion status, stats
 * and actions (Chat is only enabled for READY documents; Delete uses a
 * two-step inline confirm so a destructive action never happens by accident).
 */
export function DocumentCard({ document, onDeleted }: DocumentCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Auto-cancel the confirm window so the button can't be left "armed".
  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = setTimeout(() => setConfirmingDelete(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' });
      if (response.ok || response.status === 404) {
        onDeleted(document.id);
      } else {
        setDeleting(false);
        setConfirmingDelete(false);
      }
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const chatable = document.status === 'READY';

  return (
    <article className="flex flex-col rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <h3 className="truncate text-sm font-medium" title={document.filename}>
            {document.filename}
          </h3>
        </div>
        <StatusBadge status={document.status} error={document.error} />
      </div>

      <p className="mt-1 truncate text-xs text-muted-foreground" title={document.title}>
        {document.title}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          {document.chunkCount} {document.chunkCount === 1 ? 'chunk' : 'chunks'}
        </span>
        <span aria-hidden>·</span>
        <span>{formatBytes(document.sizeBytes)}</span>
        <span aria-hidden>·</span>
        <span>{formatDate(document.createdAt)}</span>
      </div>

      {document.status === 'FAILED' && document.error && (
        <p
          className="mt-2 line-clamp-2 rounded-md bg-red-50 p-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400"
          title={document.error}
        >
          {document.error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2 pt-1">
        <Link
          href={`/chat?doc=${document.id}`}
          aria-disabled={!chatable}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition',
            chatable ? 'hover:bg-primary/90' : 'pointer-events-none opacity-50'
          )}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          Chat
        </Link>
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
            confirmingDelete
              ? 'border-red-300 bg-red-600 text-white hover:bg-red-700 dark:border-red-800'
              : 'border-border text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400'
          )}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {confirmingDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
    </article>
  );
}
