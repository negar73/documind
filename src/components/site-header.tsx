'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrainCircuit, Github, LayoutGrid, MessageSquareText } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const GITHUB_URL = 'https://github.com/negarshojaei/documind';

const NAV_ITEMS = [
  { href: '/', label: 'Library', icon: LayoutGrid },
  { href: '/chat', label: 'Chat', icon: MessageSquareText },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 h-14 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="DocuMind home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BrainCircuit className="size-4.5" aria-hidden />
          </span>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-sm font-semibold tracking-tight">DocuMind</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              chat with your documents
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition',
                    active
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="DocuMind on GitHub"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Github className="size-4" aria-hidden />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
