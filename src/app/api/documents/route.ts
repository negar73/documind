/**
 * POST /api/documents — multipart upload, creates the Document row (PENDING)
 * and kicks off background ingestion.
 * GET  /api/documents — list documents with status + chunk counts.
 *
 * The client polls GET /api/documents while any document is PENDING /
 * PROCESSING and re-renders as the status changes.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { toDocumentDto } from '@/lib/dto';
import {
  MAX_UPLOAD_BYTES,
  guessMimeType,
  ingestDocument,
  isSupportedUpload,
  sanitizeFilename,
  stripExtension,
} from '@/lib/ingest';

export const runtime = 'nodejs';

export async function GET() {
  const documents = await db.document.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ documents: documents.map(toDocumentDto) });
}

export async function POST(request: Request) {
  // ── Validate the multipart payload ─────────────────────────────────────────
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected a multipart/form-data upload.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Attach a document under the "file" form field.' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The uploaded file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is too large. The limit is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.` },
      { status: 413 }
    );
  }

  const filename = sanitizeFilename(file.name);
  if (!isSupportedUpload(filename)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload a PDF, Markdown or plain-text file.' },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Create the row, then ingest in the background ──────────────────────────
  const document = await db.document.create({
    data: {
      title: stripExtension(filename),
      filename,
      mimeType: guessMimeType(filename, file.type),
      sizeBytes: file.size,
      status: 'PENDING',
    },
  });

  // Fire-and-forget: the upload response must return immediately. Status
  // transitions (PENDING → PROCESSING → READY/FAILED) are observed by polling.
  void ingestDocument(document.id, buffer).catch(error =>
    console.error(`[ingest] unhandled error for document ${document.id}:`, error)
  );

  return NextResponse.json({ document: toDocumentDto(document) }, { status: 201 });
}
