'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Database, FileQuestion, Files, Layers } from 'lucide-react';
import { DocumentCard } from '@/components/library/document-card';
import { UploadDropzone } from '@/components/library/upload-dropzone';
import type { DocumentDto } from '@/lib/dto';

/**
 * The Library: upload dropzone + document grid.
 *
 * Owns the documents state and the status polling: while any document is
 * PENDING/PROCESSING (i.e. ingestion is running in the background), the list
 * refetches every 2.5 s until every document reaches a terminal state.
 */
const POLL_INTERVAL_MS = 2500;

export function LibraryClient() {
  const [documents, setDocuments] = useState<DocumentDto[] | null>(null); // null = loading
  const [loadError, setLoadError] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch('/api/documents');
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const data: { documents?: DocumentDto[] } = await response.json();
      setDocuments(data.documents ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const ingestionRunning = (documents ?? []).some(
    document => document.status === 'PENDING' || document.status === 'PROCESSING'
  );

  useEffect(() => {
    if (!ingestionRunning) return;
    const timer = setInterval(() => void loadDocuments(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ingestionRunning, loadDocuments]);

  function handleUploaded(document: DocumentDto) {
    setDocuments(previous => [document, ...(previous ?? [])]);
  }

  function handleDeleted(id: string) {
    setDocuments(previous => (previous ?? []).filter(document => document.id !== id));
  }

  const ready = (documents ?? []).filter(document => document.status === 'READY');
  const totalChunks = (documents ?? []).reduce((sum, document) => sum + document.chunkCount, 0);

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Hero strip ─────────────────────────────────────────────────────── */}
      <section className="border-b bg-gradient-to-b from-emerald-50/70 to-transparent dark:from-emerald-950/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">DocuMind</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Upload PDFs or Markdown, ask questions in natural language and get streaming answers with
            numbered citations — powered by a real RAG pipeline: chunking, embeddings and cosine
            search over <span className="font-medium text-foreground">pgvector</span>.
          </p>
          <ul className="mt-5 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Pipeline overview">
            {['Upload', 'Chunk', 'Embed', 'pgvector store', 'Retrieve', 'Cited answer'].map((step, index) => (
              <li key={step} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden />}
                <span className="rounded-full border bg-card px-2.5 py-1 font-medium">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Upload + grid ──────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-8" aria-label="Document library">
        <UploadDropzone onUploaded={handleUploaded} />

        {documents !== null && documents.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Files className="size-3.5" aria-hidden />
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-3.5" aria-hidden />
              {totalChunks} chunks indexed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Database className="size-3.5" aria-hidden />
              {ready.length} ready for chat
            </span>
            {ingestionRunning && (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
                Indexing in progress…
              </span>
            )}
          </div>
        )}

        <div className="mt-4">
          {documents === null ? (
            // Loading skeletons
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-36 animate-pulse rounded-xl border bg-muted/50" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
              <FileQuestion className="size-8 text-muted-foreground/60" aria-hidden />
              <h2 className="text-sm font-semibold">Your library is empty</h2>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                Upload a PDF, Markdown or text file above to start chatting with it — or seed a sample
                document with <code className="rounded bg-muted px-1 py-0.5 font-mono">npm run db:seed</code>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map(document => (
                <DocumentCard key={document.id} document={document} onDeleted={handleDeleted} />
              ))}
            </div>
          )}
        </div>

        {loadError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
            Could not load the library. Is the database running and <code className="font-mono">DATABASE_URL</code> set?
          </p>
        )}
      </section>
    </div>
  );
}
