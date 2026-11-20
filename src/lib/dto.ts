/**
 * DTOs — the exact JSON shapes the REST API returns to the browser.
 * Keeping them in one place makes the client types easy to mirror.
 */
import type { Document } from '@prisma/client';

export interface DocumentDto {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  error: string | null;
  chunkCount: number;
  createdAt: string; // ISO 8601
}

export function toDocumentDto(document: Document): DocumentDto {
  return {
    id: document.id,
    title: document.title,
    filename: document.filename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    status: document.status,
    error: document.error,
    chunkCount: document.chunkCount,
    createdAt: document.createdAt.toISOString(),
  };
}

/** Chunk preview returned by GET /api/documents/[id]. */
export interface ChunkPreviewDto {
  idx: number;
  charCount: number;
  preview: string;
}
