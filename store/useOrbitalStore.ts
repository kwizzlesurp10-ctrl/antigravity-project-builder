import { create } from 'zustand';

export interface SynthesizedFileMeta {
  path: string;
  bytes: number;
  category: string;
  moduleId: string;
}

export interface SynthesisManifest {
  project: string;
  description: string;
  generatedAt: string;
  modules: string[];
  autoAddedIds: string[];
  topologicalOrder: string[];
  dependencyEdges: Array<{ from: string; to: string }>;
  filesCount: number;
  bundleBytes: number;
  sha256: string;
  files: Record<string, string>;
  fileMeta: SynthesizedFileMeta[];
}

export interface ModuleRecommendation {
  id: string;
  name: string;
  category: string;
  similarity: number;
  matchedTerms: string[];
}

export interface SavedBlueprint {
  id: string;
  name: string;
  projectSlug: string;
  prompt: string;
  moduleIds: string[];
  gravityRpm: number;
  kesslerMode: boolean;
  filesCount: number;
  bundleBytes: number;
  sha256: string;
  createdAt: string;
}

export interface TelemetrySummary {
  totalSyntheses: number;
  avgDurationMs: number;
  totalBlueprints: number;
  vectorIndexSize: number;
  recentEvents: Array<{
    id: string;
    eventType: string;
    projectName: string;
    moduleCount: number;
    filesCount: number;
    bundleBytes: number;
    durationMs: number;
    createdAt: string;
  }>;
}

interface OrbitalStoreState {
  projectName: string;
  prompt: string;
  dockedIds: string[];
  historyPast: string[][];
  historyFuture: string[][];
  selectedModuleId: string;
  activeFilePath: string;
  activeHudTab: 'code' | 'blueprints' | 'telemetry';
  gravityRpm: number;
  kesslerMode: boolean;
  reducedMotion: boolean;
  isSynthesizing: boolean;
  isSearchingVector: boolean;
  manifest: SynthesisManifest | null;
  recommendations: Record<string, ModuleRecommendation>;
  blueprints: SavedBlueprint[];
  telemetry: TelemetrySummary | null;

  setProjectName: (name: string) => void;
  setPrompt: (prompt: string) => void;
  setDockedIds: (ids: string[]) => void;
  undoOrbit: () => void;
  redoOrbit: () => void;
  setSelectedModuleId: (id: string) => void;
  setActiveFilePath: (path: string) => void;
  setActiveHudTab: (tab: 'code' | 'blueprints' | 'telemetry') => void;
  setGravityRpm: (rpm: number) => void;
  setKesslerMode: (enabled: boolean | ((prev: boolean) => boolean)) => void;
  setReducedMotion: (enabled: boolean) => void;
  setIsSynthesizing: (loading: boolean) => void;
  setIsSearchingVector: (loading: boolean) => void;
  setManifest: (manifest: SynthesisManifest | null) => void;
  setRecommendations: (recs: ModuleRecommendation[]) => void;
  setBlueprints: (blueprints: SavedBlueprint[]) => void;
  setTelemetry: (telemetry: TelemetrySummary) => void;
}

export const useOrbitalStore = create<OrbitalStoreState>((set) => ({
  projectName: 'antigravity-orbital-app',
  prompt: '',
  dockedIds: ['nextjs-app', 'anime-physics', 'supabase-db'],
  historyPast: [],
  historyFuture: [],
  selectedModuleId: 'nextjs-app',
  activeFilePath: 'package.json',
  activeHudTab: 'code',
  gravityRpm: 1.0,
  kesslerMode: false,
  reducedMotion: false,
  isSynthesizing: false,
  isSearchingVector: false,
  manifest: null,
  recommendations: {},
  blueprints: [],
  telemetry: null,

  setProjectName: (projectName) => set({ projectName }),
  setPrompt: (prompt) => set({ prompt }),
  setDockedIds: (newIds) =>
    set((state) => {
      const normalized = Array.from(new Set(newIds));
      if (
        normalized.length === state.dockedIds.length &&
        normalized.every((id) => state.dockedIds.includes(id))
      ) {
        return state;
      }
      return {
        dockedIds: normalized,
        historyPast: [...state.historyPast.slice(-19), state.dockedIds],
        historyFuture: [],
      };
    }),
  undoOrbit: () =>
    set((state) => {
      if (state.historyPast.length === 0) return state;
      const previous = state.historyPast[state.historyPast.length - 1];
      return {
        dockedIds: previous,
        historyPast: state.historyPast.slice(0, -1),
        historyFuture: [state.dockedIds, ...state.historyFuture],
      };
    }),
  redoOrbit: () =>
    set((state) => {
      if (state.historyFuture.length === 0) return state;
      const next = state.historyFuture[0];
      return {
        dockedIds: next,
        historyPast: [...state.historyPast, state.dockedIds],
        historyFuture: state.historyFuture.slice(1),
      };
    }),
  setSelectedModuleId: (selectedModuleId) => set({ selectedModuleId }),
  setActiveFilePath: (activeFilePath) => set({ activeFilePath }),
  setActiveHudTab: (activeHudTab) => set({ activeHudTab }),
  setGravityRpm: (gravityRpm) => set({ gravityRpm }),
  setKesslerMode: (kesslerUpdater) =>
    set((state) => ({
      kesslerMode:
        typeof kesslerUpdater === 'function' ? kesslerUpdater(state.kesslerMode) : kesslerUpdater,
    })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setIsSynthesizing: (isSynthesizing) => set({ isSynthesizing }),
  setIsSearchingVector: (isSearchingVector) => set({ isSearchingVector }),
  setManifest: (manifest) => set({ manifest }),
  setRecommendations: (recs) =>
    set({
      recommendations: Object.fromEntries(recs.map((r) => [r.id, r])),
    }),
  setBlueprints: (blueprints) => set({ blueprints }),
  setTelemetry: (telemetry) => set({ telemetry }),
}));
