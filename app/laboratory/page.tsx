'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useOrbitalStore } from '@/store/useOrbitalStore';
import { Sparkles, Database, Plus, Trash2, Send, Orbit, ShieldAlert } from 'lucide-react';

interface RagDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity?: number;
  matchedTerms?: string[];
  createdAt: string;
}

export default function LaboratoryPage() {
  const { dockedIds, setDockedIds } = useOrbitalStore();

  const [documents, setDocuments] = useState<RagDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('architecture');
  const [newContent, setNewContent] = useState('');
  const [indexing, setIndexing] = useState(false);

  const [streamPrompt, setStreamPrompt] = useState(
    'Design a multi-tenant AI SaaS with pgvector HNSW search, Supabase RLS, and Stripe webhooks'
  );
  const [systemInstruction, setSystemInstruction] = useState('Zero-Trust Orbital Principal Architect');
  const [streamOutput, setStreamOutput] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ limit: string; remaining: string } | null>(null);
  const [recommendedIds, setRecommendedIds] = useState<string[]>([]);
  const [matchedDocIds, setMatchedDocIds] = useState<string[]>([]);
  const [dockedBanner, setDockedBanner] = useState(false);

  const loadDocuments = useCallback(async (query?: string) => {
    const url = query?.trim()
      ? `/api/rag/documents?q=${encodeURIComponent(query.trim())}`
      : '/api/rag/documents';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents ?? []);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    setIndexing(true);
    try {
      const res = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          category: newCategory,
          content: newContent,
        }),
      });
      if (res.ok) {
        setNewTitle('');
        setNewContent('');
        await loadDocuments(searchQuery);
      }
    } finally {
      setIndexing(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    await fetch(`/api/rag/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadDocuments(searchQuery);
  };

  const handleLaunchStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamPrompt.trim()) return;
    setIsStreaming(true);
    setStreamOutput('');
    setDockedBanner(false);

    try {
      const [streamRes, recRes] = await Promise.all([
        fetch('/api/ai/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: streamPrompt,
            systemInstruction,
            matchCount: 4,
          }),
        }),
        fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: streamPrompt }),
        }),
      ]);

      setRateLimitInfo({
        limit: streamRes.headers.get('x-ratelimit-limit') ?? '60',
        remaining: streamRes.headers.get('x-ratelimit-remaining') ?? '59',
      });

      if (recRes.ok) {
        const recData = await recRes.json();
        setRecommendedIds(recData.recommendedIds ?? []);
      }

      if (streamRes.ok) {
        const matchedSet = new Set<string>();
        const decodedChunks: string[] = [];

        const parseSseLine = (line: string) => {
          const payload = line.replace(/^data:\s*/, '').trim();
          if (!payload || payload === '[DONE]') return;
          try {
            const parsed = JSON.parse(payload) as {
              text?: string;
              matchedIds?: string[];
            };
            if (parsed.text) decodedChunks.push(parsed.text);
            if (Array.isArray(parsed.matchedIds)) {
              parsed.matchedIds.forEach((id) => matchedSet.add(id));
            }
          } catch {
            decodedChunks.push(payload);
          }
        };

        if (streamRes.body && typeof streamRes.body.getReader === 'function') {
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n');
            buffer = parts.pop() ?? '';
            for (const line of parts) {
              if (line.startsWith('data: ')) {
                parseSseLine(line);
                setStreamOutput(decodedChunks.join(''));
              }
            }
          }
          if (buffer.startsWith('data: ')) {
            parseSseLine(buffer);
            setStreamOutput(decodedChunks.join(''));
          }
        } else {
          const rawSse = await streamRes.text();
          const lines = rawSse.split('\n').filter((l) => l.startsWith('data: '));
          for (const line of lines) {
            parseSseLine(line);
          }
          setStreamOutput(decodedChunks.join(''));
        }
        setMatchedDocIds(Array.from(matchedSet));
      }
      await loadDocuments(streamPrompt);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleDockRecommended = () => {
    if (recommendedIds.length === 0) return;
    setDockedIds(Array.from(new Set([...dockedIds, ...recommendedIds])));
    setDockedBanner(true);
  };

  return (
    <main
      data-testid="laboratory-page"
      className="min-h-[calc(100vh-52px)] bg-[#05070f] text-slate-100 p-6 lg:p-8"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-6 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400">
              ORBITAL AI & PGVECTOR RAG LABORATORY
            </span>
            <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-cyan-400" />
              Semantic Knowledge & Edge SSE Stream Sandbox
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Test hybrid SQLite/pgvector semantic retrieval, inspect cosine similarity scores, and stream contextual AI architectural syntheses.
            </p>
          </div>
          {rateLimitInfo && (
            <div
              data-testid="lab-ratelimit-badge"
              className="px-3.5 py-2 rounded-xl bg-slate-950 border border-pink-500/40 text-xs font-mono text-pink-300 flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 text-pink-400" />
              Rate Shield: {rateLimitInfo.remaining}/{rateLimitInfo.limit} RPM Remaining
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Edge AI Streamer & Constellation Recommender */}
          <section className="lg:col-span-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-violet-300 flex items-center gap-2">
              <Send className="w-4 h-4" /> Edge AI Streamer (/api/ai/stream)
            </h2>

            <form onSubmit={handleLaunchStream} className="space-y-3">
              <div>
                <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                  System Instruction
                </label>
                <input
                  type="text"
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-violet-400"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                  <label className="text-[11px] font-mono uppercase text-slate-400">
                    Architectural Synthesis Prompt
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {[
                      {
                        label: 'pgvector HNSW',
                        q: 'Design a multi-tenant AI SaaS with pgvector HNSW search, Supabase RLS, and Stripe webhooks',
                      },
                      {
                        label: 'Stripe Ledger',
                        q: 'Implement idempotent Stripe billing webhooks with HMAC-SHA256 verification and Postgres RLS',
                      },
                      {
                        label: 'Edge Rate Shield',
                        q: 'Configure sliding-window rate limiting and Zod API validation for Edge AI streaming routes',
                      },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setStreamPrompt(preset.q)}
                        className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-cyan-300 hover:border-cyan-500/50 cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  data-testid="lab-stream-prompt"
                  rows={3}
                  value={streamPrompt}
                  onChange={(e) => setStreamPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                data-testid="lab-stream-submit"
                disabled={isStreaming}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold hover:brightness-110 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isStreaming ? 'Streaming Vector RAG Context...' : 'Execute RAG Search & Stream SSE'}
              </button>
            </form>

            <pre
              data-testid="lab-stream-output"
              className="w-full min-h-[170px] rounded-xl bg-[#020409] border border-slate-800 p-4 text-xs font-mono text-cyan-200 whitespace-pre-wrap leading-relaxed"
            >
              {streamOutput || '// Click "Execute RAG Search & Stream SSE" to stream RAG-augmented tokens...'}
            </pre>

            {recommendedIds.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-cyan-300">
                    Recommended Constellation ({recommendedIds.length} modules)
                  </span>
                  <button
                    type="button"
                    data-testid="lab-dock-recommended-btn"
                    onClick={handleDockRecommended}
                    className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 cursor-pointer flex items-center gap-1.5"
                  >
                    <Orbit className="w-3.5 h-3.5" />
                    Dock Recommended Constellation
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recommendedIds.map((id) => (
                    <span
                      key={id}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300"
                    >
                      {id}
                    </span>
                  ))}
                </div>
                {dockedBanner && (
                  <p data-testid="lab-docked-confirmation" className="text-[11px] text-emerald-400 font-mono">
                    ✓ Synced {recommendedIds.length} modules into active Singularity Core orbit!
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Right Column: Dual Vector RAG Knowledge Base (/api/rag/documents) */}
          <section className="lg:col-span-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                <Database className="w-4 h-4" /> Indexed RAG Playbooks ({documents.length})
              </h2>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  loadDocuments(e.target.value);
                }}
                placeholder="Filter by semantic query..."
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
              />
            </div>

            <form onSubmit={handleAddDocument} className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  data-testid="rag-doc-title-input"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="New Playbook Title (e.g., 'Edge Rate Limiting Spec')..."
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  <option value="architecture">architecture</option>
                  <option value="security">security</option>
                  <option value="ai">ai</option>
                  <option value="database">database</option>
                  <option value="frontend">frontend</option>
                  <option value="backend">backend</option>
                </select>
              </div>
              <textarea
                rows={2}
                data-testid="rag-doc-content-input"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Paste architectural specification or code pattern to embed into vector store..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100"
              />
              <button
                type="submit"
                data-testid="rag-doc-submit-btn"
                disabled={indexing}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {indexing ? 'Embedding Vector...' : 'Index Document into RAG Store'}
              </button>
            </form>

            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  data-testid={`rag-doc-item-${doc.id}`}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-slate-100">{doc.title}</span>
                    <div className="flex items-center gap-2">
                      {matchedDocIds.includes(doc.id) && (
                        <span className="px-2 py-0.5 rounded bg-violet-500/20 text-[10px] font-mono text-violet-300 border border-violet-500/40">
                          Used in Latest Stream
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-[10px] font-mono uppercase text-cyan-300 border border-slate-800">
                        {doc.category}
                      </span>
                      {typeof doc.similarity === 'number' && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-mono text-emerald-300 border border-emerald-500/40">
                          {(doc.similarity * 100).toFixed(1)}% match
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Delete RAG document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{doc.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
