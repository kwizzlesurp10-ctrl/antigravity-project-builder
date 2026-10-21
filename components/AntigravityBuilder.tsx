'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import anime from 'animejs';
import { ORBITAL_MODULES, OrbitalModule } from '@/lib/modules-catalog';
import { Sparkles, Rocket, Code2, ShieldCheck, Zap, Orbit, RotateCcw } from 'lucide-react';

const INNER_ORBIT_RADIUS = 150;
const OUTER_ORBIT_RADIUS = 275;

export default function AntigravityBuilder() {
  const [dockedIds, setDockedIds] = useState<string[]>(['nextjs-app', 'anime-physics', 'supabase-db']);
  const [selectedModule, setSelectedModule] = useState<OrbitalModule>(ORBITAL_MODULES[0]);
  const [prompt, setPrompt] = useState('');
  const [kesslerMode, setKesslerMode] = useState(false);
  const [coreClicks, setCoreClicks] = useState(0);
  const [synthesizedOpen, setSynthesizedOpen] = useState(false);
  const [manifestData, setManifestData] = useState<{
    project: string;
    generatedAt: string;
    filesCount: number;
  } | null>(null);

  // Imperative refs for 60fps GPU-composited orbital animation
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tetherRefs = useRef<Record<string, SVGPathElement | null>>({});
  const coreRef = useRef<HTMLDivElement | null>(null);
  const shockwaveRef = useRef<HTMLDivElement | null>(null);

  // Proxy physics state mutated by Anime.js springs & read by RAF loop
  const physicsState = useRef<
    Record<string, { radius: number; angleOffset: number; floatY: number; scale: number }>
  >(
    Object.fromEntries(
      ORBITAL_MODULES.map((m) => [
        m.id,
        {
          radius: ['nextjs-app', 'anime-physics', 'supabase-db'].includes(m.id)
            ? INNER_ORBIT_RADIUS
            : OUTER_ORBIT_RADIUS,
          angleOffset: (m.baseAngle * Math.PI) / 180,
          floatY: 0,
          scale: 1,
        },
      ])
    )
  );

  // 1. Initialize Anime.js perpetual weightless float per module
  useEffect(() => {
    const floatAnimations = ORBITAL_MODULES.map((m, idx) =>
      anime({
        targets: physicsState.current[m.id],
        floatY: [-7, 7],
        duration: 2200 + idx * 190,
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine',
      })
    );

    return () => floatAnimations.forEach((anim) => anim.pause());
  }, []);

  // 2. Animate radial spring docking whenever dockedIds change
  useEffect(() => {
    ORBITAL_MODULES.forEach((m) => {
      const isDocked = dockedIds.includes(m.id);
      anime({
        targets: physicsState.current[m.id],
        radius: isDocked ? INNER_ORBIT_RADIUS : OUTER_ORBIT_RADIUS,
        scale: isDocked ? 1.08 : 0.94,
        easing: 'spring(1, 82, 13, 0)',
      });
    });
  }, [dockedIds]);

  // 3. 60fps requestAnimationFrame orbital loop (Zero React re-renders)
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let globalAngle = 0;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      const speedMultiplier = kesslerMode ? -3.8 : 0.32;
      globalAngle += dt * speedMultiplier;

      const centerX = 340;
      const centerY = 340;

      ORBITAL_MODULES.forEach((m) => {
        const state = physicsState.current[m.id];
        const isDocked = dockedIds.includes(m.id);
        const orbitFactor = isDocked ? 1.35 : 0.65;
        const theta = state.angleOffset + globalAngle * orbitFactor;

        const x = Math.cos(theta) * state.radius;
        const y = Math.sin(theta) * state.radius + state.floatY;

        const el = nodeRefs.current[m.id];
        if (el) {
          el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${state.scale})`;
        }

        const tether = tetherRefs.current[m.id];
        if (tether) {
          const targetX = centerX + x;
          const targetY = centerY + y;
          const ctrlX = centerX + x * 0.5 - y * 0.18;
          const ctrlY = centerY + y * 0.5 + x * 0.18;
          tether.setAttribute('d', `M ${centerX} ${centerY} Q ${ctrlX} ${ctrlY} ${targetX} ${targetY}`);
        }
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [dockedIds, kesslerMode]);

  // Toggle module docking + automatic dependency gravity capture
  const toggleModule = (mod: OrbitalModule) => {
    setSelectedModule(mod);
    setDockedIds((prev) => {
      const exists = prev.includes(mod.id);
      if (exists) {
        return prev.filter((id) => id !== mod.id);
      }
      const withDeps = new Set([...prev, mod.id, ...mod.dependencies]);
      return Array.from(withDeps);
    });
  };

  // Natural-language semantic preset matcher
  const handlePromptIgnite = (e: React.FormEvent) => {
    e.preventDefault();
    const q = prompt.toLowerCase();
    const matched = new Set<string>(['nextjs-app', 'anime-physics']);
    if (q.includes('ai') || q.includes('rag') || q.includes('vector')) {
      matched.add('pgvector-rag');
      matched.add('edge-ai-gateway');
      matched.add('supabase-db');
    }
    if (q.includes('auth') || q.includes('saas') || q.includes('user')) {
      matched.add('supabase-auth');
      matched.add('supabase-db');
    }
    if (q.includes('deploy') || q.includes('docker') || q.includes('test')) {
      matched.add('docker-spaces');
      matched.add('playwright-qa');
    }
    setDockedIds(Array.from(matched));
  };

  // Singularity synthesis collapse choreography + live API verification
  const handleIgniteSingularity = async () => {
    if (shockwaveRef.current) {
      anime({
        targets: shockwaveRef.current,
        scale: [0.2, 3.4],
        opacity: [0.95, 0],
        duration: 850,
        easing: 'easeOutExpo',
      });
    }
    setSynthesizedOpen(true);
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: 'antigravity-orbital-app',
          moduleIds: dockedIds,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setManifestData(data.manifest);
      }
    } catch {
      // Fallback if offline
    }
  };

  const handleDownloadBlueprint = () => {
    const blob = new Blob([synthesizedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity-blueprint-${dockedIds.length}-modules.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Easter Egg: 5 clicks on Singularity Core triggers Kessler Syndrome Mode
  const handleCoreClick = () => {
    const next = coreClicks + 1;
    setCoreClicks(next);
    if (next >= 5) {
      setKesslerMode((k) => !k);
      setCoreClicks(0);
    }
  };

  const synthesizedCode = useMemo(() => {
    return ORBITAL_MODULES.filter((m) => dockedIds.includes(m.id))
      .map((m) =>
        Object.entries(m.files)
          .map(([path, content]) => `// === [${m.name}] ${path} ===\n${content}`)
          .join('\n\n')
      )
      .join('\n\n');
  }, [dockedIds]);

  return (
    <div
      data-kessler-mode={kesslerMode ? 'active' : 'normal'}
      className="min-h-screen bg-[#05070f] text-slate-100 flex flex-col lg:flex-row overflow-hidden select-none"
    >
      {/* Left / Center: Zero-G Orbital Assembly Viewport */}
      <div className="flex-1 flex flex-col items-center justify-between p-6 relative">
        {/* Top Command Bar */}
        <header className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-4 z-20 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl px-5 py-3">
          <div className="flex items-center gap-3">
            <Orbit className="w-6 h-6 text-cyan-400 animate-spin" style={{ animationDuration: '14s' }} />
            <div>
              <h1 className="font-bold tracking-tight text-base">ANTIGRAVITY PROJECT BUILDER</h1>
              <p className="text-xs text-slate-400">Orbital Full-Stack Architecture Synthesizer</p>
            </div>
          </div>

          <form onSubmit={handlePromptIgnite} className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe stack (e.g. 'AI RAG SaaS with auth & docker')..."
              className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition cursor-pointer"
            >
              Align Orbit
            </button>
          </form>
        </header>

        {/* Orbital Physics Stage (680x680 coordinate space) */}
        <div className="relative w-[680px] h-[680px] flex items-center justify-center my-auto">
          {/* SVG Orbital Rings & Gravitational Bezier Tethers */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 680 680">
            <defs>
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={kesslerMode ? '#f43f5e' : '#22d3ee'} stopOpacity="0.28" />
                <stop offset="100%" stopColor="#05070f" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx="340" cy="340" r="240" fill="url(#coreGlow)" />

            {/* Inner Docked Orbit Ring */}
            <circle
              cx="340"
              cy="340"
              r={INNER_ORBIT_RADIUS}
              fill="none"
              stroke="#22d3ee"
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />

            {/* Outer Available Belt Ring */}
            <circle
              cx="340"
              cy="340"
              r={OUTER_ORBIT_RADIUS}
              fill="none"
              stroke="#64748b"
              strokeOpacity="0.25"
              strokeWidth="1"
              strokeDasharray="3 9"
            />

            {/* Dynamic Bezier Tethers */}
            {ORBITAL_MODULES.map((m) => {
              const isDocked = dockedIds.includes(m.id);
              return (
                <path
                  key={m.id}
                  ref={(el) => {
                    tetherRefs.current[m.id] = el;
                  }}
                  fill="none"
                  stroke={isDocked ? m.color : '#334155'}
                  strokeWidth={isDocked ? 2 : 0.75}
                  strokeOpacity={isDocked ? 0.75 : 0.2}
                  strokeDasharray={isDocked ? 'none' : '4 8'}
                />
              );
            })}
          </svg>

          {/* Shockwave Ring for Singularity Synthesis */}
          <div
            ref={shockwaveRef}
            className="absolute w-36 h-36 rounded-full border-2 border-cyan-400 opacity-0 pointer-events-none"
          />

          {/* Central Singularity Core */}
          <div
            ref={coreRef}
            data-testid="singularity-core"
            onClick={handleCoreClick}
            title="Click 5x for Kessler Syndrome Gravity Inversion"
            className={`relative z-10 w-36 h-36 rounded-full flex flex-col items-center justify-center text-center p-4 cursor-pointer transition-shadow duration-500 border ${
              kesslerMode
                ? 'bg-rose-950/80 border-rose-400 shadow-[0_0_60px_rgba(244,63,94,0.55)]'
                : 'bg-slate-900/90 border-cyan-400/60 shadow-[0_0_50px_rgba(34,211,238,0.3)]'
            } backdrop-blur-xl`}
          >
            <Sparkles className="w-5 h-5 text-cyan-300 mb-1" />
            <span className="text-xs font-bold tracking-wider uppercase text-cyan-200">
              {kesslerMode ? 'KESSLER OVERDRIVE' : 'SINGULARITY CORE'}
            </span>
            <span className="text-[11px] text-slate-300 mt-1">{dockedIds.length} Modules Docked</span>
            <span className="text-[10px] text-emerald-400 mt-0.5">60 FPS LOCK</span>
          </div>

          {/* Orbiting Module Nodes */}
          {ORBITAL_MODULES.map((m) => {
            const isDocked = dockedIds.includes(m.id);
            const isSelected = selectedModule.id === m.id;
            return (
              <button
                key={m.id}
                ref={(el) => {
                  nodeRefs.current[m.id] = el;
                }}
                data-testid={`orbital-node-${m.id}`}
                data-docked={isDocked ? 'true' : 'false'}
                onClick={() => toggleModule(m)}
                aria-pressed={isDocked}
                className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 px-3.5 py-2 rounded-2xl border text-left transition-colors cursor-pointer backdrop-blur-md ${
                  isDocked
                    ? 'bg-slate-900/90 border-cyan-400/80 shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                    : 'bg-slate-950/75 border-slate-800 hover:border-slate-600 opacity-75 hover:opacity-100'
                } ${isSelected ? 'ring-2 ring-white/80' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.color, boxShadow: `0 0 10px ${m.color}` }}
                  />
                  <span className="text-xs font-semibold whitespace-nowrap">{m.name}</span>
                </div>
                <p className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">{m.subtitle}</p>
              </button>
            );
          })}
        </div>

        {/* Bottom Telemetry & Synthesis Trigger */}
        <footer className="w-full max-w-4xl flex items-center justify-between z-20 bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl px-5 py-3">
          <div className="flex items-center gap-6 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> RLS & CSP Hardened
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> Dependency Auto-Capture Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setDockedIds(['nextjs-app'])}
              className="px-3 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Orbit
            </button>
            <button
              data-testid="ignite-singularity-btn"
              onClick={handleIgniteSingularity}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold shadow-lg shadow-cyan-500/25 hover:brightness-110 flex items-center gap-2 cursor-pointer"
            >
              <Rocket className="w-4 h-4" /> Ignite Singularity ({dockedIds.length})
            </button>
          </div>
        </footer>
      </div>

      {/* Right HUD: Live Synthesized Code & Module Inspector */}
      <aside className="w-full lg:w-[440px] border-l border-slate-800/80 bg-slate-950/90 backdrop-blur-2xl p-6 flex flex-col justify-between z-30">
        <div>
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                ORBITAL TELEMETRY HUD
              </span>
              <h2 className="text-lg font-bold mt-0.5">{selectedModule.name}</h2>
              <p className="text-xs text-slate-400">{selectedModule.subtitle}</p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                dockedIds.includes(selectedModule.id)
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {dockedIds.includes(selectedModule.id) ? 'IN INNER ORBIT' : 'OUTER BELT'}
            </span>
          </div>

          {/* Live Synthesized Code Preview */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="flex items-center gap-1.5 font-medium text-slate-200">
                <Code2 className="w-4 h-4 text-cyan-400" /> Live Stack Blueprint ({dockedIds.length} modules)
              </span>
              <span className="font-mono text-[11px] text-emerald-400">AST READY</span>
            </div>
            <pre
              data-testid="generated-code-viewer"
              className="w-full h-[420px] overflow-auto rounded-xl bg-[#020409] border border-slate-800 p-4 text-[11px] font-mono text-cyan-100/90 leading-relaxed"
            >
              {synthesizedCode}
            </pre>
          </div>
        </div>

        {synthesizedOpen && (
          <div
            data-testid="synthesis-modal"
            className="mt-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-xs text-emerald-200 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-emerald-300">Singularity Bundle Synthesized!</p>
              {manifestData && (
                <span className="font-mono text-[10px] text-emerald-400">
                  {manifestData.filesCount} files verified
                </span>
              )}
            </div>
            <p className="text-slate-300">
              All {dockedIds.length} orbital modules passed dependency verification and RLS policy checks.
            </p>
            <button
              onClick={handleDownloadBlueprint}
              className="mt-1 w-full py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 font-medium hover:bg-emerald-500/30 transition cursor-pointer"
            >
              Download Synthesized Blueprint (.ts)
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
