/**
 * Zod schemas shared by the API routes — every external input (request body,
 * query string, route params) is validated before it touches the database or
 * the AI SDK.
 */
import { z } from 'zod';

/** 5 MB upload limit — mirrored by the client-side dropzone. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Body sent by `useChat` (AI SDK v5 UI message stream protocol):
 * the full message list plus transport metadata. Parts are validated
 * loosely (they are provider-shaped and re-serialized untouched); anything
 * that needs to be *trusted* server-side (the question text, the document
 * selection) is extracted with explicit narrowing in src/lib/rag.ts.
 */
export const chatRequestSchema = z.object({
  id: z.string().optional(),
  messages: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['system', 'user', 'assistant']),
        parts: z.array(z.record(z.string(), z.unknown())),
        metadata: z.unknown().optional(),
      })
    )
    .min(1),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

/** GET /api/chat/history?documentId=… */
export const historyQuerySchema = z.object({
  documentId: z.string().min(1).optional(),
});

/** /api/documents/[id] route params. */
export const idParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Shape of the JSON persisted in ChatMessage.sourcesJson. Validating on the
 * way out means a malformed historic payload can never crash the chat UI.
 */
export const citationSourcesSchema = z.object({
  sources: z.array(
    z.object({
      index: z.number().int().min(1),
      documentId: z.string().min(1),
      title: z.string(),
      chunkIdx: z.number().int().min(0),
      score: z.number(),
      content: z.string(),
    })
  ),
});
