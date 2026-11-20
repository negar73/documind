/**
 * Shared chat types used by BOTH the API routes (streaming + history) and the
 * client (`useChat`). Parameterizing `UIMessage` with our metadata and custom
 * data parts is what gives us end-to-end typing:
 *
 *   - `metadata.documentIds` carries the chat scope (which documents to
 *     retrieve against) from `sendMessage()` to the API route.
 *   - the `data-sources` part is a custom stream data part. The API route
 *     writes it *before* the model tokens arrive, so the UI can render the
 *     "Sources" panel immediately, even while the answer is still streaming.
 */
import type { UIMessage } from 'ai';

/** One retrieved chunk, as shown in the "Sources" panel. */
export interface CitationSource {
  /** Citation number shown in the answer text: [1], [2], … */
  index: number;
  documentId: string;
  title: string;
  /** Zero-based chunk index within its document. */
  chunkIdx: number;
  /** Cosine similarity in [0, 1]. */
  score: number;
  content: string;
}

/** Payload of the custom `data-sources` stream part. */
export interface SourcesData {
  sources: CitationSource[];
}

/** Metadata attached to every outgoing user message. */
export interface ChatMessageMetadata {
  documentIds?: string[];
}

export type DocuMindMessage = UIMessage<ChatMessageMetadata, { sources: SourcesData }>;

/** Concatenated text of all text parts of a message. */
export function textOfMessage(message: DocuMindMessage): string {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .trim();
}

/** Sources data part of a message, if it has one. */
export function sourcesOfMessage(message: DocuMindMessage): CitationSource[] | null {
  for (const part of message.parts) {
    if (part.type === 'data-sources') {
      return part.data.sources;
    }
  }
  return null;
}
