import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ORBITAL_MODULES } from '@/lib/modules-catalog';
import { listBlueprints, saveBlueprint, deleteBlueprint, recordTelemetry } from '@/lib/db/sqlite-engine';
import { synthesizeProject } from '@/lib/synthesizer';

const VALID_IDS = ORBITAL_MODULES.map((m) => m.id) as [string, ...string[]];

const CreateBlueprintSchema = z.object({
  name: z.string().min(2).max(100),
  projectSlug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .default('antigravity-orbital-app'),
  prompt: z.string().max(500).optional().default('Custom orbital architecture'),
  moduleIds: z.array(z.enum(VALID_IDS)).min(1),
  gravityRpm: z.number().min(0).max(5).optional().default(1.0),
  kesslerMode: z.boolean().optional().default(false),
});

export async function GET() {
  const blueprints = listBlueprints();
  return NextResponse.json({ blueprints }, { status: 200 });
}

export async function POST(request: Request) {
  const start = performance.now();
  try {
    const body = await request.json();
    const parsed = CreateBlueprintSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const synthesized = synthesizeProject({
      projectName: parsed.data.projectSlug,
      prompt: parsed.data.prompt,
      moduleIds: parsed.data.moduleIds,
      gravityConfig: {
        rpm: parsed.data.gravityRpm,
        kesslerMode: parsed.data.kesslerMode,
      },
    });

    const record = saveBlueprint({
      name: parsed.data.name,
      projectSlug: synthesized.projectName,
      prompt: parsed.data.prompt,
      moduleIds: synthesized.resolvedIds,
      gravityRpm: parsed.data.gravityRpm,
      kesslerMode: parsed.data.kesslerMode,
      filesCount: synthesized.filesCount,
      bundleBytes: synthesized.bundleBytes,
      sha256: synthesized.sha256,
    });

    recordTelemetry({
      eventType: 'BLUEPRINT_SAVED',
      projectName: record.projectSlug,
      moduleCount: record.moduleIds.length,
      filesCount: record.filesCount,
      bundleBytes: record.bundleBytes,
      durationMs: performance.now() - start,
    });

    return NextResponse.json({ status: 'saved', blueprint: record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid blueprint payload' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing blueprint id' }, { status: 400 });
  }
  const deleted = deleteBlueprint(id);
  return NextResponse.json({ deleted, id }, { status: deleted ? 200 : 404 });
}
