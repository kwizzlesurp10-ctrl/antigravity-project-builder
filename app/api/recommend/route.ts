import { NextResponse } from 'next/server';
import { z } from 'zod';
import { searchModulesByVector, recordTelemetry } from '@/lib/db/sqlite-engine';
import { resolveDependencyGraph } from '@/lib/synthesizer';

const RecommendSchema = z.object({
  prompt: z.string().min(1).max(600),
  threshold: z.number().min(0.01).max(0.95).optional().default(0.14),
});

export async function POST(request: Request) {
  const start = performance.now();
  try {
    const body = await request.json();
    const parsed = RecommendSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const vectorResults = searchModulesByVector(parsed.data.prompt, parsed.data.threshold);
    const topMatches = vectorResults.map((r) => r.id);
    const seededIds = topMatches.length > 0 ? topMatches : ['nextjs-app', 'anime-physics'];
    const graph = resolveDependencyGraph(seededIds);

    const durationMs = performance.now() - start;

    recordTelemetry({
      eventType: 'VECTOR_SEARCH',
      projectName: parsed.data.prompt.slice(0, 40),
      moduleCount: graph.resolvedIds.length,
      filesCount: vectorResults.length,
      bundleBytes: 0,
      durationMs,
    });

    return NextResponse.json(
      {
        status: 'aligned',
        prompt: parsed.data.prompt,
        durationMs: Number(durationMs.toFixed(2)),
        recommendations: vectorResults,
        recommendedIds: graph.resolvedIds,
        autoAddedDeps: graph.autoAddedIds,
        topologicalOrder: graph.topologicalOrder,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'Invalid recommendation request' }, { status: 400 });
  }
}
