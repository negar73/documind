/**
 * GET /api/chat/history?documentId=<id> — recent persisted messages.
 *
 * Returns messages as AI SDK UIMessages so the client can feed them straight
 * into `setMessages()`:
 *   - assistant messages carry their sources as a `data-sources` part, parsed
 *     out of sourcesJson — the exact same part shape the live stream uses,
 *     so rendering code is identical for live and historic messages.
 *
 * With `documentId`  → the chat log of that document.
 * Without            → the full, cross-document chat log ("All documents").
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { ChatMessage } from '@prisma/client';
import { db } from '@/lib/db';
import { citationSourcesSchema, historyQuerySchema } from '@/lib/validation';
import type { DocuMindMessage } from '@/lib/chat-types';

export const runtime = 'nodejs';

const HISTORY_LIMIT = 50;

export async function GET(request: NextRequest) {
  const parsedQuery = historyQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsedQuery.success) {
    return NextResponse.json({ error: 'Invalid query parameters.' }, { status: 400 });
  }
  const { documentId } = parsedQuery.data;

  const rows = await db.chatMessage.findMany({
    where: documentId ? { documentId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });
  rows.reverse(); // oldest → newest, ready for direct rendering

  return NextResponse.json({ messages: rows.map(rowToUiMessage) });
}

/** Rebuild a UIMessage from a persisted ChatMessage row. */
function rowToUiMessage(row: ChatMessage): DocuMindMessage {
  const parts: DocuMindMessage['parts'] = [{ type: 'text', text: row.content }];

  if (row.role === 'assistant' && row.sourcesJson) {
    try {
      const parsed = citationSourcesSchema.safeParse(JSON.parse(row.sourcesJson));
      if (parsed.success) {
        parts.push({ type: 'data-sources', data: parsed.data });
      }
    } catch {
      // A malformed historic payload must never break the chat page — skip it.
    }
  }

  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    parts,
  };
}
