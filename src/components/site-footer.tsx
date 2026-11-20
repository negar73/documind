import { BrainCircuit } from 'lucide-react';

/**
 * Site footer. Rendered inside the Library page so it naturally sits at the
 * bottom of the flex column (`mt-auto`) and is pushed below the fold when
 * the content grows — the Chat page uses the full viewport height instead.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
        <p className="flex items-center gap-1.5">
          <BrainCircuit className="size-3.5" aria-hidden />
          DocuMind — chat with your documents
        </p>
        <p>
          Built with Next.js, pgvector &amp; the AI SDK by{' '}
          <a
            href="https://github.com/negarshojaei"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2 hover:text-foreground"
          >
            Negar Shojaei
          </a>{' '}
          · MIT
        </p>
      </div>
    </footer>
  );
}
