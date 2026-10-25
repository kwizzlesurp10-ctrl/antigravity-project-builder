'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useOrbitalStore } from '@/store/useOrbitalStore';
import type { OrbitalModule, ModuleCategory } from '@/lib/modules-catalog';
import { withAdminAuthHeaders } from '@/lib/security/admin-headers';
import { Hammer, Sparkles, Plus, Trash2, Orbit, Code2 } from 'lucide-react';

export default function ForgePage() {
  const { dockedIds, setDockedIds } = useOrbitalStore();

  const [customModules, setCustomModules] = useState<OrbitalModule[]>([]);
  const [name, setName] = useState('Temporal Workflow Engine');
  const [category, setCategory] = useState<ModuleCategory>('backend');
  const [prompt, setPrompt] = useState(
    'Durable distributed workflow execution engine with retry policies, dead-letter queues, and Zod payload schemas'
  );

  const [draftModule, setDraftModule] = useState<OrbitalModule | null>(null);
  const [selectedFileKey, setSelectedFileKey] = useState<string>('');
  const [newFilePath, setNewFilePath] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forgeStatus, setForgeStatus] = useState<string>('');

  const loadCustomModules = useCallback(async () => {
    const res = await fetch('/api/modules/forge', { headers: withAdminAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setCustomModules(data.customModules ?? []);
    }
  }, []);

  useEffect(() => {
    loadCustomModules();
  }, [loadCustomModules]);

  const handleGenerateSkeleton = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    setGenerating(true);
    setForgeStatus('');
    try {
      const res = await fetch('/api/modules/forge', {
        method: 'POST',
        headers: withAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'generate-skeleton',
          name,
          category,
          prompt,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const mod = data.module as OrbitalModule;
        setDraftModule(mod);
        setSelectedFileKey(Object.keys(mod.files)[0] ?? '');
        setForgeStatus(`Generated ${Object.keys(mod.files).length} file(s) for '${mod.id}'`);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveAndDock = async () => {
    if (!draftModule) return;
    setSaving(true);
    try {
      const res = await fetch('/api/modules/forge', {
        method: 'POST',
        headers: withAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'save',
          ...draftModule,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const saved = data.module as OrbitalModule;
        setDockedIds(Array.from(new Set([...dockedIds, saved.id])));
        setForgeStatus(`✓ Forged '${saved.id}' into SQLite & docked into active Singularity Core!`);
        await loadCustomModules();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustom = async (id: string) => {
    await fetch(`/api/modules/forge?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: withAdminAuthHeaders(),
    });
    setDockedIds(dockedIds.filter((d) => d !== id));
    await loadCustomModules();
  };

  return (
    <main
      data-testid="forge-page"
      className="min-h-[calc(100vh-52px)] bg-[#05070f] text-slate-100 p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="rounded-2xl border border-violet-500/30 bg-slate-900/70 p-6 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-violet-400">
              CUSTOM ORBITAL MODULE FORGE IDE
            </span>
            <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Hammer className="w-6 h-6 text-violet-400" />
              AI Module Skeleton Generator & SQLite Catalog Extension
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Synthesize custom orbital modules from natural language, inspect and edit their AST files, and index them directly into the 64-dim SQLite vector store.
            </p>
          </div>
          <span className="px-3.5 py-2 rounded-xl bg-slate-950 border border-violet-500/40 text-xs font-mono text-violet-300">
            {customModules.length} Custom Module(s) Forged
          </span>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: AI Skeleton Generator & Saved Custom Modules */}
          <section className="lg:col-span-5 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> 1. AI Module Skeleton Generator
            </h2>

            <form onSubmit={handleGenerateSkeleton} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Module Name
                  </label>
                  <input
                    type="text"
                    data-testid="forge-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                    Category
                  </label>
                  <select
                    data-testid="forge-category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ModuleCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-100"
                  >
                    <option value="backend">backend</option>
                    <option value="database">database</option>
                    <option value="ai">ai</option>
                    <option value="frontend">frontend</option>
                    <option value="devops">devops</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                  Architectural Specification Prompt
                </label>
                <textarea
                  rows={3}
                  data-testid="forge-prompt-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100"
                />
              </div>

              <button
                type="submit"
                data-testid="forge-generate-btn"
                disabled={generating}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-500 text-white text-xs font-semibold hover:brightness-110 cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {generating ? 'Synthesizing Module Skeleton...' : 'Generate AI Module Skeleton'}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <h3 className="text-xs font-mono uppercase text-slate-400">
                Forged SQLite Modules ({customModules.length})
              </h3>
              {customModules.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  No custom modules forged yet. Generate a skeleton above and click &ldquo;Forge &amp; Dock&rdquo;.
                </p>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {customModules.map((mod) => (
                    <div
                      key={mod.id}
                      data-testid={`custom-module-card-${mod.id}`}
                      className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-xs text-slate-100">{mod.name}</span>
                        <span className="ml-2 text-[10px] font-mono text-cyan-300">({mod.id})</span>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{mod.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDockedIds(Array.from(new Set([...dockedIds, mod.id])))}
                          className="px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono cursor-pointer"
                        >
                          {dockedIds.includes(mod.id) ? 'Docked' : 'Dock'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustom(mod.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Right Column: Interactive Draft Inspector & Editor */}
          <section className="lg:col-span-7 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                <Code2 className="w-4 h-4" /> 2. Module AST Inspector & SQLite Forger
              </h2>
              {draftModule && (
                <button
                  type="button"
                  data-testid="forge-save-dock-btn"
                  onClick={handleSaveAndDock}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-500/25 border border-emerald-400/60 text-emerald-100 text-xs font-semibold hover:bg-emerald-500/35 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <Orbit className="w-4 h-4" />
                  {saving ? 'Forging into SQLite...' : `Forge & Dock '${draftModule.id}'`}
                </button>
              )}
            </div>

            {forgeStatus && (
              <div
                data-testid="forge-status-banner"
                className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs font-mono text-emerald-300"
              >
                {forgeStatus}
              </div>
            )}

            {draftModule ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Subtitle
                    </label>
                    <input
                      type="text"
                      value={draftModule.subtitle}
                      onChange={(e) =>
                        setDraftModule({ ...draftModule, subtitle: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                      Orbital Mass (5-35u)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={35}
                      value={draftModule.mass}
                      onChange={(e) =>
                        setDraftModule({
                          ...draftModule,
                          mass: Math.min(35, Math.max(5, Number(e.target.value) || 15)),
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-cyan-300 font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(draftModule.files).map((filePath) => (
                      <button
                        key={filePath}
                        type="button"
                        onClick={() => setSelectedFileKey(filePath)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer ${
                          selectedFileKey === filePath
                            ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50'
                            : 'bg-slate-950 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {filePath}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newFilePath}
                      onChange={(e) => setNewFilePath(e.target.value)}
                      placeholder="Add file (e.g. lib/worker.ts)"
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cleaned = newFilePath.trim().replace(/^\/+/, '');
                        if (!cleaned) return;
                        setDraftModule({
                          ...draftModule,
                          files: {
                            ...draftModule.files,
                            [cleaned]: `// ${cleaned} — Synthesized for ${draftModule.name}\nexport const READY = true;\n`,
                          },
                        });
                        setSelectedFileKey(cleaned);
                        setNewFilePath('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-mono cursor-pointer"
                    >
                      + File
                    </button>
                  </div>
                </div>

                <textarea
                  data-testid="forge-file-editor"
                  rows={14}
                  value={draftModule.files[selectedFileKey] ?? ''}
                  onChange={(e) =>
                    setDraftModule({
                      ...draftModule,
                      files: {
                        ...draftModule.files,
                        [selectedFileKey]: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-xl bg-[#020409] border border-slate-800 p-4 text-xs font-mono text-cyan-100 leading-relaxed focus:outline-none focus:border-cyan-400"
                />
              </div>
            ) : (
              <div className="h-[320px] rounded-xl bg-[#020409] border border-slate-800 flex items-center justify-center text-xs font-mono text-slate-500">
                Click &ldquo;Generate AI Module Skeleton&rdquo; on the left to inspect and edit synthesized module files.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
