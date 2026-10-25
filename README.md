# Antigravity Project Builder v3.5 — Maximum Destiny Edition

Visually assemble, audit, diff, and ignite full-stack architectures through weightless 60fps orbital choreography powered by **Next.js 15 App Router**, **Anime.js**, **Node SQLite Vector Engine**, **Supabase SSR + PostgreSQL 17 RLS**, and **pgvector HNSW**.

## Spatial UI Routes

| Route | Surface | Capabilities |
| :--- | :--- | :--- |
| `/` | **Orbital Studio HUD** | 60fps Anime.js orbital canvas, automatic transitive dependency capture, Kessler Syndrome overdrive, multi-file AST code explorer, and `.zip` export. |
| `/laboratory` | **AI & pgvector RAG Lab** | Live SSE streaming console (`/api/ai/stream`), real-time `X-RateLimit-Remaining` HUD gauge, semantic RAG playbook browser/uploader, and 1-click constellation docking. |
| `/shield` | **Zero-Trust Shield & Diff** | 5-Pillar Zero-Trust Readiness Scorecard (`0–100`), 1-click Auto-Dock remediation, side-by-side Blueprint AST & unified line differ, and Deployment Ignition console. |
| `/forge` | **Custom Module Forge IDE** | AI Module Skeleton Generator, interactive multi-file AST editor, SQLite catalog persistence (`custom_orbital_modules`), and instant orbital docking. |

## Backend API Routes

| Endpoint | Methods | Description |
| :--- | :--- | :--- |
| `/api/synthesize` | `GET`, `POST` | Resolves transitive module dependencies, merges `package.json` / `.env.example` / `README.md`, computes SHA-256 digests, and exports JSON or binary `.zip` archives. |
| `/api/recommend` | `POST` | 64-dim L2-normalized semantic vector similarity search across canonical and custom orbital modules. |
| `/api/ai/stream` | `POST` | Zero-Trust SSE streaming endpoint wired to `validateRuntimeEnv`, `checkSlidingWindowRateLimit`, and `retrieveSemanticContext`. |
| `/api/rag/documents` | `GET`, `POST`, `DELETE` | Dual-engine RAG knowledge base pre-seeded with 4 architectural playbooks and semantic `?q=` vector search. |
| `/api/modules/forge` | `GET`, `POST`, `DELETE` | AI Module Skeleton Generator (`action: "generate-skeleton"`) and SQLite custom module persistence (`action: "save"`). |
| `/api/audit/constellation` | `POST` | 5-Pillar Zero-Trust Readiness Auditor (`0–100` score across PostgreSQL RLS, Zod schemas, rate limiting, DAG topology, and DevOps QA). |
| `/api/blueprints` | `GET`, `POST`, `DELETE` | Persistent SQLite constellation blueprint catalog. |
| `/api/blueprints/diff` | `POST` | Structural AST & unified line-by-line file comparator across constellations. |
| `/api/deploy/ignition` | `POST` | Generates `docker-compose.yml` (`pgvector/pgvector:pg17` + Next.js 15 standalone) and `ignite.sh`, or materializes projects to `.data/ignited-projects/<slug>`. |
| `/api/webhooks/stripe` | `POST` | Timing-safe HMAC-SHA256 `stripe-signature` webhook verifier with SQLite telemetry logging. |
| `/api/telemetry` | `GET` | SQLite WAL synthesis metrics, average latency, vector index counts, and recent audit events. |
| `/api/health` | `GET` | Zero-latency container readiness and liveness probe. |

## Quick Start

```bash
# Install dependencies
npm install

# Start development server on http://localhost:3000
npm run dev

# Build production bundle & run 7-suite Playwright E2E verification
npm run build
npm run test:e2e
```

## GitHub Actions CI/CD & Vercel Deployment

Automated workflow in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml):
1. **Typecheck & E2E Matrix**: Runs on all pushes and pull requests to `main` (Node 22, Next.js 15 production build, and all 7 Playwright Chromium E2E tests).
2. **Automated Vercel Deployment**: Automatically triggers on successful `push` to `main`.
   - Set `VERCEL_TOKEN` in GitHub Repository Secrets (**Settings > Secrets and variables > Actions > New repository secret**) to enable direct headless production deployments.
   - Vercel Project ID: `prj_SidGLdC1puWpbdhQGzYm7SAZTc2B`
   - Vercel Org ID: `team_mvV0NlN9phNSfXe4PmlcG3eK`

