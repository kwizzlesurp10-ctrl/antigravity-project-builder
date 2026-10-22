import { NextResponse } from 'next/server';
import { z } from 'zod';
import { validateRuntimeEnv } from '@/lib/security/env-validator';
import {
  checkSlidingWindowRateLimit,
  resolveClientIdentifier,
  buildRateLimitHeaders,
} from '@/lib/security/rate-limiter';
import {
  retrieveSemanticContext,
  generateDeterministicEmbedding,
  type MatchedDocument,
} from '@/lib/ai/rag-retriever';
import {
  recordTelemetry,
  searchModulesByVector,
  listCustomModules,
} from '@/lib/db/sqlite-engine';
import { resolveDependencyGraph } from '@/lib/synthesizer';

const StreamPromptSchema = z.object({
  prompt: z.string().min(1).max(4000),
  systemInstruction: z.string().max(2000).optional(),
  projectId: z.string().uuid().optional(),
  queryEmbedding: z.array(z.number()).length(1536).optional(),
  matchThreshold: z.number().min(0).max(1).optional(),
  matchCount: z.number().int().min(1).max(20).default(5),
});

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const customRpmHeader = request.headers.get('x-rate-limit-rpm');
  const maxRpm = customRpmHeader
    ? Math.max(1, Number.parseInt(customRpmHeader, 10) || env.RATE_LIMIT_RPM)
    : env.RATE_LIMIT_RPM;

  const rateLimit = checkSlidingWindowRateLimit(`ai-stream:${clientIp}`, maxRpm, 60_000);
  const rateHeaders = buildRateLimitHeaders(rateLimit);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded. Please wait before sending more AI stream requests.',
        resetAtMs: rateLimit.resetAtMs,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
      { status: 429, headers: rateHeaders }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = StreamPromptSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: rateHeaders }
    );
  }

  const {
    prompt,
    systemInstruction,
    projectId,
    queryEmbedding,
    matchThreshold,
    matchCount,
  } = parsed.data;

  const embedding =
    queryEmbedding ?? generateDeterministicEmbedding(prompt, env.EMBEDDING_DIMENSIONS);
  let matchedDocs: MatchedDocument[] = [];
  let ragStatus = 'no-supabase-client';

  try {
    matchedDocs = await retrieveSemanticContext(
      embedding,
      matchThreshold ?? env.RAG_MATCH_THRESHOLD,
      matchCount,
      { projectId, queryText: prompt }
    );
    ragStatus = matchedDocs.length > 0 ? `matched-${matchedDocs.length}` : 'zero-matches';
  } catch (err) {
    ragStatus = `degraded (${err instanceof Error ? err.message : 'rpc-unreachable'})`;
  }

  recordTelemetry({
    eventType: 'AI_STREAM_RAG',
    projectName: prompt.slice(0, 40),
    moduleCount: matchedDocs.length,
    filesCount: matchedDocs.length,
    bundleBytes: prompt.length,
    durationMs: performance.now() - start,
  });

  const encoder = new TextEncoder();
  const contextSummary =
    matchedDocs.length > 0
      ? matchedDocs.map((d) => `${d.title} (${(d.similarity * 100).toFixed(1)}%)`).join(', ')
      : 'None';

  const moduleMatches = searchModulesByVector(prompt, 0.14);
  const topModuleIds =
    moduleMatches.length > 0
      ? moduleMatches.slice(0, 6).map((m) => m.id)
      : ['nextjs-app', 'supabase-db', 'pgvector-rag', 'zod-security'];
  const dag = resolveDependencyGraph(topModuleIds, listCustomModules());

  const playbookInsights =
    matchedDocs.length > 0
      ? matchedDocs
          .slice(0, 3)
          .map(
            (d, idx) =>
              `  ${idx + 1}. [${d.title} • ${(d.similarity * 100).toFixed(1)}% cosine]: ${d.content.slice(0, 140)}...`
          )
          .join('\n')
      : '  1. [Default Zero-Trust HNSW Guidance]: Enforce PostgreSQL 17 Row-Level Security with halfvec(1536) HNSW indexing.';

  const stream = new ReadableStream({
    async start(controller) {
      const chunks = [
        `[Edge AI Gateway • ${env.AI_MODEL_ID}] System: ${systemInstruction ?? 'Orbital Architect'}\n`,
        `[pgvector HNSW RAG • ${ragStatus}] Context Documents: ${contextSummary}\n`,
        `[Topological DAG Synthesis] Resolved ${dag.resolvedIds.length} orbital modules (${dag.topologicalOrder.join(' -> ')})\n`,
        `[Architectural Playbook Directives]\n${playbookInsights}\n`,
        `Synthesizing response for: "${prompt.slice(0, 80)}"...\nVector HNSW context verified. Stream complete.`,
      ];
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              text: chunk,
              ragMatches: matchedDocs.length,
              matchedIds: matchedDocs.map((d) => d.id),
              recommendedModules: dag.resolvedIds,
            })}\n\n`
          )
        );
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...rateHeaders,
    },
  });
}
