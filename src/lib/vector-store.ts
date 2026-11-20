/**
 * Vector store — pgvector access layer.
 *
 * ┌─ LEARNING NOTE ──────────────────────────────────────────────────────────┐
 * │ The `DocumentChunk.embedding` column is declared                        │
 * │ `Unsupported("vector(1536)")` in prisma/schema.prisma. Prisma has no     │
 * │ first-class pgvector type, so Unsupported columns are invisible to the  │
 * │ generated client: they cannot be created, filtered or read through      │
 * │ `db.documentChunk.*`. All reads/writes therefore go through raw SQL —   │
 * │ `$executeRaw` for writes and `$queryRaw` for similarity search — while  │
 * │ the plain Prisma Client keeps handling everything else.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * The pgvector cosine-distance operator `<=>` returns the *distance*
 * (0 = identical, 2 = opposite). We convert it to a similarity score with
 * `1 - (a <=> b)` so the UI can show an intuitive 0..1 score.
 */
import { Prisma } from '@prisma/client';
import { db } from './db';

export interface ChunkSearchRow {
  id: string;
  content: string;
  idx: number;
  documentId: string;
  title: string;
  /** Cosine similarity in [0, 1] — higher is more relevant. */
  score: number;
}

/**
 * Serialize a JS number array into pgvector's text representation
 * (e.g. "[0.12,-0.33,0.7]"). Bound as a $n parameter and cast with
 * `::vector` so Postgres parses it into the vector type.
 */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Build the raw INSERT for one chunk + its embedding.
 *
 * Returns the `PrismaPromise` without awaiting so callers can compose it:
 * `await insertChunk(...)` for a single insert, or collect several and pass
 * them to `db.$transaction([...])` for an atomic batch.
 */
export function insertChunk(input: {
  id: string;
  documentId: string;
  idx: number;
  content: string;
  embedding: number[];
}): Prisma.PrismaPromise<number> {
  const vectorLiteral = toVectorLiteral(input.embedding);
  return db.$executeRaw`
    INSERT INTO "DocumentChunk" ("id", "documentId", "idx", "content", "embedding")
    VALUES (${input.id}, ${input.documentId}, ${input.idx}, ${input.content}, ${vectorLiteral}::vector)
  `;
}

/**
 * Nearest-neighbour search: find the `topK` chunks whose embeddings are
 * closest (cosine distance, `<=>`) to the query embedding.
 *
 * @param documentIds restrict the search to these documents, or `null` to
 *        search across every READY document in the library.
 *
 * The query is backed by the ivfflat/hnsw index that pgvector builds on the
 * embedding column when present; `ORDER BY embedding <=> $vec` is exactly the
 * shape pgvector indexes are designed for.
 */
export async function searchChunks(
  queryEmbedding: number[],
  documentIds: string[] | null,
  topK: number
): Promise<ChunkSearchRow[]> {
  const vectorLiteral = toVectorLiteral(queryEmbedding);

  // Optional per-document scope. `Prisma.join` expands the array into safe,
  // parameterized placeholders (no string interpolation of user input).
  const scopeFilter =
    documentIds && documentIds.length > 0
      ? Prisma.sql`AND c."documentId" IN (${Prisma.join(documentIds)})`
      : Prisma.empty;

  const rows = await db.$queryRaw<ChunkSearchRow[]>(Prisma.sql`
    SELECT
      c."id",
      c."content",
      c."idx",
      d."id"     AS "documentId",
      d."title",
      1 - (c."embedding" <=> ${vectorLiteral}::vector) AS "score"
    FROM "DocumentChunk" c
    INNER JOIN "Document" d ON d."id" = c."documentId"
    WHERE c."embedding" IS NOT NULL
      AND d."status" = 'READY'
      ${scopeFilter}
    ORDER BY c."embedding" <=> ${vectorLiteral}::vector
    LIMIT ${topK}
  `);

  return rows;
}
