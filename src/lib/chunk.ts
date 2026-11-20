/**
 * Chunking — the first stage of the RAG pipeline.
 *
 * Documents are split into overlapping chunks of ~CHUNK_SIZE characters.
 * A recursive character splitter tries the most "semantic" separators first
 * (paragraphs → lines → sentences → words → characters) so chunks align with
 * the document's natural structure instead of cutting mid-sentence whenever
 * possible.
 *
 * Why overlap? An idea discussed across a chunk boundary (a sentence that
 * starts at the end of chunk 3 and continues in chunk 4) would otherwise be
 * split in half and neither chunk would contain it completely. Overlapping
 * the last CHUNK_OVERLAP characters of a chunk into the next one gives every
 * idea at least one chunk where it appears in full — which directly improves
 * retrieval recall.
 */

export interface TextChunk {
  /** Zero-based position of the chunk inside the document. */
  idx: number;
  content: string;
}

export interface ChunkOptions {
  /** Soft maximum number of characters per chunk. */
  size: number;
  /** Number of characters carried over from the previous chunk. Must be < size. */
  overlap: number;
}

/**
 * Separator priority, from most to least semantic:
 *  - "\n\n" paragraph breaks (Markdown sections, FAQ blocks…)
 *  - "\n"    line breaks (list items, table rows…)
 *  - ". "    sentence ends (the trailing space keeps sentences glued together)
 *  - " "     word boundaries
 *  - ""      last resort: hard character split (also the cap for single huge tokens)
 */
const SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

/**
 * Split `text` into indexed chunks. The output chunks are ordered and, when
 * concatenated (plus the duplicated overlap), cover the entire input text.
 */
export function chunkText(text: string, options: ChunkOptions): TextChunk[] {
  const { size, overlap } = options;
  if (size < 1) throw new Error('Chunk size must be at least 1 character.');
  if (overlap < 0 || overlap >= size) {
    throw new Error(`Chunk overlap (${overlap}) must be >= 0 and smaller than the chunk size (${size}).`);
  }

  // Normalize line endings and collapse 3+ consecutive newlines so the
  // splitter sees a predictable "\n\n" paragraph boundary.
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return [];

  const pieces = splitRecursively(normalized, SEPARATORS, size);
  const chunks = mergeWithOverlap(pieces, size, overlap);

  return chunks.map((content, idx) => ({ idx, content }));
}

/**
 * Recursively split `text` by the first separator that actually helps, keeping
 * separators attached to the end of each piece so merging loses no content.
 */
function splitRecursively(text: string, separators: string[], maxSize: number): string[] {
  const separator = separators[0];

  // Nothing left to try — return as-is (mergeWithOverlap hard-splits oversize pieces).
  if (separator === undefined) return [text];
  if (text.length <= maxSize) return [text];

  if (separator === '') {
    // Character-level fallback: every piece is guaranteed to fit.
    return splitByLength(text, maxSize);
  }

  const segments = splitKeepSeparator(text, separator);
  if (segments.length <= 1) {
    // This separator does not occur in the text — try the next one.
    return splitRecursively(text, separators.slice(1), maxSize);
  }

  const pieces: string[] = [];
  for (const segment of segments) {
    if (segment.trim().length === 0) continue; // drop whitespace-only pieces
    if (segment.length <= maxSize) {
      pieces.push(segment);
    } else {
      // A single segment is still too large — descend to a finer separator.
      pieces.push(...splitRecursively(segment, separators.slice(1), maxSize));
    }
  }
  return pieces;
}

/** Split by `separator`, keeping the separator at the END of each piece. */
function splitKeepSeparator(text: string, separator: string): string[] {
  const parts = text.split(separator);
  const pieces: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const piece = isLast ? parts[i] : parts[i] + separator;
    if (piece.length > 0) pieces.push(piece);
  }
  return pieces;
}

/**
 * Greedy merge: accumulate pieces until adding the next one would exceed the
 * chunk size, then flush and start the next chunk with an overlapping tail of
 * the previous one.
 */
function mergeWithOverlap(pieces: string[], maxSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    if (current.length + piece.length > maxSize && current.trim().length > 0) {
      chunks.push(current.trim());
      current = overlapTail(current, overlap);
    }

    if (piece.length > maxSize) {
      // Defensive path: a piece that survived recursion (e.g. one gigantic
      // token). Hard-split it so no chunk ever grows unbounded.
      for (const slice of splitByLength(piece, maxSize)) {
        if (current.length + slice.length > maxSize && current.trim().length > 0) {
          chunks.push(current.trim());
          current = overlapTail(current, overlap);
        }
        current += slice;
      }
      continue;
    }

    current += piece;
  }

  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

/**
 * Take the last `overlap` characters of a chunk, trimmed to start at a word
 * boundary so the overlap reads like natural text rather than half a word.
 */
function overlapTail(chunk: string, overlap: number): string {
  if (overlap <= 0) return '';
  const tail = chunk.slice(-overlap);
  const wordStart = tail.indexOf(' ');
  const boundary = wordStart === -1 ? tail : tail.slice(wordStart + 1);
  return boundary.trim().length > 0 ? `${boundary.trimStart()} ` : '';
}

/** Hard character split used as the final fallback. */
function splitByLength(text: string, size: number): string[] {
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    pieces.push(text.slice(i, i + size));
  }
  return pieces;
}
