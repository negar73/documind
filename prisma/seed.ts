/**
 * Seed script — inserts one READY sample document ("DocuMind product FAQ")
 * so the UI can be explored immediately after `npm run db:push`, even before
 * an embedding endpoint is configured.
 *
 *   npm run db:seed
 *
 * ⚠ LEARNING NOTE — the sample chunks use deterministic *pseudo-random*
 * vectors (seeded per chunk index), NOT real embeddings:
 *   - the point is UI exploration (status badges, chunk previews, chat shell);
 *   - cosine similarity between pseudo-random unit vectors is ~0.5 for every
 *     pair, so retrieval ordering is meaningless until a real embedding
 *     endpoint (OpenAI, Ollama, …) is configured and documents are ingested
 *     through the app.
 * The vector dimension must match the `vector(N)` column in
 * prisma/schema.prisma (EMBEDDING_DIM default: 1536).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { chunkText } from '../src/lib/chunk';
import { insertChunk } from '../src/lib/vector-store';

/** Must match the vector column dimension in prisma/schema.prisma. */
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM ?? 1536);

const FILENAME = 'documind-faq.md';

const FAQ_TEXT = `# DocuMind product FAQ

## What is DocuMind?

DocuMind is a self-hosted research assistant that turns a folder of documents into a knowledge base you can chat with. Upload PDFs, Markdown or text files, and every question is answered strictly from the retrieved passages — each claim carries a numbered citation like [1] that points back to the exact chunk it came from, and when the documents do not contain the answer, the model says so instead of inventing one. Documents, chunks, vectors and chat history all live in your own Postgres database, so nothing leaves your infrastructure except the requests to the embedding and language model endpoints you configure yourself.

DocuMind runs entirely on your machine or your own server. The Next.js app talks to Postgres with pgvector for retrieval, and the embedding and chat models are plain OpenAI-compatible HTTP endpoints — swap in Ollama and the whole pipeline stays local, which is exactly what teams with confidential material usually need.

## Key features

- Ingestion pipeline with smart chunking and overlap, so long documents stay coherent across chunk boundaries.
- Batched embeddings stored as pgvector columns — retrieval is a single ORDER BY embedding <=> query LIMIT k inside Postgres, with no separate vector database to run.
- Grounded, streaming answers rendered token by token, with the Sources panel populated before the first token is even shown.
- A citation list next to every answer that maps each numbered reference back to the exact passage and its similarity score.
- Works with any OpenAI-compatible endpoint, including a fully local setup through Ollama, so confidential material never leaves the machine.
- Chat history persisted per document, so follow-up questions keep their context across reloads.

## Data and privacy

DocuMind is built for material you would rather keep in-house. Uploaded files, their chunks, the embedding vectors and the conversation transcripts are ordinary rows in your own database, and deleting a document cascades to its chunks, vectors and messages. For regulated environments, point the embedding and chat base-URL environment variables at an on-premise OpenAI-compatible gateway or a local Ollama instance — the application code contains no hardcoded cloud calls. The bundled sample document ships with deterministic pseudo-random vectors on purpose, so there is no real content to leak while you explore the UI.

## Troubleshooting

My document is stuck in PROCESSING — what should I do? Check that the embedding endpoint environment variables are set and reachable; ingestion pushes chunks through that endpoint in batches and marks the document READY only once every batch succeeds. The document panel shows the failing batch id, and you can retry ingestion from the document menu without re-uploading the file.

Why do answers look unrelated to my question? Retrieval orders chunks by cosine similarity, and the seeded sample document uses pseudo-random vectors by design — every pair scores around 0.5, so the ordering is meaningless until you ingest real content. Upload one of your own documents and the citation panel starts pointing at the passages you would expect.

Can I chat in languages other than English? Yes. Chunking splits on paragraph boundaries regardless of script, retrieval is language-agnostic, and the model answers in the language of your question. Citations stay numeric, so the Sources panel behaves the same way in every language.

Still stuck? Email support@documind.app — include the document id and the last ten lines of the server log, and you will get a response within one business day.`;

/**
 * Deterministic PRNG (mulberry32) → normalized pseudo-random unit vector.
 * Same chunk index ⇒ same vector ⇒ seeding is reproducible.
 */
function deterministicVector(seed: number, dim: number): number[] {
  let state = (seed + 0x6d2b79f5) | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const values = Array.from({ length: dim }, () => random() * 2 - 1);
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map(value => value / norm);
}

async function main() {
  // Idempotent: replace any previously seeded copy of the sample document.
  const existing = await db.document.findFirst({ where: { filename: FILENAME } });
  if (existing) {
    await db.document.delete({ where: { id: existing.id } }); // chunks cascade
  }

  const document = await db.document.create({
    data: {
      title: 'DocuMind product FAQ',
      filename: FILENAME,
      mimeType: 'text/markdown',
      sizeBytes: Buffer.byteLength(FAQ_TEXT, 'utf-8'),
      status: 'READY',
    },
  });

  const chunks = chunkText(FAQ_TEXT, {
    size: Number(process.env.CHUNK_SIZE ?? 1000),
    overlap: Number(process.env.CHUNK_OVERLAP ?? 150),
  });

  await db.$transaction(
    chunks.map(chunk =>
      insertChunk({
        id: randomUUID(),
        documentId: document.id,
        idx: chunk.idx,
        content: chunk.content,
        embedding: deterministicVector(chunk.idx * 7919, EMBEDDING_DIM),
      })
    )
  );

  await db.document.update({
    where: { id: document.id },
    data: { chunkCount: chunks.length },
  });

  console.log(`Seeded "${document.title}" (${chunks.length} chunks, vector dim ${EMBEDDING_DIM}).`);
}

main()
  .catch(error => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
