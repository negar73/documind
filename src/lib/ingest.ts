/**
 * Ingestion — the end-to-end "upload → searchable" pipeline.
 *
 *   file bytes → text extraction → chunking → embedding → pgvector insert
 *
 * Runs in the background after POST /api/documents creates the Document row
 * (status PENDING). The client polls the documents endpoint and sees the
 * status walk PENDING → PROCESSING → READY (or FAILED with an error message).
 *
 * On a long-running server (Docker, VPS, `next start`) fire-and-forget is
 * fine. On serverless you would push this work onto a queue instead — that
 * swap is deliberately isolated to this single call site.
 */
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { env } from './env';
import { chunkText } from './chunk';
import { embedTexts } from './embed';
import { insertChunk } from './vector-store';

/** 5 MB upload limit — mirrored in the client-side dropzone validation. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Extensions/mime types DocuMind can extract text from. */
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.pdf'] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.pdf': 'application/pdf',
};

export function fileExtension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? `.${match[1].toLowerCase()}` : '';
}

export function isSupportedUpload(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(fileExtension(filename));
}

/** Prefer the browser-reported MIME type, fall back to the extension map. */
export function guessMimeType(filename: string, reportedType: string): string {
  if (reportedType && reportedType !== 'application/octet-stream') return reportedType;
  return MIME_BY_EXTENSION[fileExtension(filename)] ?? 'application/octet-stream';
}

/** Strip any path segments a client may have sent and cap the length. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const trimmed = base.trim().slice(0, 180);
  return trimmed.length > 0 ? trimmed : 'document';
}

/** Filename without extension — used as the default document title. */
export function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, '') || filename;
}

/**
 * Extract plain text from raw file bytes.
 *  - PDF  → pdf-parse (PDF.js under the hood)
 *  - text → UTF-8 decode
 */
export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const ext = fileExtension(filename);
  if (ext === '.pdf' || mimeType === 'application/pdf') {
    // Import the library entry directly: pdf-parse@1 has a debug harness in
    // its index.js that runs a bundled test PDF when required as the package
    // root. The `/lib/pdf-parse.js` entry exports the parser function only.
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const result = await pdfParse(buffer);
    return result.text;
  }
  return buffer.toString('utf-8');
}

/**
 * Run the full ingestion pipeline for a previously created Document row.
 * Never throws — failures are persisted on the document as status FAILED.
 */
export async function ingestDocument(documentId: string, buffer: Buffer): Promise<void> {
  try {
    await db.document.update({
      where: { id: documentId },
      data: { status: 'PROCESSING', error: null },
    });

    const document = await db.document.findUniqueOrThrow({ where: { id: documentId } });

    // 1) Bytes → text.
    const text = await extractText(buffer, document.mimeType, document.filename);
    if (!text.trim()) {
      throw new Error('No extractable text found. Scanned PDFs without a text layer are not supported yet.');
    }

    // 2) Text → overlapping chunks.
    const chunks = chunkText(text, { size: env.CHUNK_SIZE, overlap: env.CHUNK_OVERLAP });
    if (chunks.length === 0) {
      throw new Error('The document produced no text chunks to index.');
    }

    // 3) Chunks → vectors (batched, retried once on transient failures).
    const embeddings = await embedTexts(chunks.map(chunk => chunk.content));

    // 4) Vectors → pgvector. $executeRaw is required because the embedding
    //    column is Unsupported (see vector-store.ts). Inserting all chunks in
    //    one transaction keeps a failure from leaving half-indexed documents.
    await db.$transaction(
      chunks.map(chunk =>
        insertChunk({
          id: randomUUID(),
          documentId,
          idx: chunk.idx,
          content: chunk.content,
          embedding: embeddings[chunk.idx],
        })
      )
    );

    await db.document.update({
      where: { id: documentId },
      data: { status: 'READY', chunkCount: chunks.length, error: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ingestion error.';
    console.error(`[ingest] document ${documentId} failed: ${message}`);
    await db.document
      .update({ where: { id: documentId }, data: { status: 'FAILED', error: message } })
      .catch(() => {
        // The document row may have been deleted while ingesting — nothing to do.
      });
  }
}
