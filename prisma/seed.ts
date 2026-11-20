/**
 * Seed script — inserts one READY sample document ("SyncScribe product FAQ")
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

const FILENAME = 'syncscribe-faq.md';

const FAQ_TEXT = `# SyncScribe product FAQ

## What is SyncScribe?

SyncScribe is a real-time collaborative note-taking app for distributed teams. Notes are stored as Markdown, synchronized across devices within milliseconds, and remain fully editable offline — changes made without a connection are queued locally and merged automatically the next time you come online. Every workspace is end-to-end encrypted: notes are encrypted on your device before they ever reach our servers, so even SyncScribe staff cannot read their contents.

SyncScribe runs on the web, on macOS and Windows desktop, and on iOS and Android. All platforms share the same rendering engine, so a note looks identical everywhere. Teams typically use SyncScribe for meeting notes, engineering runbooks, product specs, and personal knowledge bases.

## Key features

- Real-time co-editing with per-character presence indicators and comment threads.
- Full offline support with automatic conflict resolution; conflicting snapshots are kept for 90 days so nothing is ever silently overwritten.
- Version history: every note keeps a timeline of changes for 90 days on Pro plans and one year on Team plans, and any version can be restored or forked into a new note.
- Shared workspaces with up to 50 members per workspace, granular per-note permissions, and guest links that expire automatically.
- Integrations: push notes to Slack channels, attach GitHub issues and pull requests, and export any workspace through the CLI (npx syncscribe export) as a zip of Markdown files.
- Global command palette (Cmd/Ctrl+K) for navigation, note creation and quick actions.

## Pricing

SyncScribe has three plans. The Free plan includes 3 notebooks, syncing across 2 devices, and 7 days of version history — free forever, no credit card required. The Pro plan costs €8 per month per user (or €80 per year — two months free) and unlocks unlimited notebooks, unlimited devices, 90-day version history and all integrations. The Team plan costs €14 per user per month and adds SSO/SAML, an audit log, admin roles, priority support and one-year version history.

Students and educators receive a 40% discount on the Pro plan after verifying their academic email address. All paid plans can be cancelled at any time; accounts then drop to the Free plan at the end of the billing period and no data is deleted.

## Troubleshooting

My notes are not syncing — what should I do? First, check the sync status icon in the bottom-right corner. If it shows a yellow dot, your local queue is waiting for a connection; changes retry automatically every 30 seconds. If it shows a red dot, sign out and sign back in, then run "Reset sync cache" from Settings → Advanced; this re-downloads your workspace without losing local changes.

What happens when two people edit the same paragraph offline? SyncScribe resolves conflicts with a last-writer-wins strategy at the paragraph level, and the losing version is preserved as a snapshot in the note's version history, so conflicting work can always be recovered manually.

How do I export everything? Run npx syncscribe export --workspace <name> from the CLI, or use Settings → Export to download a zip archive of Markdown files with attachments. Exports include full version history when performed by workspace admins.

Still stuck? Email support@syncscribe.app — Team plans get a response within one business day.`;

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
      title: 'SyncScribe product FAQ',
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
