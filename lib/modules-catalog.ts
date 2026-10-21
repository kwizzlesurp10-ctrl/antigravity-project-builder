export type ModuleCategory = 'frontend' | 'backend' | 'database' | 'ai' | 'devops';

export interface OrbitalModule {
  id: string;
  name: string;
  subtitle: string;
  category: ModuleCategory;
  color: string;
  mass: number;
  baseAngle: number;
  dependencies: string[];
  files: Record<string, string>;
}

export const ORBITAL_MODULES: OrbitalModule[] = [
  {
    id: 'nextjs-app',
    name: 'Next.js 15 App Router',
    subtitle: 'React 19 + PPR + Server Actions',
    category: 'frontend',
    color: '#22d3ee',
    mass: 18,
    baseAngle: 0,
    dependencies: [],
    files: {
      'app/page.tsx': `export default function App() {\n  return <main className="min-h-screen bg-slate-950 text-white">Antigravity Core Online</main>;\n}`,
    },
  },
  {
    id: 'anime-physics',
    name: 'Anime.js Motion Engine',
    subtitle: '60fps Spring & Orbital Choreography',
    category: 'frontend',
    color: '#38bdf8',
    mass: 12,
    baseAngle: 45,
    dependencies: ['nextjs-app'],
    files: {
      'lib/motion.ts': `import anime from 'animejs';\nexport const pulseCore = (el: HTMLElement) => anime({ targets: el, scale: [1, 1.08], direction: 'alternate', loop: true, easing: 'easeInOutSine' });`,
    },
  },
  {
    id: 'supabase-auth',
    name: 'Supabase Auth + SSR',
    subtitle: 'JWT + OAuth + Anonymous Sessions',
    category: 'backend',
    color: '#a855f7',
    mass: 16,
    baseAngle: 90,
    dependencies: ['supabase-db'],
    files: {
      'middleware.ts': `import { createServerClient } from '@supabase/ssr';\n// Zero-trust session refresh middleware`,
    },
  },
  {
    id: 'supabase-db',
    name: 'PostgreSQL 17 Core',
    subtitle: 'Row-Level Security + Realtime',
    category: 'database',
    color: '#10b981',
    mass: 22,
    baseAngle: 135,
    dependencies: [],
    files: {
      'supabase/schema.sql': `alter table public.projects enable row level security;\ncreate policy "Owner access" on public.projects using ((select auth.uid()) = user_id);`,
    },
  },
  {
    id: 'pgvector-rag',
    name: 'pgvector HNSW Engine',
    subtitle: 'halfvec(1536) Semantic Search',
    category: 'ai',
    color: '#34d399',
    mass: 20,
    baseAngle: 180,
    dependencies: ['supabase-db'],
    files: {
      'supabase/vector.sql': `create extension if not exists vector;\ncreate index on items using hnsw (embedding halfvec_cosine_ops);`,
    },
  },
  {
    id: 'edge-ai-gateway',
    name: 'Edge AI Streamer',
    subtitle: 'Low-Latency LLM & Embedding RPC',
    category: 'ai',
    color: '#c084fc',
    mass: 15,
    baseAngle: 225,
    dependencies: ['pgvector-rag'],
    files: {
      'supabase/functions/ai/index.ts': `Deno.serve(async (req) => new Response(JSON.stringify({ status: 'orbital-ai-ready' })));`,
    },
  },
  {
    id: 'playwright-qa',
    name: 'Playwright E2E Shield',
    subtitle: 'Automated Visual & A11y Matrix',
    category: 'devops',
    color: '#f59e0b',
    mass: 11,
    baseAngle: 270,
    dependencies: ['nextjs-app'],
    files: {
      'tests/e2e.spec.ts': `import { test, expect } from '@playwright/test';\ntest('loads core', async ({ page }) => { await page.goto('/'); });`,
    },
  },
  {
    id: 'docker-spaces',
    name: 'Vercel + HF Spaces CI',
    subtitle: 'Standalone Docker + Edge Deploy',
    category: 'devops',
    color: '#fb923c',
    mass: 14,
    baseAngle: 315,
    dependencies: [],
    files: {
      'Dockerfile': `FROM node:22-alpine\nENV PORT=7860\nEXPOSE 7860\nCMD ["node", "server.js"]`,
    },
  },
];
