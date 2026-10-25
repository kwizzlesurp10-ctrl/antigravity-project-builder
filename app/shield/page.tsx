'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useOrbitalStore } from '@/store/useOrbitalStore';
import { withAdminAuthHeaders } from '@/lib/security/admin-headers';
import { ShieldCheck, GitCompare, Rocket, CheckCircle2, AlertTriangle, Zap } from 'lucide-react';

interface AuditPillar {
  id: string;
  title: string;
  score: number;
  maxScore: number;
  status: 'passed' | 'warning' | 'critical';
  findings: string[];
  remediationModuleId?: string;
}

interface AuditResponse {
  totalScore: number;
  maxScore: number;
  grade: string;
  resolvedIds: string[];
  recommendedAutoDockIds: string[];
  pillars: AuditPillar[];
  astMetrics?: {
    totalLinesOfCode: number;
    sqlTablesCount: number;
    rlsPoliciesCount: number;
    apiRoutesCount: number;
    zodSchemasCount: number;
    e2eTestsCount: number;
    secretScanClean: boolean;
  };
  sha256: string;
}

interface FileDiffSummary {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  baseBytes: number;
  targetBytes: number;
  deltaBytes: number;
  additionsCount?: number;
  deletionsCount?: number;
  unifiedPreview: string;
}

interface DiffResponse {
  base: { projectName: string; resolvedIds: string[]; filesCount: number; bundleBytes: number };
  target: { projectName: string; resolvedIds: string[]; filesCount: number; bundleBytes: number };
  modulesDelta: { added: string[]; removed: string[]; shared: string[] };
  bytesDelta: number;
  filesDeltaCount: number;
  fileDiffs: FileDiffSummary[];
}

export default function ShieldPage() {
  const { projectName, dockedIds, setDockedIds, blueprints, setBlueprints } = useOrbitalStore();

  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [auditing, setAuditing] = useState(false);

  const [baseBpId, setBaseBpId] = useState<string>('bp-motion-creative-studio');
  const [targetBpId, setTargetBpId] = useState<string>('bp-zero-g-enterprise');
  const [diffResult, setDiffResult] = useState<DiffResponse | null>(null);
  const [selectedDiffPath, setSelectedDiffPath] = useState<string>('package.json');

  const [ignitionData, setIgnitionData] = useState<{
    mode: string;
    materializedDir: string | null;
    dockerCompose: string;
    igniteScript: string;
    sha256: string;
    verificationChecks?: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  } | null>(null);
  const [igniting, setIgniting] = useState(false);
  const [ignitionTab, setIgnitionTab] = useState<'compose' | 'script'>('compose');
  const [materializedProjects, setMaterializedProjects] = useState<
    Array<{ projectName: string; path: string; filesCount: number; totalBytes: number }>
  >([]);

  const [stripeEvents, setStripeEvents] = useState<
    Array<{
      eventId: string;
      eventType: string;
      customerEmail: string;
      subscriptionStatus: string;
      verified: boolean;
      createdAt: string;
    }>
  >([]);
  const [webhookStatus, setWebhookStatus] = useState<string>('');
  const [dispatchingWebhook, setDispatchingWebhook] = useState(false);

  const loadMaterializedProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/deploy/ignition', { headers: withAdminAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setMaterializedProjects(data.materializedProjects ?? []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const loadStripeLedger = useCallback(async () => {
    try {
      const res = await fetch('/api/webhooks/stripe', { headers: withAdminAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStripeEvents(data.events ?? []);
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleDispatchTestWebhook = async (eventType = 'checkout.session.completed') => {
    setDispatchingWebhook(true);
    try {
      const res = await fetch('/api/webhooks/stripe', {
        method: 'PUT',
        headers: withAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          eventType,
          customerEmail: `architect@${projectName || 'antigravity'}.dev`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWebhookStatus(
          `✓ Verified HMAC-SHA256 (${data.id}) • ${data.type} • Replay: ${data.idempotentReplay ? 'YES' : 'NO'}`
        );
        await loadStripeLedger();
      } else if (res.status === 404) {
        setWebhookStatus('Stripe simulator disabled in production.');
      } else if (res.status === 401) {
        setWebhookStatus('Unauthorized — set NEXT_PUBLIC_API_ADMIN_SECRET for simulator access.');
      }
    } finally {
      setDispatchingWebhook(false);
    }
  };

  const runAudit = useCallback(async (idsToAudit: string[]) => {
    setAuditing(true);
    try {
      const res = await fetch('/api/audit/constellation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, moduleIds: idsToAudit }),
      });
      if (res.ok) {
        setAudit(await res.json());
      }
    } finally {
      setAuditing(false);
    }
  }, [projectName]);

  const runDiff = useCallback(
    async (bId: string, tId: string) => {
      const payload: Record<string, unknown> = {};
      if (bId === '__ACTIVE_ORBIT__') {
        payload.baseModuleIds = dockedIds;
        payload.baseName = `${projectName}-active`;
      } else {
        payload.baseBlueprintId = bId;
      }
      if (tId === '__ACTIVE_ORBIT__') {
        payload.targetModuleIds = dockedIds;
        payload.targetName = `${projectName}-active`;
      } else {
        payload.targetBlueprintId = tId;
      }

      const res = await fetch('/api/blueprints/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as DiffResponse;
        setDiffResult(data);
        const firstChanged = data.fileDiffs.find((f) => f.status !== 'unchanged');
        if (firstChanged) setSelectedDiffPath(firstChanged.path);
      }
    },
    [dockedIds, projectName]
  );

  useEffect(() => {
    runAudit(dockedIds);
  }, [dockedIds, runAudit]);

  useEffect(() => {
    const init = async () => {
      const res = await fetch('/api/blueprints', { headers: withAdminAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBlueprints(data.blueprints ?? []);
      }
      runDiff(baseBpId, targetBpId);
      loadMaterializedProjects();
      loadStripeLedger();
    };
    init();
  }, [baseBpId, targetBpId, runDiff, setBlueprints, loadMaterializedProjects, loadStripeLedger]);

  const handleAutoDockRemediation = () => {
    if (!audit || audit.recommendedAutoDockIds.length === 0) return;
    const merged = Array.from(new Set([...dockedIds, ...audit.recommendedAutoDockIds]));
    setDockedIds(merged);
  };

  const handleIgnition = async (mode: 'bundle' | 'materialize') => {
    setIgniting(true);
    try {
      const res = await fetch('/api/deploy/ignition', {
        method: 'POST',
        headers: withAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          projectName,
          moduleIds: dockedIds,
          mode,
        }),
      });
      if (res.ok) {
        setIgnitionData(await res.json());
        if (mode === 'materialize') {
          await loadMaterializedProjects();
        }
      }
    } finally {
      setIgniting(false);
    }
  };

  const selectedFileDiff =
    diffResult?.fileDiffs.find((f) => f.path === selectedDiffPath) ??
    diffResult?.fileDiffs[0] ??
    null;

  return (
    <main
      data-testid="shield-page"
      className="min-h-[calc(100vh-52px)] bg-[#05070f] text-slate-100 p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header & Score Banner */}
        <header className="rounded-2xl border border-pink-500/30 bg-slate-900/70 p-6 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-pink-400">
              ZERO-TRUST SHIELD · AST CONSTELLATION DIFFER · DEPLOYMENT IGNITION
            </span>
            <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-pink-400" />
              Orbital Security Scorecard & Blueprint Comparator
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Auditing {dockedIds.length} active orbital modules across PostgreSQL 17 RLS, Zod schemas, rate limiting, DAG topology, and DevOps CI.
            </p>
          </div>

          {audit && (
            <div className="flex items-center gap-4">
              <div
                data-testid="shield-readiness-score"
                className="px-4 py-2.5 rounded-2xl bg-slate-950 border border-emerald-500/40 text-right"
              >
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  READINESS SCORE
                </span>
                <span className="text-2xl font-extrabold text-emerald-300">
                  {audit.totalScore}/{audit.maxScore}
                </span>
                <span className="text-[11px] font-mono text-cyan-300 block">{audit.grade}</span>
              </div>

              {audit.recommendedAutoDockIds.length > 0 && (
                <button
                  type="button"
                  data-testid="shield-autodock-btn"
                  onClick={handleAutoDockRemediation}
                  disabled={auditing}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-violet-600 text-white text-xs font-semibold hover:brightness-110 transition cursor-pointer flex items-center gap-2 shadow-lg shadow-pink-500/20"
                >
                  <Zap className="w-4 h-4" />
                  Auto-Dock Shield Modules (+{audit.recommendedAutoDockIds.length})
                </button>
              )}
            </div>
          )}
        </header>

        {/* 5-Pillar Zero-Trust Audit Grid */}
        {audit && (
          <section className="space-y-3.5">
            {audit.astMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs font-mono">
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">SYNTHESIZED LOC</span>
                  <strong className="text-cyan-300">{audit.astMetrics.totalLinesOfCode} lines</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">SQL TABLES / RLS</span>
                  <strong className="text-emerald-300">
                    {audit.astMetrics.sqlTablesCount} tbl · {audit.astMetrics.rlsPoliciesCount} policies
                  </strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">API ROUTES</span>
                  <strong className="text-violet-300">{audit.astMetrics.apiRoutesCount} handlers</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">ZOD SCHEMAS</span>
                  <strong className="text-pink-300">{audit.astMetrics.zodSchemasCount} guards</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">PLAYWRIGHT SPECS</span>
                  <strong className="text-amber-300">{audit.astMetrics.e2eTestsCount} assertions</strong>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">SECRET / EVAL SCAN</span>
                  <strong className="text-emerald-400">
                    {audit.astMetrics.secretScanClean ? 'CLEAN (0 leaks)' : 'WARNING'}
                  </strong>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
              {audit.pillars.map((pillar) => (
                <div
                  key={pillar.id}
                  data-testid={`audit-pillar-${pillar.id}`}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-cyan-300">
                        {pillar.score}/{pillar.maxScore} pts
                      </span>
                      {pillar.status === 'passed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <h2 className="text-xs font-bold mt-2 text-slate-100">{pillar.title}</h2>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-400">
                      {pillar.findings.map((f, idx) => (
                        <li key={idx}>• {f}</li>
                      ))}
                    </ul>
                  </div>
                  {pillar.remediationModuleId && (
                    <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                      Remediate: +{pillar.remediationModuleId}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Blueprint AST Comparator (/api/blueprints/diff) */}
          <section className="lg:col-span-7 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
                <GitCompare className="w-4 h-4" /> Blueprint AST & File Comparator (/api/blueprints/diff)
              </h2>
              <div className="flex items-center gap-2 text-xs">
                <select
                  data-testid="diff-base-select"
                  value={baseBpId}
                  onChange={(e) => setBaseBpId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="__ACTIVE_ORBIT__">Base: Active Studio Orbit ({dockedIds.length})</option>
                  {blueprints.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      Base: {bp.name}
                    </option>
                  ))}
                </select>
                <span className="text-slate-500">vs</span>
                <select
                  data-testid="diff-target-select"
                  value={targetBpId}
                  onChange={(e) => setTargetBpId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="__ACTIVE_ORBIT__">Target: Active Studio Orbit ({dockedIds.length})</option>
                  {blueprints.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      Target: {bp.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {diffResult && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                    +{diffResult.modulesDelta.added.length} Added Modules
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300">
                    -{diffResult.modulesDelta.removed.length} Removed
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                    {diffResult.filesDeltaCount} Changed Files ({diffResult.bytesDelta >= 0 ? `+${diffResult.bytesDelta}` : diffResult.bytesDelta} B)
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-slate-950 border border-slate-800">
                  {diffResult.fileDiffs.map((fd) => (
                    <button
                      key={fd.path}
                      type="button"
                      onClick={() => setSelectedDiffPath(fd.path)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition ${
                        selectedDiffPath === fd.path
                          ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                          : fd.status === 'added'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                            : fd.status === 'removed'
                              ? 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                              : fd.status === 'modified'
                                ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      [{fd.status[0]?.toUpperCase()}] {fd.path}
                    </button>
                  ))}
                </div>

                {selectedFileDiff && (
                  <pre
                    data-testid="diff-unified-viewer"
                    className="w-full h-[240px] overflow-auto rounded-xl bg-[#020409] border border-slate-800 p-4 text-[11px] font-mono text-cyan-100/90 leading-relaxed"
                  >
                    {`// File: ${selectedFileDiff.path} (${selectedFileDiff.status.toUpperCase()} • Delta: ${selectedFileDiff.deltaBytes} bytes)\n`}
                    {selectedFileDiff.unifiedPreview}
                  </pre>
                )}
              </>
            )}
          </section>

          {/* Deployment Ignition Panel (/api/deploy/ignition) */}
          <section className="lg:col-span-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <Rocket className="w-4 h-4" /> Autonomous Deployment Ignition (/api/deploy/ignition)
            </h2>
            <p className="text-xs text-slate-400">
              Synthesize a complete Docker Compose stack (`pgvector/pgvector:pg17` + Next.js 15 standalone) or materialize the verified project directly to disk under `.data/ignited-projects/{projectName}`.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="ignite-bundle-btn"
                onClick={() => handleIgnition('bundle')}
                disabled={igniting}
                className="py-2.5 px-3 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-semibold hover:bg-amber-500/30 cursor-pointer"
              >
                Generate Docker + Ignite Stack
              </button>
              <button
                type="button"
                data-testid="ignite-materialize-btn"
                onClick={() => handleIgnition('materialize')}
                disabled={igniting}
                className="py-2.5 px-3 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 cursor-pointer"
              >
                Materialize to Disk (.data/)
              </button>
            </div>

            {ignitionData && (
              <div className="space-y-2.5">
                {ignitionData.materializedDir && (
                  <div
                    data-testid="ignition-materialized-banner"
                    className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-[11px] font-mono text-emerald-200"
                  >
                    ✓ Materialized verified project to: {ignitionData.materializedDir}
                  </div>
                )}

                {ignitionData.verificationChecks && (
                  <div className="flex flex-wrap gap-1.5">
                    {ignitionData.verificationChecks.map((chk) => (
                      <span
                        key={chk.id}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          chk.passed
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        }`}
                      >
                        {chk.passed ? '✓' : '✗'} {chk.label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIgnitionTab('compose')}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono cursor-pointer ${
                      ignitionTab === 'compose'
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    docker-compose.yml
                  </button>
                  <button
                    type="button"
                    onClick={() => setIgnitionTab('script')}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono cursor-pointer ${
                      ignitionTab === 'script'
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    ignite.sh
                  </button>
                </div>

                <pre
                  data-testid="ignition-docker-viewer"
                  className="w-full h-[220px] overflow-auto rounded-xl bg-[#020409] border border-slate-800 p-3.5 text-[11px] font-mono text-amber-200/90 leading-relaxed"
                >
                  {ignitionTab === 'compose' ? ignitionData.dockerCompose : ignitionData.igniteScript}
                </pre>
              </div>
            )}

            {materializedProjects.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Materialized Projects on Disk (.data/ignited-projects/)
                </span>
                {materializedProjects.map((mp) => (
                  <div
                    key={mp.projectName}
                    className="flex items-center justify-between text-[11px] font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-emerald-300">{mp.projectName}</span>
                    <span className="text-slate-400">
                      {mp.filesCount} files · {(mp.totalBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Cryptographic Stripe Webhook Signer & SQLite Idempotency Ledger */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-violet-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Cryptographic Stripe Webhook Signer & SQLite Idempotency Ledger (/api/webhooks/stripe)
              </h2>
              <p className="text-xs text-slate-400">
                Sign test payloads with HMAC-SHA256 (`crypto.timingSafeEqual`) and inspect idempotent webhook persistence in SQLite.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="shield-dispatch-webhook-btn"
                disabled={dispatchingWebhook}
                onClick={() => handleDispatchTestWebhook('checkout.session.completed')}
                className="px-3 py-1.5 rounded-xl bg-violet-500/20 border border-violet-400/50 text-violet-200 text-xs font-semibold hover:bg-violet-500/30 cursor-pointer"
              >
                {dispatchingWebhook ? 'Signing...' : 'Dispatch Signed checkout.session.completed'}
              </button>
              <button
                type="button"
                disabled={dispatchingWebhook}
                onClick={() => handleDispatchTestWebhook('customer.subscription.updated')}
                className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 text-xs font-semibold hover:bg-cyan-500/30 cursor-pointer"
              >
                Dispatch subscription.updated
              </button>
            </div>
          </div>

          {webhookStatus && (
            <div className="p-2.5 rounded-xl bg-violet-950/50 border border-violet-500/40 text-xs font-mono text-violet-200">
              {webhookStatus}
            </div>
          )}

          {stripeEvents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {stripeEvents.slice(0, 6).map((ev) => (
                <div
                  key={ev.eventId}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-cyan-300 font-semibold">{ev.eventType}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                      {ev.subscriptionStatus}
                    </span>
                  </div>
                  <span className="text-slate-400 truncate">
                    {ev.eventId} · {ev.customerEmail}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
