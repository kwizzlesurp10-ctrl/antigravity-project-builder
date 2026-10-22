'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOrbitalStore } from '@/store/useOrbitalStore';
import { Orbit, Sparkles, ShieldCheck, Hammer, Activity, Database } from 'lucide-react';

const NAV_LINKS = [
  { href: '/', label: 'Orbital Studio', icon: Orbit, testId: 'nav-orbital-studio' },
  { href: '/laboratory', label: 'AI & RAG Lab', icon: Sparkles, testId: 'nav-laboratory' },
  { href: '/shield', label: 'Zero-Trust Shield & Diff', icon: ShieldCheck, testId: 'nav-shield' },
  { href: '/forge', label: 'Module Forge IDE', icon: Hammer, testId: 'nav-forge' },
];

export default function OrbitalNavBar() {
  const pathname = usePathname();
  const { projectName, dockedIds } = useOrbitalStore();
  const [health, setHealth] = useState<{
    status: string;
    vectorIndexSize: number;
    customModulesCount: number;
    engineLabel: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const pollHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && active) {
          const data = await res.json();
          setHealth({
            status: data.status ?? 'orbital-healthy',
            vectorIndexSize: data.database?.vectorIndexSize ?? 12,
            customModulesCount: data.database?.customModulesCount ?? 0,
            engineLabel: 'SQLite WAL',
          });
        }
      } catch {
        // Non-blocking health check
      }
    };
    pollHealth();
    const timer = setInterval(pollHealth, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pathname, dockedIds.length]);

  return (
    <nav
      data-testid="orbital-command-bar"
      className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#05070f]/90 backdrop-blur-xl px-5 py-2.5 flex flex-wrap items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
          <span className="font-mono text-xs uppercase tracking-widest text-cyan-300 font-semibold">
            Antigravity Singularity v3.5
          </span>
        </div>
        <span className="hidden sm:inline-block text-slate-700">|</span>
        <span className="hidden sm:inline-block font-mono text-xs text-slate-400">
          Project: <strong className="text-slate-200">{projectName}</strong>
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {NAV_LINKS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={item.testId}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition ${
                active
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[11px] font-mono">
        {health && (
          <span
            data-testid="nav-health-badge"
            className="hidden md:flex px-2.5 py-1 rounded-full bg-slate-900/90 border border-cyan-500/30 text-cyan-300 items-center gap-1.5"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                health.status === 'orbital-healthy' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <Database className="w-3 h-3 text-cyan-400" />
            {health.vectorIndexSize}+{health.customModulesCount} Vecs • {health.engineLabel}
          </span>
        )}
        <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          {dockedIds.length} Docked
        </span>
      </div>
    </nav>
  );
}
