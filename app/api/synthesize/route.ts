import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ORBITAL_MODULES } from '@/lib/modules-catalog';

const VALID_IDS = ORBITAL_MODULES.map((m) => m.id) as [string, ...string[]];

const SynthesizeSchema = z.object({
  projectName: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Project name must be kebab-case alphanumeric'),
  moduleIds: z.array(z.enum(VALID_IDS)).min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = SynthesizeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const selectedModules = ORBITAL_MODULES.filter((m) => parsed.data.moduleIds.includes(m.id));
    const manifest = {
      project: parsed.data.projectName,
      generatedAt: new Date().toISOString(),
      modules: selectedModules.map((m) => m.id),
      filesCount: selectedModules.reduce((acc, m) => acc + Object.keys(m.files).length, 0),
    };

    return NextResponse.json({ status: 'synthesized', manifest }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}
