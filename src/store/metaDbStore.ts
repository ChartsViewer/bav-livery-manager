import { create } from 'zustand';
import type { AircraftRecord } from '@/types/metaManifest';
import { useAuthStore } from '@/store/authStore';
import { META_AIRCRAFT_DB_URL } from '@shared/constants';

interface DbStore {
    records: AircraftRecord[];
    isLoaded: boolean;
    loadError: string | null;
    load: () => Promise<void>;
    lookup: (registration: string) => AircraftRecord | null;
    upsert: (record: AircraftRecord) => void;
    remove: (registration: string) => void;
    save: () => Promise<boolean>;
}

export const useMetaDbStore = create<DbStore>((set, get) => ({
    records: [],
    isLoaded: false,
    loadError: null,

    load: async () => {
        set({ isLoaded: false, loadError: null });
        try {
            const token = useAuthStore.getState().token;
            const res = await fetch(META_AIRCRAFT_DB_URL, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const records: AircraftRecord[] = await res.json();
            set({ records, isLoaded: true });
        } catch (err) {
            set({ isLoaded: true, loadError: err instanceof Error ? err.message : 'Failed to load aircraft database' });
        }
    },

    lookup: (registration) => get().records.find((r) => r.registration === registration) ?? null,

    upsert: (record) => {
        set((state) => {
            const exists = state.records.some((r) => r.registration === record.registration);
            const records = exists
                ? state.records.map((r) => (r.registration === record.registration ? record : r))
                : [...state.records, record];
            return { records };
        });
    },

    remove: (registration) => {
        set((state) => ({ records: state.records.filter((r) => r.registration !== registration) }));
    },

    save: async () => {
        try {
            const token = useAuthStore.getState().token;
            const res = await fetch(META_AIRCRAFT_DB_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(get().records),
            });
            return res.ok;
        } catch {
            return false;
        }
    },
}));
