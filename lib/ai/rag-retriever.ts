import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  computeSemanticEmbedding,
  listRagDocuments,
  searchModulesByVector,
} from '@/lib/db/sqlite-engine';

export interface MatchedDocument {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface RetrieveContextOptions {
  matchThreshold?: number;
  matchCount?: number;
  projectId?: string;
  queryText?: string;
  supabaseClient?: SupabaseClient | null;
}

export function generateDeterministicEmbedding(input: string, dimensions = 1536): number[] {
  const safeInput = input.trim() || 'orbital-default';
  const base64 = computeSemanticEmbedding(safeInput);
  const raw = new Array<number>(dimensions);
  let sumSquares = 0;

  for (let i = 0; i < dimensions; i++) {
    const baseVal = base64[i % base64.length] ?? 0;
    const harmonic =
      Math.cos(((i + 1) * ( safeInput.charCodeAt(i % safeInput.length) || 31 )) % 97) * 0.015;
    const val = baseVal + harmonic;
    raw[i] = val;
    sumSquares += val * val;
  }

  const norm = Math.sqrt(sumSquares) || 1;
  return raw.map((v) => Number((v / norm).toFixed(6)));
}

export async function retrieveSemanticContext(
  queryEmbedding: number[],
  matchThreshold = 0.72,
  matchCount = 5,
  options?: RetrieveContextOptions
): Promise<MatchedDocument[]> {
  const supabase = options?.supabaseClient ?? getSupabaseBrowserClient();
  const effectiveThreshold = options?.matchThreshold ?? matchThreshold;
  const effectiveCount = options?.matchCount ?? matchCount;

  if (supabase) {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: effectiveThreshold,
      match_count: effectiveCount,
      filter_project_id: options?.projectId ?? null,
    });

    if (error || !data) {
      throw new Error(`pgvector RPC match_documents failed: ${error?.message ?? 'Unknown error'}`);
    }

    return data as MatchedDocument[];
  }

  // Fallback to local SQLite 64-dim vector similarity engine across both RAG Playbooks and Orbital Modules
  if (options?.queryText) {
    const localThreshold = Math.min(effectiveThreshold, 0.12);
    const ragDocs = listRagDocuments(options.queryText, localThreshold, effectiveCount);
    const moduleDocs = searchModulesByVector(options.queryText, localThreshold).slice(
      0,
      effectiveCount
    );

    const merged: MatchedDocument[] = [
      ...ragDocs.map((doc) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        metadata: {
          ...doc.metadata,
          category: doc.category,
          matchedTerms: doc.matchedTerms ?? [],
          source: 'rag-playbook',
        },
        similarity: doc.similarity ?? 0.5,
      })),
      ...moduleDocs.map((m) => ({
        id: m.id,
        title: m.name,
        content: `Orbital module (${m.category}) matched terms: ${m.matchedTerms.join(', ')}`,
        metadata: {
          category: m.category,
          matchedTerms: m.matchedTerms,
          source: 'orbital-module',
        },
        similarity: m.similarity,
      })),
    ];

    merged.sort((a, b) => b.similarity - a.similarity);
    return merged.slice(0, effectiveCount);
  }

  return [];
}
