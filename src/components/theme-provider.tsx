'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Class-attribute theme provider (light / dark / system). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
