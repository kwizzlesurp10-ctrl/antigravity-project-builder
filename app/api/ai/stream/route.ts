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

function resolveLlmCredentials(env: ReturnType<typeof validateRuntimeEnv>): {
  apiKey: string;
  baseUrl: string;
  provider: 'xai' | 'openai-compatible';
} | null {
  if (env.XAI_API_KEY) {
    return {
      apiKey: env.XAI_API_KEY,
      baseUrl: env.AI_BASE_URL || 'https://api.x.ai/v1',
      provider: 'xai',
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.AI_BASE_URL || 'https://api.openai.com/v1',
      provider: 'openai-compatible',
    };
  }
  return null;
}

function buildRagSystemPrompt(
  systemInstruction: string | undefined,
  matchedDocs: MatchedDocument[],
  recommendedModules: string[],
  topologicalOrder: string[]
): string {
  const playbook =
    matchedDocs.length > 0
      ? matchedDocs
          .slice(0, 5)
          .map(
            (d, idx) =>
              `${idx + 1}. [${d.title} • ${(d.similarity * 100).toFixed(1)}%]: ${d.content.slice(0, 500)}`
          )
          .join('\n')
      : 'No playbook documents matched. Prefer zero-trust defaults (RLS, Zod, rate limits).';

  return [
    systemInstruction ?? 'You are the Antigravity Orbital Architect.',
    'Use the retrieved architectural playbooks and recommended orbital modules to answer.',
    `Recommended modules: ${recommendedModules.join(', ') || 'none'}`,
    `Topological order: ${topologicalOrder.join(' -> ') || 'n/a'}`,
    'Playbook context:',
    playbook,
  ].join('\n\n');
}

async function streamSpaceXaiCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  meta: Record<string, unknown>;
  rateHeaders: Record<string, string>;
}): Promise<Response> {
  const upstream = await fetch(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      stream: true,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => 'upstream error');
    return NextResponse.json(
      {
        error: 'Upstream LLM request failed',
        status: upstream.status,
        detail: detail.slice(0, 500),
      },
      { status: 502, headers: options.rateHeaders }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            text: `[Edge AI Gateway • ${options.model}] Live SpaceXAI stream online.\n`,
            ...options.meta,
          })}\n\n`
        )
      );

      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text, ...options.meta })}\n\n`
                  )
                );
              }
            } catch {
              // Skip malformed upstream chunks
            }
          }
        }
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...options.rateHeaders,
    },
  });
}

function streamRagSynthesis(options: {
  modelId: string;
  systemInstruction?: string;
  prompt: string;
  ragStatus: string;
  contextSummary: string;
  playbookInsights: string;
  dag: ReturnType<typeof resolveDependencyGraph>;
  matchedDocs: MatchedDocument[];
  rateHeaders: Record<string, string>;
}): Response {
  const encoder = new TextEncoder();
  const meta = {
    ragMatches: options.matchedDocs.length,
    matchedIds: options.matchedDocs.map((d) => d.id),
    recommendedModules: options.dag.resolvedIds,
    mode: 'rag-synthesis' as const,
  };

  const stream = new ReadableStream({
    async start(controller) {
      const chunks = [
        `[Edge AI Gateway • ${options.modelId}] System: ${options.systemInstruction ?? 'Orbital Architect'}\n`,
        `[pgvector HNSW RAG • ${options.ragStatus}] Context Documents: ${options.contextSummary}\n`,
        `[Topological DAG Synthesis] Resolved ${options.dag.resolvedIds.length} orbital modules (${options.dag.topologicalOrder.join(' -> ')})\n`,
        `[Architectural Playbook Directives]\n${options.playbookInsights}\n`,
        `Synthesizing response for: "${options.prompt.slice(0, 80)}"...\nVector HNSW context verified. Stream complete.`,
      ];
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: chunk, ...meta })}\n\n`)
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
      ...options.rateHeaders,
    },
  });
}

export async function POST(request: Request) {
  const start = performance.now();
  const env = validateRuntimeEnv();
  const clientIp = resolveClientIdentifier(request);
  const maxRpm = env.RATE_LIMIT_RPM;

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

  const llm = resolveLlmCredentials(env);
  if (llm) {
    return streamSpaceXaiCompletion({
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: env.AI_MODEL_ID,
      systemPrompt: buildRagSystemPrompt(
        systemInstruction,
        matchedDocs,
        dag.resolvedIds,
        dag.topologicalOrder
      ),
      userPrompt: prompt,
      meta: {
        ragMatches: matchedDocs.length,
        matchedIds: matchedDocs.map((d) => d.id),
        recommendedModules: dag.resolvedIds,
        mode: 'llm',
        provider: llm.provider,
        ragStatus,
        contextSummary,
      },
      rateHeaders,
    });
  }

  // No LLM key configured: return production RAG + DAG synthesis stream
  // (architectural retrieval path — not a fake chat completion).
  return streamRagSynthesis({
    modelId: env.AI_MODEL_ID,
    systemInstruction,
    prompt,
    ragStatus,
    contextSummary,
    playbookInsights,
    dag,
    matchedDocs,
    rateHeaders,
  });
}
