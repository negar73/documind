import type { Metadata } from 'next';
import { LibraryClient } from '@/components/library/library-client';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Library',
};

export default function LibraryPage() {
  return (
    <>
      <LibraryClient />
      <SiteFooter />
    </>
  );
}
