import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme-provider';
import { SiteHeader } from '@/components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'DocuMind — Chat with your documents',
    template: '%s · DocuMind',
  },
  description:
    'Upload PDFs or Markdown and chat with them: a production-style RAG pipeline with pgvector retrieval, streaming answers and numbered citations.',
  keywords: ['RAG', 'pgvector', 'Next.js', 'AI', 'documents', 'retrieval augmented generation'],
  authors: [{ name: 'Negar Shojaei' }],
  openGraph: {
    title: 'DocuMind — Chat with your documents',
    description:
      'Production-style RAG: upload documents, search them with pgvector, get streaming answers with numbered citations.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        <ThemeProvider>
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
