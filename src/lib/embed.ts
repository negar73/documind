/**
 * Embedding — the second stage of the RAG pipeline.
 *
 * Text chunks and user questions are turned into dense vectors with the
 * configured embedding model. All requests go through `src/lib/openai.ts`,
 * whose provider is pointed at ANY OpenAI-compatible endpoint via
 * OPENAI_BASE_URL (OpenAI, Ollama, Groq, Together, …).
 *
 * Embeddings are sent in small batches: the OpenAI embeddings endpoint
 * accepts up to ~2k inputs per request, but smaller batches keep memory
 * usage predictable for large documents and make retries cheap.
 */
import { embedMany } from 'ai';
import { embeddingModel } from './openai';

/** Number of texts per embedding request. */
const BATCH_SIZE = 64;

/**
 * Embed a list of texts, returning one vector per input **in input order**
 * (guaranteed by `embedMany`).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const embeddings: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    // Retry once per batch: embedding endpoints occasionally fail with
    // transient network or rate-limit errors that resolve immediately.
    const { embeddings: batchEmbeddings } = await withRetry(() =>
      embedMany({
        model: embeddingModel(),
        values: batch,
      })
    );
    embeddings.push(...batchEmbeddings);
  }
  return embeddings;
}

/** Convenience wrapper for embedding a single question at query time. */
export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  if (!embedding) throw new Error('Embedding endpoint returned no vector for the query.');
  return embedding;
}

/** Run `fn`, retrying once (with a short backoff) before giving up. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 600): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.error(`[embed] attempt ${attempt}/${attempts} failed:`, error);
      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}
