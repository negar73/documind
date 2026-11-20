/**
 * GET    /api/documents/[id] — document detail incl. chunk previews.
 * DELETE /api/documents/[id] — removes the document; chunks and chat messages
 *                              cascade (see prisma/schema.prisma).
 */
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { toDocumentDto, type ChunkPreviewDto } from '@/lib/dto';
import { idParamSchema } from '@/lib/validation';

export const runtime = 'nodejs';

const CHUNK_PREVIEW_CHARS = 280;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = idParamSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid document id.' }, { status: 400 });
  }

  const document = await db.document.findUnique({
    where: { id: parsed.data.id },
    include: { chunks: { orderBy: { idx: 'asc' } } },
  });
  if (!document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  // Chunks come back WITHOUT their embedding column — Unsupported columns are
  // omitted from the generated client, previews don't need vectors anyway.
  const chunks: ChunkPreviewDto[] = document.chunks.map(chunk => ({
    idx: chunk.idx,
    charCount: chunk.content.length,
    preview: chunk.content.slice(0, CHUNK_PREVIEW_CHARS),
  }));

  return NextResponse.json({ document: toDocumentDto(document), chunks });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = idParamSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid document id.' }, { status: 400 });
  }

  try {
    await db.document.delete({ where: { id: parsed.data.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
    }
    throw error;
  }

  // 204 No Content — the client removes the card from the grid.
  return new NextResponse(null, { status: 204 });
}
