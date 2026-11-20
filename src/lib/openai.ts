/**
 * A single shared OpenAI-compatible provider instance.
 *
 * `baseURL` comes from env (default: https://api.openai.com/v1), which is
 * what makes DocuMind provider-agnostic: the exact same code runs against
 * OpenAI, a local Ollama (`http://localhost:11434/v1`), Groq, Together, …
 */
import { createOpenAI } from '@ai-sdk/openai';
import { env, requireOpenAIConfig } from './env';

type OpenAIProviderInstance = ReturnType<typeof createOpenAI>;

const globalForAI = globalThis as unknown as {
  __documindAIProvider?: OpenAIProviderInstance;
};

export function getOpenAIProvider(): OpenAIProviderInstance {
  if (!globalForAI.__documindAIProvider) {
    const { apiKey, baseURL } = requireOpenAIConfig();
    globalForAI.__documindAIProvider = createOpenAI({ apiKey, baseURL });
  }
  return globalForAI.__documindAIProvider;
}

/** Chat completion model used for grounded answers. */
export function chatModel() {
  return getOpenAIProvider().chat(env.CHAT_MODEL);
}

/** Embedding model used for chunks and questions. */
export function embeddingModel() {
  return getOpenAIProvider().textEmbeddingModel(env.EMBEDDING_MODEL);
}
