import type { Metadata } from 'next';
import { ChatClient } from '@/components/chat/chat-client';

export const metadata: Metadata = {
  title: 'Chat',
};

/**
 * /chat — optionally preselects a document via /chat?doc=<id>.
 * searchParams is a Promise in Next.js 15+ and must be awaited.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  const { doc } = await searchParams;
  const initialDocumentId = typeof doc === 'string' && doc.length > 0 ? doc : undefined;
  return <ChatClient initialDocumentId={initialDocumentId} />;
}
