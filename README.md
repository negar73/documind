# DocuMind

**Chat with your documents — a production-style RAG app with pgvector retrieval, streaming answers and numbered citations.**

Upload a PDF or Markdown file, and DocuMind chunks it, embeds it into PostgreSQL via pgvector, and answers your questions with grounded, streaming responses — every claim backed by a numbered citation you can inspect in a Sources panel.

![CI](https://github.com/negar73/documind/actions/workflows/ci.yml/badge.svg)

---

## Demo

No hosted demo yet — DocuMind needs a Postgres with pgvector and an LLM endpoint behind it. Locally it is a five-minute setup:

```bash
docker compose up -d                 # Postgres 16 with pgvector preinstalled
npm install
cp .env.example .env                 # set OPENAI_API_KEY — any OpenAI-compatible endpoint works
npm run db:push && npm run db:seed   # schema + a sample document
npm run dev                          # -> http://localhost:3000
```

Start at the library page, then open **/chat** and ask about the seeded document — or upload a PDF or Markdown file of your own. Answers stream in with numbered citations; open the Sources panel and every claim links back to the exact chunk it was grounded in.

---

## Features

- **Document upload** — drag & drop `.pdf`, `.md` / `.markdown` or `.txt` files (up to 5 MB), validated on both the client and the server.
- **Recursive chunking with overlap** — a character splitter tries the most semantic separators first (paragraphs → lines → sentences → words), then merges pieces into ~`CHUNK_SIZE` chunks and carries a word-boundary-aligned tail of `CHUNK_OVERLAP` characters into the next chunk, so ideas that straddle a boundary stay retrievable.
- **Batched embeddings** — chunks are embedded in batches of 64 with one automatic retry per batch on transient failures.
- **pgvector cosine similarity search** — nearest-neighbour search with the `<=>` cosine-distance operator, converted to an intuitive `1 − distance` score, restricted to `READY` documents.
- **Grounded, streaming answers** — the model receives *only* the retrieved context, numbered `[1]…[k]`, with strict instructions to cite every claim and to admit when the documents don't contain the answer.
- **Numbered citations in the answer** — `[n]` markers are rendered as small badges that tie each claim to the Sources panel.
- **Sources accordion** — every assistant message carries a collapsible "Sources (k)" panel showing the document title, chunk position, cosine score and an expandable content preview — delivered as a stream data part *before* the first token, so it appears while the answer is still typing.
- **Document library** — cards with live processing status (`PENDING → PROCESSING → READY / FAILED`) via polling, chunk counts, chunk previews on a detail view, and cascade delete.
- **Chat history** — user and assistant turns are persisted in PostgreSQL; reloading the page restores the conversation — citations included.
- **Scoped or cross-document chat** — ask against one selected document or across the whole library, with deep links like `/chat?doc=<id>`.
- **Dark mode** — via `next-themes`, with a header toggle.
- **Provider-agnostic** — talks to *any* OpenAI-compatible API (`OPENAI_BASE_URL`): OpenAI, a fully local Ollama, Groq, Together, …
- **End-to-end type safety** — Zod-validated environment and request payloads; `UIMessage` generics share one message type between the streaming API and the client.
- **Production-ready packaging** — multi-stage Dockerfile (Next.js standalone output, non-root user) and a `docker-compose.yml` for pgvector-enabled PostgreSQL.

---

## How RAG works here

```
┌────────┐    ┌─────────────────────┐    ┌──────────────┐    ┌────────────────────┐
│ UPLOAD │───▶│ CHUNK               │───▶│ EMBED (batch)│───▶│ PGVECTOR STORE     │
└────────┘    │ CHUNK_SIZE  (1000)  │    │ 64 texts/req │    │ DocumentChunk      │
              │ CHUNK_OVERLAP (150) │    └──────────────┘    │ vector(1536)       │
              └─────────────────────┘                        └─────────▲──────────┘
                                                                       │
┌──────────┐    ┌─────────────┐    ┌───────────────────────────┐      │
│ QUESTION │───▶│ QUERY EMBED │───▶│ COSINE SEARCH  <=>        │◀─────┘
└──────────┘    │ (same model)│    │ ORDER BY emb <=> :query   │
                └─────────────┘    │ LIMIT TOP_K  (default 5)  │
                                   └────────────┬──────────────┘
                                                │ top-k chunks · score = 1 − (a <=> b)
                                                ▼
                                   ┌─────────────────────────────┐
                                   │ GROUNDED PROMPT   [1] … [k] │
                                   │ "answer only from context"  │
                                   └────────────┬────────────────┘
                                                ▼
                                   ┌─────────────────────────────┐
                                   │ STREAMING ANSWER            │
                                   │ + data-sources → Sources UI │
                                   └─────────────────────────────┘
```

**1. Upload → extract.** `POST /api/documents` stores a `Document` row (`PENDING`) and kicks off ingestion in the background. PDFs are parsed with `pdf-parse` (PDF.js under the hood); text files are decoded as UTF-8. Scanned PDFs without a text layer are rejected with a clear error rather than silently indexed empty.

**2. Chunk (size / overlap).** The extracted text is split recursively: the splitter tries paragraph, line, sentence and word separators in that order, so chunks align with the document's natural structure instead of cutting mid-sentence. A greedy merge then packs pieces up to `CHUNK_SIZE` characters. **Why overlap?** A sentence that starts at the end of one chunk and continues in the next would be incomplete in both — carrying the last `CHUNK_OVERLAP` characters (trimmed to a word boundary) into the following chunk guarantees every idea appears *in full* in at least one chunk, which directly improves retrieval recall.

**3. Embed (batch).** Chunks and questions are embedded with the *same* model, so they share one vector space. Embeddings are sent 64 at a time — small batches keep memory predictable for large documents and make retries cheap — and inserted into `DocumentChunk.embedding` in a single transaction, so a failure never leaves a half-indexed document.

**4. pgvector store.** Prisma has no first-class pgvector type, so the column is declared `Unsupported("vector(1536)")` and all vector reads/writes go through raw SQL (`$executeRaw` / `$queryRaw`) in `src/lib/vector-store.ts`. Vectors are bound as text literals cast with `::vector`, and document scoping uses `Prisma.join` for parameterized placeholders — no string interpolation of user input.

**5. Cosine search (top-k).** At query time the question is embedded and the store runs `ORDER BY embedding <=> :query LIMIT TOP_K`. `<=>` returns cosine *distance* (0 = identical, 2 = opposite), which the app converts to a similarity `score = 1 − (a <=> b)` for the UI. Search is restricted to `READY` documents, so half-ingested files never leak into answers.

**6. Grounded prompt with citations.** The top-k chunks are injected into a system prompt as a numbered context block `[1]…[k]` with strict rules: answer *only* from the context, cite every factual claim (`[1]`, `[2][3]`), and reply "I don't know — I couldn't find that in the selected documents." when the context doesn't cover it. Temperature is kept low (0.2) — grounded Q&A wants fidelity, not creativity.

**7. Streaming answer.** `streamText` merges token deltas into an AI SDK v5 UI message stream. The retrieved sources are emitted as a `data-sources` part *before* the first token, so the Sources panel renders immediately; both the user turn and the final answer (with its citations JSON) are persisted, so history survives reloads.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) · React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| AI orchestration | [Vercel AI SDK v5](https://sdk.vercel.ai) — `ai`, `@ai-sdk/openai`, `@ai-sdk/react` (`useChat`, UI message streams, `streamText`) |
| Vector search | PostgreSQL 16 + [pgvector](https://github.com/pgvector/pgvector) — cosine distance `<=>` |
| Database / ORM | Prisma 6 (`db push`, `Unsupported("vector(N)")` + raw SQL for vector ops) |
| PDF extraction | `pdf-parse` |
| Validation | Zod 4 (env config, request bodies, query params) |
| Rendering extras | `react-markdown` (citation badges) · `lucide-react` (icons) · `next-themes` (dark mode) |
| Runtime | Node.js ≥ 20 |
| Infra | Multi-stage Dockerfile (standalone output) · `docker-compose.yml` (`pgvector/pgvector:pg16`) |

---

## Getting started

**Prerequisites:** Node.js ≥ 20, Docker.

```bash
# 1. Start PostgreSQL 16 with the pgvector extension preinstalled
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create your env file
cp .env.example .env

# 4. Set your API key (any OpenAI-compatible endpoint works — see below)
#    .env →  OPENAI_API_KEY="sk-..."

# 5. Push the schema (also runs CREATE EXTENSION vector) and seed a sample document
npm run db:push
npm run db:seed

# 6. Start the dev server
npm run dev
```

Open **http://localhost:3000** — the document library — and **http://localhost:3000/chat** to start asking questions.

Useful extras:

```bash
npm run lint          # ESLint (flat config, next/core-web-vitals)
npm run typecheck     # tsc --noEmit
npm run db:generate   # regenerate the Prisma client after schema edits
```

>**Note on the seed:** `npm run db:seed` inserts one `READY` sample document ("SyncScribe product FAQ") so the UI can be explored immediately — even before an API key is configured. Its chunks use deterministic *pseudo-random* vectors, so retrieval ordering over the seed is meaningless until you upload real documents through the app.
>
>**Note on the API key:** `OPENAI_API_KEY` is optional at boot — the library stays browsable without it. Every code path that needs to embed or generate calls `requireOpenAIConfig()` and fails with a descriptive message instead of crashing at startup.

For a production image:

```bash
docker build -t documind .
docker run --rm -p 3000:3000 --env-file .env documind
```

---

## Using 100% local models with Ollama

DocuMind only assumes an OpenAI-compatible HTTP API, so it runs fully offline with [Ollama](https://ollama.com):

```bash
# 1. Pull a chat model and an embedding model
ollama pull llama3.2
ollama pull nomic-embed-text

# 2. Make sure the Ollama server is running (default: http://localhost:11434)
ollama serve
```

Then point DocuMind at it in `.env`:

```bash
OPENAI_BASE_URL="http://localhost:11434/v1"
CHAT_MODEL="llama3.2"
EMBEDDING_MODEL="nomic-embed-text"
EMBEDDING_DIM="768"
```

`OPENAI_API_KEY` can be any non-empty placeholder (e.g. `"ollama"`) — the local server ignores it, but the config check requires it to be set.

> **Important — the vector dimension must match.** `nomic-embed-text` produces 768-dimensional vectors. Update the column in `prisma/schema.prisma`:
>
>```prisma
>embedding Unsupported("vector(768)")?
>```
>
>then run `npm run db:push` again. Documents ingested with the old dimension must be re-uploaded, since their vectors are no longer comparable.

---

## Environment variables

All settings live in `.env` (template: `.env.example`) and are validated with Zod at first import — a bad config fails fast with a readable message.

| Variable | Default (`.env.example`) | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/documind?schema=public` | PostgreSQL connection string (pgvector-enabled instance from `docker-compose.yml`). |
| `OPENAI_API_KEY` | `sk-your-key-here` | API key for the LLM/embedding provider. Optional at boot; required for uploads and chat. Any OpenAI-compatible endpoint works. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Provider base URL — e.g. `http://localhost:11434/v1` (Ollama), `https://api.groq.com/openai/v1` (Groq), `https://api.together.xyz/v1` (Together). |
| `CHAT_MODEL` | `gpt-4o-mini` | Chat completion model used for grounded answers. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model used for chunks and questions (must be the same for both). |
| `EMBEDDING_DIM` | `1536` | Vector dimension. **Must match** the `vector(N)` column in `prisma/schema.prisma`. |
| `CHUNK_SIZE` | `1000` | Soft maximum characters per chunk (min 100). |
| `CHUNK_OVERLAP` | `150` | Characters carried over into the next chunk. Must be smaller than `CHUNK_SIZE`. |
| `TOP_K` | `5` | Number of chunks retrieved per question (1–20). |

---

## Project structure

```
documind/
├── .github/
│   └── workflows/                        # GitHub Actions (CI)
├── prisma/
│   ├── schema.prisma                     # Document · DocumentChunk (vector) · ChatMessage
│   └── seed.ts                           # Sample FAQ document (pseudo-random vectors)
├── public/
│   └── robots.txt
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   ├── route.ts              # POST — streaming grounded answers
│   │   │   │   └── history/route.ts      # GET  — persisted chat history
│   │   │   └── documents/
│   │   │       ├── route.ts              # GET list · POST upload + ingestion
│   │   │       └── [id]/route.ts         # GET detail + chunk previews · DELETE (cascades)
│   │   ├── chat/page.tsx                 # /chat — chat UI (optionally ?doc=<id>)
│   │   ├── page.tsx                      # /     — document library
│   │   ├── layout.tsx                    # Header, theme provider, metadata
│   │   └── globals.css
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chat-client.tsx           # useChat, document scope chips, streaming UI
│   │   │   ├── citation-markdown.tsx     # Renders [n] markers as citation badges
│   │   │   └── sources-accordion.tsx     # Collapsible per-message "Sources (k)" panel
│   │   ├── library/
│   │   │   ├── library-client.tsx        # Library grid + status polling
│   │   │   ├── document-card.tsx
│   │   │   ├── status-badge.tsx          # PENDING / PROCESSING / READY / FAILED
│   │   │   └── upload-dropzone.tsx       # Drag & drop upload with client-side validation
│   │   ├── site-header.tsx · site-footer.tsx
│   │   └── theme-provider.tsx · theme-toggle.tsx
│   ├── lib/
│   │   ├── rag.ts                        # RAG orchestration: retrieve → ground → stream
│   │   ├── ingest.ts                     # Upload pipeline: extract → chunk → embed → insert
│   │   ├── chunk.ts                      # Recursive splitter with overlap
│   │   ├── embed.ts                      # Batched embeddings with retry
│   │   ├── vector-store.ts               # pgvector raw SQL: insert + cosine search
│   │   ├── openai.ts                     # Shared OpenAI-compatible provider
│   │   ├── env.ts                        # Zod-validated runtime config
│   │   ├── db.ts                         # Prisma client singleton
│   │   ├── chat-types.ts                 # Shared UIMessage / CitationSource types
│   │   ├── validation.ts                 # Zod schemas for routes
│   │   ├── dto.ts                        # API response shapes
│   │   └── utils.ts
│   └── types/
│       └── pdf-parse.d.ts
├── .env.example
├── docker-compose.yml                    # pgvector/pgvector:pg16 + healthcheck
├── Dockerfile                            # Multi-stage production build (standalone)
├── eslint.config.mjs
├── next.config.ts                        # output: "standalone", pdf-parse external
└── package.json
```

**API at a glance**

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/documents` | `GET` | List documents with status + chunk counts |
| `/api/documents` | `POST` | Multipart upload → `PENDING` row + background ingestion |
| `/api/documents/[id]` | `GET` | Document detail incl. chunk previews |
| `/api/documents/[id]` | `DELETE` | Delete document (chunks + messages cascade) |
| `/api/chat` | `POST` | Streaming grounded answers (AI SDK UI message stream) |
| `/api/chat/history` | `GET` | Recent persisted messages, restored with citations |

---

## Roadmap

- [ ] **Hybrid search (BM25 + vector, fused with RRF)** — combine lexical and semantic rankings with Reciprocal Rank Fusion for better recall on exact terms, names and error codes.
- [ ] **Reranking** — a cross-encoder reranking pass over the top-k candidates before building the prompt.
- [ ] **OCR for scanned PDFs** — currently scanned PDFs without a text layer are rejected with a clear error; add an OCR extraction path (e.g. Tesseract).
- [ ] **Evaluation harness** — a golden Q&A set with automated retrieval-recall and answer-faithfulness checks, run in CI.
- [ ] **Auth + workspaces** — multi-tenant document libraries with per-user scoping.
- [ ] **Citation highlighting in a source viewer** — click `[1]` to open the source chunk with the quoted span highlighted.
- [ ] **Deploy to Vercel + Neon pgvector** — and move background ingestion from fire-and-forget to a queue (the swap is isolated to a single call site in `src/lib/ingest.ts`).
