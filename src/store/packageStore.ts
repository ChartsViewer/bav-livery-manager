import { create } from 'zustand';
import type { Package, PackageDownloadState } from '@/types/package';
import type { Simulator } from '@/types/livery';
import { useAuthStore } from '@/store/authStore';
import type { InstalledPackageRecord } from '@/types/electron-api';

const getAPI = () => (typeof window === 'undefined' ? undefined : window.electronAPI);

interface PackageState {
    downloadStates: Record<string, PackageDownloadState>;
    installedPackages: InstalledPackageRecord[];
    error: string | null;
    listenerAttached: boolean;
    attachListener: () => void;
    refreshInstalled: () => Promise<void>;
    isInstalled: (slug: string, simulator: Simulator) => boolean;
    handleDownload: (pkg: Package, simulator: Simulator) => Promise<boolean>;
    cancelDownload: (slug: string) => Promise<void>;
    handleUninstall: (slug: string, simulator: Simulator) => Promise<boolean>;
    clearError: () => void;
}

export const usePackageStore = create<PackageState>((set, get) => ({
    downloadStates: {},
    installedPackages: [],
    error: null,
    listenerAttached: false,

    attachListener: () => {
        if (get().listenerAttached) return;
        const api = getAPI();
        if (!api?.onPackageProgress) return;

        api.onPackageProgress((payload) => {
            const existing = get().downloadStates[payload.slug];
            if (!existing) return;
            if (existing.progress === payload.progress && existing.extracting === payload.extracting) return;

            set((state) => ({
                downloadStates: {
                    ...state.downloadStates,
                    [payload.slug]: {
                        ...existing,
                        progress: payload.progress,
                        downloaded: payload.downloaded,
                        total: payload.total ?? existing.total,
                        extracting: payload.extracting
                    }
                }
            }));
        });

        set({ listenerAttached: true });
        void get().refreshInstalled();
    },

    refreshInstalled: async () => {
        const api = getAPI();
        if (!api?.getInstalledPackages) {
            set({ installedPackages: [] });
            return;
        }
        try {
            const installed = await api.getInstalledPackages();
            set({ installedPackages: installed });
        } catch (error) {
            console.error('Failed to load installed packages', error);
            set({ installedPackages: [] });
        }
    },

    isInstalled: (slug, simulator) => {
        return get().installedPackages.some((entry) => entry.slug === slug && entry.simulator === simulator);
    },

    handleDownload: async (pkg, simulator) => {
        const api = getAPI();
        if (!api?.downloadPackage) {
            set({ error: 'Electron APIs are not available.' });
            return false;
        }

        const authToken = useAuthStore.getState().token ?? null;
        if (!authToken) {
            set({ error: 'Please sign in again to download packages.' });
            return false;
        }

        const targetSimulator = simulator === 'FS24' ? 'MSFS2024' : 'MSFS2020';

        set((state) => ({
            downloadStates: {
                ...state.downloadStates,
                [pkg.slug]: {
                    slug: pkg.slug,
                    title: pkg.title,
                    progress: 0,
                    downloaded: 0,
                    total: pkg.sizeBytes ?? 0,
                    extracting: false,
                    simulator
                }
            }
        }));

        try {
            const result = await api.downloadPackage(pkg.downloadEndpoint, pkg.slug, pkg.title, pkg.version ?? null, targetSimulator, authToken);
            if (!result.success) {
                if (result.error === 'Download cancelled by user') return false;
                throw new Error(result.error || 'Package download failed');
            }
            await get().refreshInstalled();
            return true;
        } catch (error) {
            console.error('Package download failed', error);
            set({ error: error instanceof Error ? error.message : 'Package download failed' });
            return false;
        } finally {
            set((state) => {
                const clone = { ...state.downloadStates };
                delete clone[pkg.slug];
                return { downloadStates: clone };
            });
        }
    },

    cancelDownload: async (slug) => {
        const api = getAPI();
        if (!api?.cancelPackageDownload) return;
        try {
            await api.cancelPackageDownload(slug);
        } catch (error) {
            console.error('Failed to cancel package download', error);
        } finally {
            set((state) => {
                const clone = { ...state.downloadStates };
                delete clone[slug];
                return { downloadStates: clone };
            });
        }
    },

    handleUninstall: async (slug, simulator) => {
        const api = getAPI();
        if (!api?.uninstallPackage) {
            set({ error: 'Electron APIs are not available.' });
            return false;
        }
        try {
            const result = await api.uninstallPackage(slug, simulator);
            if (!result.success) {
                throw new Error(result.error || 'Failed to uninstall package');
            }
            await get().refreshInstalled();
            return true;
        } catch (error) {
            console.error('Failed to uninstall package', error);
            set({ error: error instanceof Error ? error.message : 'Failed to uninstall package' });
            return false;
        }
    },

    clearError: () => set({ error: null })
}));
