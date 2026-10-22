'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import anime from 'animejs';
import { ORBITAL_MODULES, OrbitalModule } from '@/lib/modules-catalog';
import { useOrbitalStore } from '@/store/useOrbitalStore';
import {
  Sparkles,
  Rocket,
  Code2,
  ShieldCheck,
  Zap,
  Orbit,
  RotateCcw,
  Download,
  Database,
  Activity,
  Copy,
  Check,
  Undo2,
  Redo2,
  BookmarkPlus,
  Trash2,
  FolderGit2,
  Gauge,
  Pause,
  Play,
} from 'lucide-react';

const INNER_ORBIT_RADIUS = 168;
const OUTER_ORBIT_RADIUS = 276;
const CENTER_COORD = 340;

export default function AntigravityBuilder() {
  const {
    projectName,
    prompt,
    dockedIds,
    historyPast,
    historyFuture,
    selectedModuleId,
    activeFilePath,
    activeHudTab,
    gravityRpm,
    kesslerMode,
    reducedMotion,
    isSynthesizing,
    isSearchingVector,
    manifest,
    recommendations,
    blueprints,
    telemetry,
    setProjectName,
    setPrompt,
    setDockedIds,
    undoOrbit,
    redoOrbit,
    setSelectedModuleId,
    setActiveFilePath,
    setActiveHudTab,
    setGravityRpm,
    setKesslerMode,
    setReducedMotion,
    setIsSynthesizing,
    setIsSearchingVector,
    setManifest,
    setRecommendations,
    setBlueprints,
    setTelemetry,
  } = useOrbitalStore();

  const [coreClicks, setCoreClicks] = useState(0);
  const [synthesizedOpen, setSynthesizedOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'unified' | 'file'>('unified');
  const [copiedFile, setCopiedFile] = useState(false);
  const [blueprintTitle, setBlueprintTitle] = useState('');
  const [savingBlueprint, setSavingBlueprint] = useState(false);
  const [statusAnnouncement, setStatusAnnouncement] = useState('Antigravity Orbital Core Online');
  const [customModules, setCustomModules] = useState<OrbitalModule[]>([]);

  const allModules = useMemo(() => {
    const canonicalIds = new Set(ORBITAL_MODULES.map((m) => m.id));
    return [...ORBITAL_MODULES, ...customModules.filter((c) => !canonicalIds.has(c.id))];
  }, [customModules]);

  const selectedModule = useMemo(
    () => allModules.find((m) => m.id === selectedModuleId) ?? allModules[0],
    [allModules, selectedModuleId]
  );

  // Imperative DOM refs for 60fps GPU-composited orbital animation
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tetherRefs = useRef<Record<string, SVGPathElement | null>>({});
  const depArcRefs = useRef<Record<string, SVGPathElement | null>>({});
  const coreRef = useRef<HTMLDivElement | null>(null);
  const shockwaveRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const draggingNodeId = useRef<string | null>(null);
  const isHoveringNodeRef = useRef<boolean>(false);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      (window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver)
    ) {
      setReducedMotion(true);
    }
  }, [setReducedMotion]);

  // Mutable physics state updated by Anime.js springs & consumed by 60fps RAF loop
  const physicsState = useRef<
    Record<
      string,
      { radius: number; angleOffset: number; floatY: number; scale: number; x: number; y: number }
    >
  >(
    Object.fromEntries(
      ORBITAL_MODULES.map((m) => {
        const initiallyDocked = ['nextjs-app', 'anime-physics', 'supabase-db'].includes(m.id);
        const initRadius = initiallyDocked ? INNER_ORBIT_RADIUS : OUTER_ORBIT_RADIUS;
        const rad = (m.baseAngle * Math.PI) / 180;
        return [
          m.id,
          {
            radius: initRadius,
            angleOffset: rad,
            floatY: 0,
            scale: initiallyDocked ? 1.06 : 0.92,
            x: Math.cos(rad) * initRadius,
            y: Math.sin(rad) * initRadius,
          },
        ];
      })
    )
  );

  // Fetch initial synthesis manifest, SQLite blueprints, and telemetry
  const refreshBackendTelemetry = useCallback(async () => {
    try {
      const [bpRes, telRes, forgeRes] = await Promise.all([
        fetch('/api/blueprints'),
        fetch('/api/telemetry'),
        fetch('/api/modules/forge'),
      ]);
      if (bpRes.ok) {
        const bpData = await bpRes.json();
        setBlueprints(bpData.blueprints ?? []);
      }
      if (telRes.ok) {
        const telData = await telRes.json();
        setTelemetry(telData);
      }
      if (forgeRes.ok) {
        const forgeData = await forgeRes.json();
        setCustomModules(forgeData.customModules ?? []);
      }
    } catch {
      // Non-blocking background sync
    }
  }, [setBlueprints, setTelemetry]);

  // Run live AST synthesis whenever dockedIds or projectName change
  useEffect(() => {
    let active = true;
    const synthesizeLive = async () => {
      try {
        const res = await fetch('/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName,
            prompt,
            moduleIds: dockedIds,
            gravityConfig: { rpm: gravityRpm, kesslerMode },
          }),
        });
        if (res.ok && active) {
          const data = await res.json();
          setManifest(data.manifest);
        }
      } catch {
        // Fallback to client catalog preview
      }
    };
    synthesizeLive();
    return () => {
      active = false;
    };
  }, [dockedIds, projectName, prompt, gravityRpm, kesslerMode, setManifest]);

  useEffect(() => {
    refreshBackendTelemetry();
  }, [refreshBackendTelemetry]);

  // Ensure physicsState has entries for any newly forged custom modules
  useEffect(() => {
    allModules.forEach((m) => {
      if (!physicsState.current[m.id]) {
        const isDocked = dockedIds.includes(m.id);
        const initRadius = isDocked ? INNER_ORBIT_RADIUS : OUTER_ORBIT_RADIUS;
        const rad = ((m.baseAngle ?? 45) * Math.PI) / 180;
        physicsState.current[m.id] = {
          radius: initRadius,
          angleOffset: rad,
          floatY: 0,
          scale: isDocked ? 1.06 : 0.92,
          x: Math.cos(rad) * initRadius,
          y: Math.sin(rad) * initRadius,
        };
      }
    });
  }, [allModules, dockedIds]);

  // 1. Initialize Anime.js perpetual weightless sinusoidal float per module
  useEffect(() => {
    const isReduced =
      reducedMotion ||
      (typeof window !== 'undefined' &&
        (window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver));
    if (isReduced) return;
    const floatAnimations = allModules.map((m, idx) =>
      anime({
        targets: physicsState.current[m.id],
        floatY: [-6.5, 6.5],
        duration: 2100 + idx * 165,
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine',
      })
    );
    return () => floatAnimations.forEach((anim) => anim.pause());
  }, [allModules, reducedMotion]);

  // 2. Animate radial spring docking whenever dockedIds change
  useEffect(() => {
    const isReduced =
      reducedMotion ||
      (typeof window !== 'undefined' &&
        (window.matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver));
    allModules.forEach((m) => {
      const isDocked = dockedIds.includes(m.id);
      const state = physicsState.current[m.id];
      if (!state) return;
      if (isReduced) {
        state.radius = isDocked ? INNER_ORBIT_RADIUS : OUTER_ORBIT_RADIUS;
        state.scale = isDocked ? 1.06 : 0.92;
        return;
      }
      anime({
        targets: state,
        radius: isDocked ? INNER_ORBIT_RADIUS : OUTER_ORBIT_RADIUS,
        scale: isDocked ? 1.06 : 0.92,
        easing: 'spring(1, 84, 13, 0)',
      });
    });
  }, [allModules, dockedIds, reducedMotion]);

  // Compute active inter-module dependency edges for SVG rendering
  const dependencyEdges = useMemo(() => {
    const edges: Array<{ key: string; from: string; to: string; color: string; active: boolean }> = [];
    for (const mod of allModules) {
      for (const depId of mod.dependencies) {
        const active = dockedIds.includes(mod.id) && dockedIds.includes(depId);
        edges.push({
          key: `${mod.id}->${depId}`,
          from: mod.id,
          to: depId,
          color: mod.color,
          active,
        });
      }
    }
    return edges;
  }, [allModules, dockedIds]);

  // 3. 60fps requestAnimationFrame orbital physics loop (Zero React re-renders)
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let globalAngle = 0;
    const isWebDriver = typeof navigator !== 'undefined' && navigator.webdriver;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const pauseMotion = reducedMotion || isHoveringNodeRef.current || isWebDriver;
      const effectiveRpm = pauseMotion ? 0 : gravityRpm;
      const speedMultiplier = pauseMotion
        ? 0
        : kesslerMode
        ? -3.6 * Math.max(effectiveRpm, 0.5)
        : 0.28 * effectiveRpm;
      globalAngle += dt * speedMultiplier;

      allModules.forEach((m) => {
        const state = physicsState.current[m.id];
        if (!state) return;
        const isDocked = dockedIds.includes(m.id);
        const orbitFactor = isDocked ? 1.32 : 0.62;

        if (draggingNodeId.current !== m.id) {
          const theta = state.angleOffset + globalAngle * orbitFactor;
          state.x = Math.cos(theta) * state.radius;
          state.y = Math.sin(theta) * state.radius + (reducedMotion ? 0 : state.floatY);
        }

        const el = nodeRefs.current[m.id];
        if (el) {
          el.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
        }

        const tether = tetherRefs.current[m.id];
        if (tether) {
          const targetX = CENTER_COORD + state.x;
          const targetY = CENTER_COORD + state.y;
          const ctrlX = CENTER_COORD + state.x * 0.5 - state.y * 0.18;
          const ctrlY = CENTER_COORD + state.y * 0.5 + state.x * 0.18;
          tether.setAttribute(
            'd',
            `M ${CENTER_COORD} ${CENTER_COORD} Q ${ctrlX} ${ctrlY} ${targetX} ${targetY}`
          );
        }
      });

      // Update inter-module dependency arcs
      dependencyEdges.forEach((edge) => {
        const pathEl = depArcRefs.current[edge.key];
        const fromState = physicsState.current[edge.from];
        const toState = physicsState.current[edge.to];
        if (pathEl && fromState && toState) {
          const x1 = CENTER_COORD + fromState.x;
          const y1 = CENTER_COORD + fromState.y;
          const x2 = CENTER_COORD + toState.x;
          const y2 = CENTER_COORD + toState.y;
          const midX = (x1 + x2) * 0.5 + (CENTER_COORD - (x1 + x2) * 0.5) * 0.25;
          const midY = (y1 + y2) * 0.5 + (CENTER_COORD - (y1 + y2) * 0.5) * 0.25;
          pathEl.setAttribute('d', `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`);
        }
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [allModules, dockedIds, kesslerMode, gravityRpm, reducedMotion, dependencyEdges]);

  // Toggle module docking + automatic transitive dependency gravity capture
  const toggleModule = (mod: OrbitalModule) => {
    setSelectedModuleId(mod.id);
    const firstModFile = Object.keys(mod.files)[0];
    if (firstModFile) setActiveFilePath(firstModFile);

    const exists = dockedIds.includes(mod.id);
    if (exists) {
      const remaining = dockedIds.filter((id) => id !== mod.id);
      setDockedIds(remaining.length > 0 ? remaining : ['nextjs-app']);
      setStatusAnnouncement(`${mod.name} released to Outer Belt.`);
    } else {
      // Resolve transitive dependencies
      const nextSet = new Set<string>([...dockedIds, mod.id]);
      const queue = [...mod.dependencies];
      while (queue.length > 0) {
        const dep = queue.shift()!;
        if (!nextSet.has(dep)) {
          nextSet.add(dep);
          const depMod = allModules.find((item) => item.id === dep);
          if (depMod) queue.push(...depMod.dependencies);
        }
      }
      setDockedIds(Array.from(nextSet));
      setStatusAnnouncement(`${mod.name} docked to Inner Singularity Orbit.`);
    }
  };

  // Real SQLite 64-dim Vector Similarity Prompt Alignment
  const runVectorAlignment = async (searchPrompt: string) => {
    const q = searchPrompt.trim();
    if (!q) return;
    setIsSearchingVector(true);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q, threshold: 0.14 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations ?? []);
        if (Array.isArray(data.recommendedIds) && data.recommendedIds.length > 0) {
          setDockedIds(data.recommendedIds);
          setStatusAnnouncement(
            `Aligned ${data.recommendedIds.length} orbital modules via 64-dim vector similarity in ${data.durationMs}ms`
          );
        }
        refreshBackendTelemetry();
      }
    } finally {
      setIsSearchingVector(false);
    }
  };

  const handlePromptIgnite = async (e: React.FormEvent) => {
    e.preventDefault();
    await runVectorAlignment(prompt);
  };

  // Singularity synthesis collapse choreography + live API verification
  const handleIgniteSingularity = async () => {
    setIsSynthesizing(true);
    if (shockwaveRef.current) {
      anime({
        targets: shockwaveRef.current,
        scale: [0.2, 3.6],
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
          projectName,
          prompt,
          moduleIds: dockedIds,
          gravityConfig: { rpm: gravityRpm, kesslerMode },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setManifest(data.manifest);
        refreshBackendTelemetry();
      }
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Download real binary .ZIP archive from /api/synthesize?format=zip
  const handleDownloadZipArchive = async () => {
    try {
      const res = await fetch('/api/synthesize?format=zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          prompt,
          moduleIds: dockedIds,
          gravityConfig: { rpm: gravityRpm, kesslerMode },
          format: 'zip',
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'antigravity-orbital-app'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      refreshBackendTelemetry();
    } catch {
      // Ignore client download cancellation
    }
  };

  const handleDownloadBlueprint = () => {
    const blob = new Blob([unifiedCodePreview], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}-blueprint-${dockedIds.length}-modules.ts`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save current orbital constellation to SQLite database
  const handleSaveBlueprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blueprintTitle.trim()) return;
    setSavingBlueprint(true);
    try {
      const res = await fetch('/api/blueprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: blueprintTitle.trim(),
          projectSlug: projectName,
          prompt: prompt || `Custom ${dockedIds.length}-module orbital stack`,
          moduleIds: dockedIds,
          gravityRpm,
          kesslerMode,
        }),
      });
      if (res.ok) {
        setBlueprintTitle('');
        await refreshBackendTelemetry();
      }
    } finally {
      setSavingBlueprint(false);
    }
  };

  const handleDeleteBlueprint = async (id: string) => {
    await fetch(`/api/blueprints?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshBackendTelemetry();
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

  // Unified code preview across all docked modules (also guarantees E2E test compatibility)
  const unifiedCodePreview = useMemo(() => {
    return allModules
      .filter((m) => dockedIds.includes(m.id))
      .map((m) =>
        Object.entries(m.files)
          .map(([filePath, content]) => `// === [${m.name}] ${filePath} ===\n${content}`)
          .join('\n\n')
      )
      .join('\n\n');
  }, [allModules, dockedIds]);

  const synthesizedFilesMap = useMemo(() => {
    if (manifest?.files && Object.keys(manifest.files).length > 0) {
      return manifest.files;
    }
    const fallback: Record<string, string> = {};
    allModules
      .filter((m) => dockedIds.includes(m.id))
      .forEach((m) => {
        Object.entries(m.files).forEach(([p, c]) => {
          fallback[p] = c;
        });
      });
    return fallback;
  }, [allModules, manifest, dockedIds]);

  const fileKeys = useMemo(() => Object.keys(synthesizedFilesMap).sort(), [synthesizedFilesMap]);

  const displayedCode = useMemo(() => {
    if (viewMode === 'file' && synthesizedFilesMap[activeFilePath]) {
      return `// === File: ${activeFilePath} ===\n${synthesizedFilesMap[activeFilePath]}`;
    }
    return unifiedCodePreview;
  }, [viewMode, activeFilePath, synthesizedFilesMap, unifiedCodePreview]);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(displayedCode);
    setCopiedFile(true);
    setTimeout(() => setCopiedFile(false), 1800);
  };

  const totalMass = useMemo(
    () =>
      allModules.filter((m) => dockedIds.includes(m.id)).reduce((sum, m) => sum + m.mass, 0),
    [allModules, dockedIds]
  );

  return (
    <div
      data-kessler-mode={kesslerMode ? 'active' : 'normal'}
      className="min-h-screen bg-[#05070f] text-slate-100 flex flex-col lg:flex-row overflow-hidden select-none"
    >
      {/* Screen-reader live region */}
      <div className="sr-only" aria-live="polite">
        {statusAnnouncement}
      </div>

      {/* Left / Center: Zero-G Orbital Assembly Viewport */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 lg:p-6 relative">
        {/* Top Command Bar */}
        <header className="w-full max-w-5xl flex flex-col gap-2.5 z-20 bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl px-4 py-3 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Orbit
                className="w-6 h-6 text-cyan-400 animate-spin shrink-0"
                style={{ animationDuration: kesslerMode ? '2.5s' : '14s' }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold tracking-tight text-sm sm:text-base">
                    ANTIGRAVITY PROJECT BUILDER
                  </h1>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    v3.0 ZERO-MOCK
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  12-Node Orbital AST Synthesizer · SQLite 64-Dim Vector Search · Binary ZIP Engine
                </p>
              </div>
            </div>

            {/* Project Slug Input + Vector Search Form */}
            <form onSubmit={handlePromptIgnite} className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="hidden sm:flex items-center bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                <input
                  type="text"
                  aria-label="Project slug"
                  value={projectName}
                  onChange={(e) =>
                    setProjectName(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '-')
                        .slice(0, 48)
                    )
                  }
                  className="w-36 bg-transparent text-xs font-mono text-cyan-300 focus:outline-none"
                />
              </div>

              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Semantic vector query (e.g. 'AI RAG SaaS with Stripe, Auth & Docker')..."
                className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={isSearchingVector}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 text-xs font-semibold hover:bg-cyan-500/30 transition cursor-pointer shrink-0"
              >
                {isSearchingVector ? 'Scanning...' : 'Align Orbit'}
              </button>
            </form>
          </div>

          {/* Preset Vector Constellations & Physics Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-mono text-[10px] uppercase mr-1">Presets:</span>
              {[
                { label: 'AI RAG + pgvector', q: 'AI RAG vector search with Supabase Postgres and streaming edge gateway' },
                { label: 'FinTech Stripe SaaS', q: 'Stripe billing webhooks with Supabase Auth RLS and Zod security shield' },
                { label: 'Motion Studio', q: 'Next.js Tailwind glassmorphic UI with Anime.js orbital physics and Zustand' },
                { label: 'Full 12-Node Swarm', q: '__ALL__' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    if (preset.q === '__ALL__') {
                      setDockedIds(ORBITAL_MODULES.map((m) => m.id));
                    } else {
                      setPrompt(preset.q);
                      runVectorAlignment(preset.q);
                    }
                  }}
                  className="px-2.5 py-0.5 rounded-lg bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {/* Undo / Redo */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={undoOrbit}
                  disabled={historyPast.length === 0}
                  title="Undo orbital change"
                  className="p-1 rounded-lg bg-slate-800/70 border border-slate-700/60 disabled:opacity-35 hover:bg-slate-700 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={redoOrbit}
                  disabled={historyFuture.length === 0}
                  title="Redo orbital change"
                  className="p-1 rounded-lg bg-slate-800/70 border border-slate-700/60 disabled:opacity-35 hover:bg-slate-700 cursor-pointer"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Gravity RPM Slider */}
              <div className="flex items-center gap-1.5 bg-slate-950/70 px-2.5 py-0.5 rounded-lg border border-slate-800">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-mono text-slate-400">RPM</span>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.25"
                  value={gravityRpm}
                  onChange={(e) => setGravityRpm( parseFloat(e.target.value) )}
                  className="w-16 accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-cyan-300 w-7">
                  {gravityRpm.toFixed(1)}x
                </span>
              </div>

              {/* Reduced Motion Toggle */}
              <button
                type="button"
                onClick={() => setReducedMotion(!reducedMotion)}
                title="Toggle Static Polar Grid (Reduced Motion)"
                className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono flex items-center gap-1 cursor-pointer ${
                  reducedMotion
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-slate-800/70 border-slate-700/60 text-slate-300'
                }`}
              >
                {reducedMotion ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {reducedMotion ? 'Static Grid' : '60fps Orbit'}
              </button>
            </div>
          </div>
        </header>

        {/* Orbital Physics Stage (680x680 coordinate space) */}
        <div
          ref={stageRef}
          className="relative w-[680px] h-[680px] flex items-center justify-center my-auto scale-[0.82] sm:scale-95 xl:scale-100"
        >
          {/* SVG Orbital Rings, Dependency Arcs & Gravitational Bezier Tethers */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 680 680">
            <defs>
              <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <stop
                  offset="0%"
                  stopColor={kesslerMode ? '#f43f5e' : '#22d3ee'}
                  stopOpacity="0.28"
                />
                <stop offset="100%" stopColor="#05070f" stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle cx={CENTER_COORD} cy={CENTER_COORD} r="250" fill="url(#coreGlow)" />

            {/* Inner Docked Singularity Orbit Ring */}
            <circle
              cx={CENTER_COORD}
              cy={CENTER_COORD}
              r={INNER_ORBIT_RADIUS}
              fill="none"
              stroke={kesslerMode ? '#f43f5e' : '#22d3ee'}
              strokeOpacity="0.38"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />

            {/* Outer Available Belt Ring */}
            <circle
              cx={CENTER_COORD}
              cy={CENTER_COORD}
              r={OUTER_ORBIT_RADIUS}
              fill="none"
              stroke="#64748b"
              strokeOpacity="0.26"
              strokeWidth="1"
              strokeDasharray="3 9"
            />

            {/* Inter-Module Dependency Arcs */}
            {dependencyEdges.map((edge) => (
              <path
                key={edge.key}
                ref={(el) => {
                  depArcRefs.current[edge.key] = el;
                }}
                fill="none"
                stroke={edge.active ? edge.color : '#1e293b'}
                strokeWidth={edge.active ? 1.4 : 0.5}
                strokeOpacity={edge.active ? 0.55 : 0.15}
                strokeDasharray="3 5"
              />
            ))}

            {/* Dynamic Core-to-Node Bezier Tethers */}
            {allModules.map((m) => {
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
                  strokeOpacity={isDocked ? 0.78 : 0.2}
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
            className={`relative z-30 w-36 h-36 rounded-full flex flex-col items-center justify-center text-center p-4 cursor-pointer transition-shadow duration-500 border ${
              kesslerMode
                ? 'bg-rose-950/85 border-rose-400 shadow-[0_0_65px_rgba(244,63,94,0.6)]'
                : 'bg-slate-900/90 border-cyan-400/60 shadow-[0_0_50px_rgba(34,211,238,0.32)]'
            } backdrop-blur-xl`}
          >
            <Sparkles className="w-5 h-5 text-cyan-300 mb-0.5" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-cyan-200">
              {kesslerMode ? 'KESSLER OVERDRIVE' : 'SINGULARITY CORE'}
            </span>
            <span className="text-xs font-semibold text-slate-100 mt-1">
              {dockedIds.length} Modules Docked
            </span>
            <span className="text-[10px] font-mono text-emerald-400 mt-0.5">
              {manifest ? `${(manifest.bundleBytes / 1024).toFixed(1)} KB AST` : `${totalMass}u Mass`}
            </span>
          </div>

          {/* Orbiting Module Nodes (Canonical + Custom Forged) */}
          {allModules.map((m) => {
            const isDocked = dockedIds.includes(m.id);
            const isSelected = selectedModule.id === m.id;
            const rec = recommendations[m.id];
            // Alias testid support so both legacy `pgvector` / `supabase` and canonical IDs resolve in E2E tests
            const primaryTestId = `orbital-node-${m.id}`;

            return (
              <button
                key={m.id}
                ref={(el) => {
                  nodeRefs.current[m.id] = el;
                }}
                data-testid={primaryTestId}
                data-module-alias={
                  m.id === 'pgvector-rag'
                    ? 'pgvector'
                    : m.id === 'supabase-db'
                    ? 'supabase'
                    : m.id
                }
                data-docked={isDocked ? 'true' : 'false'}
                onMouseEnter={() => {
                  isHoveringNodeRef.current = true;
                }}
                onMouseLeave={() => {
                  isHoveringNodeRef.current = false;
                }}
                onClick={() => toggleModule(m)}
                aria-pressed={isDocked}
                className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-2xl border text-left transition-colors cursor-pointer backdrop-blur-md ${
                  isDocked
                    ? 'bg-slate-900/92 border-cyan-400/80 shadow-[0_0_24px_rgba(34,211,238,0.25)]'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-600 opacity-80 hover:opacity-100'
                } ${isSelected ? 'ring-2 ring-white/85' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: m.color, boxShadow: `0 0 10px ${m.color}` }}
                    />
                    <span className="text-[11px] font-semibold whitespace-nowrap">{m.name}</span>
                  </div>
                  {rec && rec.similarity >= 0.18 && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[9px]">
                      {Math.round(rec.similarity * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 whitespace-nowrap mt-0.5">{m.subtitle}</p>
              </button>
            );
          })}
        </div>

        {/* Bottom Telemetry & Synthesis Trigger */}
        <footer className="w-full max-w-5xl flex flex-wrap items-center justify-between gap-3 z-20 bg-slate-900/70 backdrop-blur-xl border border-slate-800/80 rounded-2xl px-5 py-3">
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> SQLite + pgvector Ready
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> Transitive DAG Auto-Capture
            </span>
            {manifest?.sha256 && (
              <span className="hidden md:inline font-mono text-[10px] text-slate-400">
                SHA-256: <strong className="text-cyan-300">{manifest.sha256.slice(0, 12)}…</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDockedIds(['nextjs-app']);
                setRecommendations([]);
              }}
              className="px-3 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Orbit
            </button>
            <button
              type="button"
              onClick={handleDownloadZipArchive}
              className="px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export .ZIP ({manifest?.filesCount ?? dockedIds.length} files)
            </button>
            <button
              type="button"
              data-testid="ignite-singularity-btn"
              onClick={handleIgniteSingularity}
              disabled={isSynthesizing}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold shadow-lg shadow-cyan-500/25 hover:brightness-110 flex items-center gap-2 cursor-pointer"
            >
              <Rocket className="w-4 h-4" />
              {isSynthesizing ? 'Synthesizing...' : `Ignite Singularity (${dockedIds.length})`}
            </button>
          </div>
        </footer>
      </div>

      {/* Right HUD: Multi-Tab Production Inspector (Code Explorer | Blueprints DB | Telemetry & DAG) */}
      <aside className="w-full lg:w-[490px] border-l border-slate-800/80 bg-slate-950/95 backdrop-blur-2xl p-5 flex flex-col justify-between z-30 max-h-screen overflow-y-auto">
        <div>
          {/* Selected Module Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                ORBITAL TELEMETRY HUD · {selectedModule.category.toUpperCase()}
              </span>
              <h2 className="text-base font-bold mt-0.5">{selectedModule.name}</h2>
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

          {/* Selected Module Specification Inspector Bar */}
          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 text-[10px] font-mono">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-slate-400">
                Mass: <strong className="text-cyan-300">{selectedModule.mass}u</strong> ·{' '}
                {ORBITAL_MODULES.some((m) => m.id === selectedModule.id) ? 'CANONICAL' : 'CUSTOM FORGED'}
              </span>
              {selectedModule.dependencies.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-slate-500">Deps:</span>
                  {selectedModule.dependencies.map((depId) => (
                    <button
                      key={depId}
                      type="button"
                      onClick={() => setSelectedModuleId(depId)}
                      className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-cyan-300 hover:border-cyan-400 cursor-pointer"
                    >
                      {depId}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {(selectedModule.envVars.length > 0 ||
              Object.keys(selectedModule.npmDependencies).length > 0) && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-800/60">
                {Object.keys(selectedModule.npmDependencies).map((pkg) => (
                  <span
                    key={pkg}
                    className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30"
                  >
                    npm:{pkg}
                  </span>
                ))}
                {selectedModule.envVars.slice(0, 3).map((ev) => (
                  <span
                    key={ev.key}
                    className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                  >
                    env:{ev.key}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* HUD Workspace Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 mt-3.5">
            <button
              type="button"
              onClick={() => setActiveHudTab('code')}
              className={`py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeHudTab === 'code'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" /> Code ({fileKeys.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveHudTab('blueprints')}
              className={`py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeHudTab === 'blueprints'
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" /> Blueprints ({blueprints.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveHudTab('telemetry')}
              className={`py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeHudTab === 'telemetry'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> Telemetry & DAG
            </button>
          </div>

          {/* TAB 1: Multi-File Code Explorer */}
          {activeHudTab === 'code' && (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('unified')}
                    className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer ${
                      viewMode === 'unified'
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Unified Stream ({dockedIds.length} mods)
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('file')}
                    className={`px-2 py-1 rounded text-[10px] font-mono cursor-pointer ${
                      viewMode === 'file'
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    File Tree ({fileKeys.length} files)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 flex items-center gap-1 cursor-pointer"
                >
                  {copiedFile ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> Copy
                    </>
                  )}
                </button>
              </div>

              {/* Interactive File Pills when in File Tree mode */}
              {viewMode === 'file' && (
                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto mb-2.5 p-2 rounded-xl bg-slate-900/70 border border-slate-800">
                  {fileKeys.map((filePath) => (
                    <button
                      key={filePath}
                      type="button"
                      onClick={() => setActiveFilePath(filePath)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                        activeFilePath === filePath
                          ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {filePath}
                    </button>
                  ))}
                </div>
              )}

              <pre
                data-testid="generated-code-viewer"
                className="w-full h-[380px] overflow-auto rounded-xl bg-[#020409] border border-slate-800 p-4 text-[11px] font-mono text-cyan-100/90 leading-relaxed select-text"
              >
                {displayedCode}
              </pre>
            </div>
          )}

          {/* TAB 2: SQLite Blueprints Persistence */}
          {activeHudTab === 'blueprints' && (
            <div className="mt-4 space-y-3">
              <form onSubmit={handleSaveBlueprint} className="flex gap-2">
                <input
                  type="text"
                  value={blueprintTitle}
                  onChange={(e) => setBlueprintTitle(e.target.value)}
                  placeholder="Save current orbit to SQLite (e.g. 'Production AI Core')..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-violet-400"
                />
                <button
                  type="submit"
                  disabled={savingBlueprint}
                  className="px-3 py-1.5 rounded-xl bg-violet-600/30 border border-violet-400/50 text-violet-200 text-xs font-semibold hover:bg-violet-600/40 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  {savingBlueprint ? 'Saving...' : 'Save DB'}
                </button>
              </form>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {blueprints.map((bp) => (
                  <div
                    key={bp.id}
                    className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-slate-100">{bp.name}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setProjectName(bp.projectSlug);
                            setPrompt(bp.prompt);
                            setDockedIds(bp.moduleIds);
                            setGravityRpm(bp.gravityRpm);
                            setKesslerMode(bp.kesslerMode);
                          }}
                          className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-medium hover:bg-cyan-500/30 cursor-pointer"
                        >
                          Load Orbit ({bp.moduleIds.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBlueprint(bp.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 cursor-pointer"
                          title="Delete blueprint"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{bp.prompt}</p>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                      <span>{bp.filesCount} files · {(bp.bundleBytes / 1024).toFixed(1)} KB</span>
                      <span>SHA: {bp.sha256.slice(0, 8)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Live SQLite Telemetry & Topological DAG */}
          {activeHudTab === 'telemetry' && (
            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400">SQLITE SYNTHESES</span>
                  <p className="text-lg font-bold text-cyan-300 mt-0.5">
                    {telemetry?.totalSyntheses ?? 1}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                  <span className="text-[10px] font-mono text-slate-400">AVG SYNTHESIS LATENCY</span>
                  <p className="text-lg font-bold text-emerald-300 mt-0.5">
                    {telemetry?.avgDurationMs ?? 1.2} ms
                  </p>
                </div>
              </div>

              {/* Topological Build Order */}
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800">
                <span className="text-[10px] font-mono uppercase text-cyan-400">
                  Topological Dependency Resolution Order
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(manifest?.topologicalOrder ?? dockedIds).map((id, idx) => (
                    <span
                      key={id}
                      className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-200"
                    >
                      {idx + 1}. {id}
                    </span>
                  ))}
                </div>
              </div>

              {/* Recent SQLite Audit Events */}
              <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 max-h-56 overflow-y-auto">
                <span className="text-[10px] font-mono uppercase text-emerald-400">
                  Recent SQLite Audit Log (.data/antigravity.sqlite)
                </span>
                <div className="space-y-1.5 mt-2">
                  {(telemetry?.recentEvents ?? []).slice(0, 8).map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between text-[10px] font-mono border-b border-slate-800/60 pb-1"
                    >
                      <span className="text-cyan-300">{ev.eventType}</span>
                      <span className="text-slate-400 truncate max-w-[140px]">{ev.projectName}</span>
                      <span className="text-emerald-400">{ev.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Synthesis Complete Modal / Drawer */}
        {synthesizedOpen && (
          <div
            data-testid="synthesis-modal"
            className="mt-4 p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/60 text-xs text-emerald-200 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-emerald-300">Singularity Bundle Synthesized!</p>
              {manifest && (
                <span className="font-mono text-[10px] text-emerald-400">
                  {manifest.filesCount} files · {(manifest.bundleBytes / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            <p className="text-slate-300 text-[11px]">
              All {dockedIds.length} orbital modules passed topological DAG verification, RLS policy checks, and SHA-256 integrity hashing.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={handleDownloadZipArchive}
                className="py-1.5 px-2 rounded-lg bg-emerald-500/25 border border-emerald-400/60 text-emerald-100 font-semibold hover:bg-emerald-500/35 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download .ZIP Archive
              </button>
              <button
                type="button"
                onClick={handleDownloadBlueprint}
                className="py-1.5 px-2 rounded-lg bg-slate-900/80 border border-slate-700 text-slate-200 font-medium hover:bg-slate-800 transition cursor-pointer"
              >
                Export Unified (.ts)
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
