/**
 * POST /api/chat — streaming, grounded answers.
 *
 * Speaks the AI SDK v5 "UI message stream" protocol that `useChat` expects:
 * the request body carries the full UIMessage[] conversation; the response is
 * an SSE stream of UI message chunks (text deltas + our custom data parts).
 *
 * All RAG logic lives in src/lib/rag.ts. This route only:
 *   1. validates the body with Zod,
 *   2. opens a `createUIMessageStream` and delegates to the RAG pipeline,
 *   3. wraps the stream in a Response.
 */
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { NextResponse } from 'next/server';
import { streamGroundedAnswer } from '@/lib/rag';
import { chatRequestSchema } from '@/lib/validation';
import type { DocuMindMessage } from '@/lib/chat-types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body.', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // The schema validated the transport shape; the RAG layer narrows the parts
  // it actually consumes (text of the last user message, metadata scope).
  const uiMessages = parsed.data.messages as unknown as DocuMindMessage[];

  const stream = createUIMessageStream<DocuMindMessage>({
    execute: async ({ writer }) => {
      await streamGroundedAnswer({
        uiMessages,
        writer,
        // Stop generation server-side when the client disconnects / presses Stop.
        abortSignal: request.signal,
      });
    },
    // Unexpected pipeline errors become an `error` chunk → the chat UI shows
    // a banner instead of a silent stall.
    onError: error => (error instanceof Error ? error.message : 'Unexpected server error.'),
  });

  return createUIMessageStreamResponse({ stream });
}
