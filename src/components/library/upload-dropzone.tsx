'use client';

import { useRef, useState, type DragEvent } from 'react';
import { FileUp, LoaderCircle, UploadCloud } from 'lucide-react';
import { MAX_UPLOAD_BYTES } from '@/lib/validation';
import { cn, formatBytes } from '@/lib/utils';
import type { DocumentDto } from '@/lib/dto';

const ACCEPTED_TYPES = '.pdf,.md,.markdown,.txt';
const ACCEPTED_LABEL = 'PDF, Markdown or plain text · up to 5 MB';

interface UploadDropzoneProps {
  /** Called after the server accepted the upload (document starts as PENDING). */
  onUploaded: (document: DocumentDto) => void;
}

/**
 * Drag & drop upload area with a hidden file input.
 * Validation errors (type/size/server) are shown inline; a successful upload
 * bubbles the new PENDING document up so the grid (and the status polling)
 * can pick it up immediately.
 */
export function UploadDropzone({ onUploaded }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setError(null);

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.pdf', '.md', '.markdown', '.txt'].includes(extension)) {
      setError('Unsupported file type. Upload a PDF, Markdown or plain-text file.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large (${formatBytes(file.size)}). The limit is 5 MB.`);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/documents', { method: 'POST', body });
      const payload: { document?: DocumentDto; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !payload.document) {
        setError(payload.error ?? 'Upload failed. Please try again.');
        return;
      }
      onUploaded(payload.document);
    } catch {
      setError('Upload failed — is the server running?');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!uploading) void handleFiles(event.dataTransfer.files);
  }

  return (
    <div>
      <label
        onDragOver={event => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition',
          dragOver
            ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
            : 'border-border hover:border-emerald-500/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20',
          uploading && 'pointer-events-none opacity-70'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          disabled={uploading}
          onChange={event => void handleFiles(event.target.files)}
        />
        {uploading ? (
          <>
            <LoaderCircle className="size-7 animate-spin text-emerald-600 dark:text-emerald-400" aria-hidden />
            <p className="text-sm font-medium">Uploading…</p>
            <p className="text-xs text-muted-foreground">The document will be chunked, embedded and indexed.</p>
          </>
        ) : (
          <>
            <span className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {dragOver ? <FileUp className="size-5" aria-hidden /> : <UploadCloud className="size-5" aria-hidden />}
            </span>
            <p className="text-sm font-medium">
              {dragOver ? 'Drop the file to upload' : 'Drag & drop a document here, or click to browse'}
            </p>
            <p className="text-xs text-muted-foreground">{ACCEPTED_LABEL}</p>
          </>
        )}
      </label>
      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
