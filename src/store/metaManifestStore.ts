import { create } from 'zustand';
import type { AircraftRecord, LiveryEntry, Manifest } from '@/types/metaManifest';

function setNestedValue(obj: Manifest, keyPath: string, value: unknown): Manifest {
    const keys = keyPath.split('.');
    if (keys.length === 1) return { ...obj, [keys[0]]: value };
    const [head, ...rest] = keys;
    const nested = (obj[head] as Record<string, unknown>) ?? {};
    return { ...obj, [head]: setNestedValue(nested as Manifest, rest.join('.'), value) };
}

function getNestedValue(obj: Manifest, keyPath: string): unknown {
    return keyPath.split('.').reduce<unknown>((acc, key) => {
        if (acc == null || typeof acc !== 'object') return undefined;
        return (acc as Record<string, unknown>)[key];
    }, obj);
}

function manifestsEqual(a: Manifest, b: Manifest): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

interface ManifestStore {
    liveries: LiveryEntry[];
    selectedIds: Set<string>;
    isSaving: boolean;
    saveErrors: string[];
    pendingTextureCfg: { content: string; dirPaths: string[] } | null;
    addLiveries: (dirPaths: string[]) => Promise<void>;
    removeLivery: (id: string) => void;
    clearAll: () => void;
    toggleSelect: (id: string) => void;
    selectAll: () => void;
    selectNone: () => void;
    updateField: (keyPath: string, value: unknown) => void;
    applyAutoFill: (liveryId: string, record: AircraftRecord, registration: string) => void;
    revertSelected: () => void;
    saveSelected: () => Promise<void>;
    saveAll: () => Promise<void>;
    clearSaveErrors: () => void;
    setPendingTextureCfg: (pending: { content: string; dirPaths: string[] } | null) => void;
}

export const useMetaManifestStore = create<ManifestStore>((set, get) => ({
    liveries: [],
    selectedIds: new Set(),
    isSaving: false,
    saveErrors: [],
    pendingTextureCfg: null,

    addLiveries: async (dirPaths) => {
        const existing = new Set(get().liveries.map((l) => l.dirPath));
        const newPaths = dirPaths.filter((p) => !existing.has(p));
        if (newPaths.length === 0) return;
        const entries = await Promise.all(
            newPaths.map(async (dirPath) => {
                const raw = await window.electronAPI!.metaReadManifest(dirPath);
                const manifest = (raw as Manifest) ?? {};
                const dirName = dirPath.split(/[\\/]/).pop() ?? dirPath;
                return {
                    id: dirPath, dirPath, dirName,
                    manifest,
                    originalManifest: JSON.parse(JSON.stringify(manifest)) as Manifest,
                    hasChanges: false,
                    loadError: raw === null,
                } satisfies LiveryEntry;
            })
        );
        set((state) => ({ liveries: [...state.liveries, ...entries] }));
    },

    removeLivery: (id) => {
        set((state) => {
            const selectedIds = new Set(state.selectedIds);
            selectedIds.delete(id);
            return { liveries: state.liveries.filter((l) => l.id !== id), selectedIds };
        });
    },

    clearAll: () => set({ liveries: [], selectedIds: new Set(), pendingTextureCfg: null }),

    setPendingTextureCfg: (pending) => set({ pendingTextureCfg: pending }),

    toggleSelect: (id) => {
        set((state) => {
            const selectedIds = new Set(state.selectedIds);
            if (selectedIds.has(id)) selectedIds.delete(id);
            else selectedIds.add(id);
            return { selectedIds };
        });
    },

    selectAll: () => set((state) => ({ selectedIds: new Set(state.liveries.map((l) => l.id)) })),
    selectNone: () => set({ selectedIds: new Set() }),

    updateField: (keyPath, value) => {
        set((state) => {
            const updated = state.liveries.map((livery) => {
                if (!state.selectedIds.has(livery.id)) return livery;
                const newManifest = setNestedValue(livery.manifest, keyPath, value);
                return { ...livery, manifest: newManifest, hasChanges: !manifestsEqual(newManifest, livery.originalManifest) };
            });
            return { liveries: updated };
        });
    },

    applyAutoFill: (liveryId, record, registration) => {
        set((state) => ({
            liveries: state.liveries.map((livery) => {
                if (livery.id !== liveryId) return livery;
                const newManifest: Manifest = {
                    ...livery.manifest,
                    managerData: {
                        ...((livery.manifest.managerData as object) ?? {}),
                        name: registration,
                        aircraft: record.aircraftType,
                        engine: record.engine,
                        year: record.year,
                        category: record.category,
                    },
                };
                return { ...livery, manifest: newManifest, hasChanges: !manifestsEqual(newManifest, livery.originalManifest) };
            }),
        }));
    },

    revertSelected: () => {
        set((state) => ({
            liveries: state.liveries.map((livery) => {
                if (!state.selectedIds.has(livery.id)) return livery;
                return { ...livery, manifest: JSON.parse(JSON.stringify(livery.originalManifest)) as Manifest, hasChanges: false };
            }),
        }));
    },

    saveSelected: async () => {
        const { liveries, selectedIds } = get();
        const toSave = liveries.filter((l) => selectedIds.has(l.id) && l.hasChanges && !l.loadError);
        if (toSave.length === 0) return;
        await performSave(toSave, set);
    },

    saveAll: async () => {
        const { liveries, pendingTextureCfg } = get();
        const toSave = liveries.filter((l) => l.hasChanges && !l.loadError);
        if (toSave.length > 0) await performSave(toSave, set);
        if (pendingTextureCfg) {
            await window.electronAPI!.metaWriteTextureCfg(pendingTextureCfg.dirPaths, pendingTextureCfg.content);
            set({ pendingTextureCfg: null });
        }
    },

    clearSaveErrors: () => set({ saveErrors: [] }),
}));

type SetFn = (partialOrFn: Partial<ManifestStore> | ((state: ManifestStore) => Partial<ManifestStore>)) => void;

async function performSave(toSave: LiveryEntry[], set: SetFn) {
    set({ isSaving: true, saveErrors: [] });
    const updates = toSave.map((l) => ({ dirPath: l.dirPath, manifest: l.manifest }));
    const result = await window.electronAPI!.metaWriteManifests(updates);
    set((state: ManifestStore) => ({
        isSaving: false,
        saveErrors: result.errors,
        liveries: state.liveries.map((livery) => {
            const wasSaved = toSave.find((s) => s.id === livery.id);
            if (!wasSaved) return livery;
            const failed = result.errors.some((e) => e.startsWith(livery.dirName));
            if (failed) return livery;
            return { ...livery, originalManifest: JSON.parse(JSON.stringify(livery.manifest)) as typeof livery.manifest, hasChanges: false };
        }),
    }));
}

export { getNestedValue };
