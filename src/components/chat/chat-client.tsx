'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
  BrainCircuit,
  CircleAlert,
  SendHorizonal,
  Sparkles,
  Square,
  UploadCloud,
} from 'lucide-react';
import { CitationMarkdown } from '@/components/chat/citation-markdown';
import { SourcesAccordion } from '@/components/chat/sources-accordion';
import { sourcesOfMessage, textOfMessage, type DocuMindMessage } from '@/lib/chat-types';
import type { DocumentDto } from '@/lib/dto';
import { cn } from '@/lib/utils';

/**
 * The Chat experience.
 *
 *  - Document selector chips scope retrieval: "All documents" or one READY
 *    document. The scope rides on each user message as metadata
 *    (ChatMessageMetadata.documentIds) and is validated server-side.
 *  - `useChat` (AI SDK v5) streams UI message parts; the API writes the
 *    retrieved sources as a `data-sources` part BEFORE the first token, so
 *    the Sources panel appears while the answer is still streaming.
 *  - Persisted history (GET /api/chat/history) is reshaped into UIMessages
 *    and loaded with `setMessages`, so live and historic messages share the
 *    exact same rendering path.
 */
const SUGGESTIONS = [
  'Summarize the key points of the selected documents.',
  'What are the main features or topics covered?',
  'Are there any limitations, caveats or requirements mentioned?',
];

export function ChatClient({ initialDocumentId }: { initialDocumentId?: string }) {
  const [documents, setDocuments] = useState<DocumentDto[] | null>(null); // null = loading
  const [scope, setScope] = useState<string>('all');
  const [input, setInput] = useState('');

  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialScopeApplied = useRef(false);

  const { messages, sendMessage, status, stop, error, setMessages, clearError } =
    useChat<DocuMindMessage>({
      transport: new DefaultChatTransport<DocuMindMessage>({ api: '/api/chat' }),
    });

  // ── Load the library once; honor ?doc=<id> when it points at a READY doc ──
  useEffect(() => {
    let cancelled = false;
    fetch('/api/documents')
      .then(response => (response.ok ? response.json() : { documents: [] }))
      .then((data: { documents?: DocumentDto[] }) => {
        if (cancelled) return;
        const docs = data.documents ?? [];
        setDocuments(docs);
        if (!initialScopeApplied.current) {
          initialScopeApplied.current = true;
          if (
            initialDocumentId &&
            docs.some(document => document.id === initialDocumentId && document.status === 'READY')
          ) {
            setScope(initialDocumentId);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initialDocumentId]);

  const readyDocuments = (documents ?? []).filter(document => document.status === 'READY');

  // Derived scope: if the selected document disappears or is no longer READY,
  // the effective scope falls back to "all" — no cascading effect needed.
  const activeScope =
    documents !== null && scope !== 'all' && !readyDocuments.some(document => document.id === scope)
      ? 'all'
      : scope;
  const selectedTitle = readyDocuments.find(document => document.id === activeScope)?.title;

  // ── Persisted history, keyed by scope ──────────────────────────────────────
  const loadHistory = useCallback(
    async (currentScope: string) => {
      const url =
        currentScope === 'all'
          ? '/api/chat/history'
          : `/api/chat/history?documentId=${encodeURIComponent(currentScope)}`;
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const data: { messages?: DocuMindMessage[] } = await response.json();
        setMessages(data.messages ?? []);
      } catch {
        // Keep the current thread on network hiccups.
      }
    },
    [setMessages]
  );

  useEffect(() => {
    void loadHistory(activeScope);
  }, [activeScope, loadHistory]);

  // ── Sending ────────────────────────────────────────────────────────────────
  const busy = status === 'submitted' || status === 'streaming';

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendMessage({
      text: trimmed,
      metadata: activeScope === 'all' ? {} : { documentIds: [activeScope] },
    });
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  }

  function autoGrow() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  // ── Auto-scroll & retrieval indicator ──────────────────────────────────────
  const lastMessage = messages[messages.length - 1];
  const showRetrieving =
    status === 'submitted' ||
    (status === 'streaming' && lastMessage?.role === 'assistant' && textOfMessage(lastMessage) === '');

  useEffect(() => {
    const element = threadRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── Document selector ─────────────────────────────────────────────── */}
      <div className="border-b bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 overflow-x-auto pb-0.5">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Context:</span>
          <ScopeChip active={activeScope === 'all'} onClick={() => setScope('all')} disabled={documents === null}>
            All documents
          </ScopeChip>
          {readyDocuments.map(document => (
            <ScopeChip
              key={document.id}
              active={activeScope === document.id}
              onClick={() => setScope(document.id)}
              title={document.title}
            >
              {document.title}
            </ScopeChip>
          ))}
          {documents !== null && readyDocuments.length === 0 && (
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground transition hover:border-emerald-500/60 hover:text-foreground"
            >
              <UploadCloud className="size-3.5" aria-hidden />
              No READY documents yet — upload one in the Library
            </Link>
          )}
        </div>
      </div>

      {/* ── Thread ────────────────────────────────────────────────────────── */}
      <div ref={threadRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {messages.length === 0 && !busy && (
            <div className="rounded-2xl border border-dashed p-6 text-center">
              <BrainCircuit className="mx-auto size-7 text-muted-foreground/50" aria-hidden />
              <h1 className="mt-2 text-sm font-semibold">Ask anything about your documents</h1>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                Answers are grounded strictly in the selected documents — every claim carries a
                numbered citation, and the Sources panel shows exactly which chunks were used.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs transition hover:border-emerald-500/60 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(message => {
            const text = textOfMessage(message);
            const sources = sourcesOfMessage(message);
            const isLast = message.id === lastMessage?.id;

            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex animate-fade-up justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {text}
                  </div>
                </div>
              );
            }

            return (
              <div key={message.id} className="animate-fade-up space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  DocuMind
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  {text ? (
                    <CitationMarkdown text={text} caret={status === 'streaming' && isLast} />
                  ) : null}
                  {sources && sources.length > 0 && (
                    <SourcesAccordion sources={sources} className={text ? 'mt-3' : 'mt-1'} />
                  )}
                  {!text && !(sources && sources.length > 0) && (
                    <p className="text-sm text-muted-foreground">…</p>
                  )}
                </div>
              </div>
            );
          })}

          {showRetrieving && (
            <div className="flex animate-fade-up items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" aria-hidden />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" aria-hidden />
              </span>
              Retrieving context from {activeScope === 'all' ? 'all documents' : `“${selectedTitle ?? 'document'}”`}…
            </div>
          )}
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="px-4 pb-2">
          <div
            role="alert"
            className="mx-auto flex max-w-3xl items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
          >
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-words">{error.message}</span>
            <button type="button" onClick={clearError} className="shrink-0 underline underline-offset-2">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Composer ──────────────────────────────────────────────────────── */}
      <div className="border-t bg-background/95 px-4 py-3 backdrop-blur">
        <form
          className="mx-auto max-w-3xl"
          onSubmit={event => {
            event.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={event => {
                setInput(event.target.value);
                autoGrow();
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder={
                activeScope === 'all'
                  ? 'Ask about all documents…'
                  : `Ask about “${selectedTitle ?? 'this document'}”…`
              }
              aria-label="Your question"
              disabled={busy && status === 'streaming'}
              className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border text-foreground transition hover:bg-accent"
              >
                <Square className="size-3.5" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                <SendHorizonal className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line · answers cite sources as [1], [2]…
          </p>
        </form>
      </div>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition disabled:opacity-50',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:border-emerald-500/60 hover:text-foreground'
      )}
    >
      <span className={cn('size-1.5 rounded-full', active ? 'bg-primary-foreground' : 'bg-emerald-500')} aria-hidden />
      <span className="max-w-48 truncate">{children}</span>
    </button>
  );
}
