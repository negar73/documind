import { z } from 'zod';

/**
 * Runtime configuration, validated once with Zod at first import.
 *
 * DocuMind talks to any OpenAI-compatible endpoint, so OPENAI_BASE_URL is a
 * first-class setting: point it at OpenAI, a local Ollama, Groq, Together, …
 *
 * OPENAI_API_KEY is deliberately optional here — the document library stays
 * browsable without a key (e.g. right after `npm run db:seed`), and every
 * code path that actually needs the key calls `requireOpenAIConfig()` to
 * fail with a descriptive message instead of crashing at boot.
 */
const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (see .env.example).'),

    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_BASE_URL: z.string().min(1).default('https://api.openai.com/v1'),

    EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
    // Must match the `vector(N)` column dimension in prisma/schema.prisma.
    EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),

    CHAT_MODEL: z.string().min(1).default('gpt-4o-mini'),

    // RAG tuning knobs.
    CHUNK_SIZE: z.coerce.number().int().min(100).default(1000),
    CHUNK_OVERLAP: z.coerce.number().int().min(0).default(150),
    TOP_K: z.coerce.number().int().min(1).max(20).default(5),
  })
  .refine(config => config.CHUNK_OVERLAP < config.CHUNK_SIZE, {
    message: 'CHUNK_OVERLAP must be smaller than CHUNK_SIZE.',
    path: ['CHUNK_OVERLAP'],
  });

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map(issue => `  • ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nCheck your .env file against .env.example.`);
  }
  return result.data;
}

const globalForEnv = globalThis as unknown as { __documindEnv?: z.infer<typeof envSchema> };

export const env = globalForEnv.__documindEnv ?? parseEnv();
if (process.env.NODE_ENV !== 'production') globalForEnv.__documindEnv = env;

/**
 * Throws a descriptive error when the app is asked to embed or generate
 * without a configured API key.
 */
export function requireOpenAIConfig(): { apiKey: string; baseURL: string } {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Add it to your .env file (any OpenAI-compatible endpoint works — see .env.example).'
    );
  }
  return { apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL };
}
