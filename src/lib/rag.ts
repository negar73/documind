/**
 * RAG orchestration — the heart of DocuMind.
 *
 * For every user turn:
 *
 *   1. Embed the question (same model as ingestion → same vector space).
 *   2. Retrieve the TOP_K most similar chunks from pgvector (cosine `<=>`),
 *      scoped to the selected documents (or all READY documents).
 *   3. Build a grounded system prompt that contains ONLY the retrieved
 *      context, numbered [1]..[k], and strict instructions to cite and to
 *      admit ignorance.
 *   4. Stream the answer to the client with `streamText`, and — importantly —
 *      emit the retrieved sources as a `data-sources` stream part BEFORE the
 *      first token so the UI can render the Sources panel immediately.
 *   5. Persist the user turn and (once generation finishes) the assistant
 *      turn with its sources JSON, so history survives reloads.
 */
import { streamText, type ModelMessage, type UIMessageStreamWriter } from 'ai';
import { db } from './db';
import { env, requireOpenAIConfig } from './env';
import { embedQuery } from './embed';
import { chatModel } from './openai';
import { searchChunks } from './vector-store';
import { textOfMessage, type CitationSource, type DocuMindMessage } from './chat-types';

/**
 * Stream a grounded answer for the incoming UI messages.
 *
 * @param uiMessages full conversation (sent by useChat; the last user message
 *        is the new question, earlier messages provide multi-turn context).
 * @param writer the UI message stream writer — data parts and merged model
 *        tokens flow through it to the client.
 * @param abortSignal aborted when the client disconnects or presses "Stop";
 *        forwarded to the model so generation actually stops server-side.
 */
export async function streamGroundedAnswer({
  uiMessages,
  writer,
  abortSignal,
}: {
  uiMessages: DocuMindMessage[];
  writer: UIMessageStreamWriter<DocuMindMessage>;
  abortSignal?: AbortSignal;
}): Promise<void> {
  // ── 0. Extract the question and the chat scope ────────────────────────────
  const lastUserMessage = [...uiMessages].reverse().find(message => message.role === 'user');
  if (!lastUserMessage) {
    writer.write({ type: 'error', errorText: 'Please send a non-empty question.' });
    return;
  }
  const question = textOfMessage(lastUserMessage);
  if (!question) {
    writer.write({ type: 'error', errorText: 'Please send a non-empty question.' });
    return;
  }

  const selectedDocumentIds = extractSelectedDocumentIds(lastUserMessage);
  // ChatMessage.documentId stores a single scope for history filtering;
  // multi-document chats are stored without a document scope.
  const chatDocumentId =
    selectedDocumentIds && selectedDocumentIds.length === 1 ? selectedDocumentIds[0] : null;

  // Persist the user turn right away — even if generation fails, the
  // conversation log stays truthful.
  await db.chatMessage.create({
    data: { documentId: chatDocumentId, role: 'user', content: question },
  });

  // ── 1. Resolve the selection against READY documents ──────────────────────
  let scopeIds: string[] | null;
  if (!selectedDocumentIds || selectedDocumentIds.length === 0) {
    scopeIds = null; // "All documents" → search across every READY document
  } else {
    const ready = await db.document.findMany({
      where: { id: { in: selectedDocumentIds }, status: 'READY' },
      select: { id: true },
    });
    scopeIds = ready.map(document => document.id);
    if (scopeIds.length === 0) {
      writer.write({
        type: 'error',
        errorText: 'None of the selected documents are ready yet. Wait for processing to finish, then try again.',
      });
      return;
    }
  }

  // ── 2. Retrieve context (embed question → cosine search) ──────────────────
  let sources: CitationSource[];
  try {
    requireOpenAIConfig(); // friendly error before hitting the endpoint
    sources = await retrieveContext(question, scopeIds);
  } catch (error) {
    console.error('[rag] retrieval failed:', error);
    writer.write({ type: 'error', errorText: describeError(error, 'Could not retrieve context.') });
    return;
  }

  // ── 3. Send sources to the client as a stream data part ───────────────────
  // Non-transient data parts become part of the assistant UIMessage, so the
  // Sources panel renders immediately and matches what history will return.
  writer.write({ type: 'data-sources', data: { sources } });

  // ── 4. Stream a grounded, citation-forced answer ──────────────────────────
  const result = streamText({
    model: chatModel(),
    system: buildSystemPrompt(sources),
    messages: toModelMessages(uiMessages),
    temperature: 0.2, // low temperature: grounded Q&A wants fidelity, not creativity
    abortSignal,
  });

  writer.merge(
    result.toUIMessageStream<DocuMindMessage>({
      onError: error => describeError(error, 'The model failed to respond.'),
    })
  );

  // ── 5. Persist the assistant turn once generation completes ───────────────
  let answer = '';
  try {
    answer = await result.text;
  } catch (error) {
    // Aborted by the client or failed mid-stream — keep whatever is truthful.
    console.error('[rag] generation did not complete:', error);
  }
  if (answer.trim()) {
    await db.chatMessage
      .create({
        data: {
          documentId: chatDocumentId,
          role: 'assistant',
          content: answer,
          sourcesJson: JSON.stringify({ sources }),
        },
      })
      .catch(error => console.error('[rag] failed to persist answer:', error));
  }
}

/**
 * Question → query embedding → TOP_K nearest chunks.
 * Search is scoped to READY documents so half-ingested files never leak into
 * answers.
 */
export async function retrieveContext(
  question: string,
  documentIds: string[] | null
): Promise<CitationSource[]> {
  const queryEmbedding = await embedQuery(question);
  const rows = await searchChunks(queryEmbedding, documentIds, env.TOP_K);
  return rows.map((row, i) => ({
    index: i + 1, // citation numbers [1]..[k] in relevance order
    documentId: row.documentId,
    title: row.title,
    chunkIdx: row.idx,
    score: row.score,
    content: row.content,
  }));
}

/**
 * The grounded prompt. Everything the model is allowed to know lives in the
 * numbered context block; the instructions force citations and honesty.
 */
function buildSystemPrompt(sources: CitationSource[]): string {
  const context =
    sources.length > 0
      ? sources
          .map(source => `[${source.index}] (${source.title} — chunk ${source.chunkIdx + 1})\n${source.content}`)
          .join('\n\n---\n\n')
      : '(no relevant context was retrieved)';

  return `You are DocuMind, a precise assistant that answers questions strictly from the provided document context.

Rules:
- Base your answer ONLY on the numbered context below. Never use outside knowledge.
- Cite every factual claim with the source number in square brackets, e.g. [1] or [2][3].
- If the context does not contain the answer, reply: "I don't know — I couldn't find that in the selected documents." Optionally suggest which document might cover it.
- Be concise: short paragraphs or bullet lists. Do not invent sources, numbers or quotes.

Context:
${context}`;
}

/**
 * Convert UI messages (which may contain data parts, tool parts, …) into
 * plain text model messages. DocuMind only ever produces text parts, so a
 * transparent mapping is enough — and it keeps the full conversation as
 * multi-turn context for follow-up questions.
 */
function toModelMessages(messages: DocuMindMessage[]): ModelMessage[] {
  return messages.flatMap(message => {
    if (message.role === 'system') return [];
    const text = textOfMessage(message);
    if (!text) return [];
    return [{ role: message.role, content: text } satisfies ModelMessage];
  });
}

/** Read the chat scope (selected document ids) from the message metadata. */
function extractSelectedDocumentIds(message: DocuMindMessage): string[] | null {
  const ids = message.metadata?.documentIds;
  if (!Array.isArray(ids)) return null;
  const clean = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return clean.length > 0 ? clean : null;
}

/** Compact, user-safe error text for stream error parts. */
function describeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${fallback} ${message}`.trim().slice(0, 300);
}
