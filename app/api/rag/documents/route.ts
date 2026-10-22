import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  listRagDocuments,
  saveRagDocument,
  deleteRagDocument,
  recordTelemetry,
} from '@/lib/db/sqlite-engine';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import {
  checkSlidingWindowRateLimit,
  resolveClientIdentifier,
  buildRateLimitHeaders,
} from '@/lib/security/rate-limiter';

const CreateRagDocSchema = z.object({
  title: z.string().min(2).max(140),
  content: z.string().min(10).max(12000),
  category: z
    .enum(['architecture', 'security', 'frontend', 'backend', 'database', 'ai', 'devops'])
    .optional()
    .default('architecture'),
  projectId: z.string().min(1).max(64).optional().default('global'),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? undefined;
  const threshold = Number(url.searchParams.get('threshold') ?? 0.12);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));

  const documents = listRagDocuments(query, threshold, limit);
  return NextResponse.json(
    {
      status: 'indexed',
      query: query ?? null,
      count: documents.length,
      documents,
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const rateLimit = checkSlidingWindowRateLimit(`rag-docs:${clientIp}`, env.RATE_LIMIT_RPM, 60_000);
  const rateHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAtMs: rateLimit.resetAtMs },
      { status: 429, headers: rateHeaders }
    );
  }

  try {
    const body = await request.json();
    const parsed = CreateRagDocSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: rateHeaders }
      );
    }

    const doc = saveRagDocument(parsed.data);

    recordTelemetry({
      eventType: 'RAG_DOC_INDEXED',
      projectName: doc.title.slice(0, 40),
      moduleCount: 1,
      filesCount: 1,
      bundleBytes: Buffer.byteLength(doc.content, 'utf8'),
      durationMs: performance.now() - start,
    });

    return NextResponse.json({ status: 'indexed', document: doc }, { status: 201, headers: rateHeaders });
  } catch {
    return NextResponse.json(
      { error: 'Invalid RAG document payload' },
      { status: 400, headers: rateHeaders }
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }
  const deleted = deleteRagDocument(id);
  return NextResponse.json({ deleted, id }, { status: deleted ? 200 : 404 });
}
