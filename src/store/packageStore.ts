import { useEffect } from 'react';
import { create } from 'zustand';
import type { Package, PackageDownloadState, PackageUpdate } from '@/types/package';
import type { Simulator } from '@/types/livery';
import { useAuthStore } from '@/store/authStore';
import type { InstalledPackageRecord } from '@/types/electron-api';
import { PACKAGE_UPDATES_URL } from '@shared/constants';
import { panelFetch } from '@/api/panelClient';

const getAPI = () => (typeof window === 'undefined' ? undefined : window.electronAPI);

interface PackageState {
    downloadStates: Record<string, PackageDownloadState>;
    installedPackages: InstalledPackageRecord[];
    availableUpdates: PackageUpdate[];
    checkingUpdates: boolean;
    lastUpdateCheck: number | null;
    error: string | null;
    listenerAttached: boolean;
    attachListener: () => void;
    refreshInstalled: () => Promise<void>;
    isInstalled: (slug: string, simulator: Simulator) => boolean;
    handleDownload: (pkg: Package, simulator: Simulator) => Promise<boolean>;
    cancelDownload: (slug: string) => Promise<void>;
    handleUninstall: (slug: string, simulator: Simulator) => Promise<boolean>;
    checkForUpdates: (catalog: Package[]) => Promise<void>;
    updatePackage: (update: PackageUpdate, catalog: Package[]) => Promise<boolean>;
    dismissUpdate: (slug: string, simulator?: string) => void;
    clearError: () => void;
}

export const usePackageStore = create<PackageState>((set, get) => ({
    downloadStates: {},
    installedPackages: [],
    availableUpdates: [],
    checkingUpdates: false,
    lastUpdateCheck: null,
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

    checkForUpdates: async (catalog: Package[]) => {
        const installed = get().installedPackages;
        if (installed.length === 0) {
            set({ availableUpdates: [] });
            return;
        }

        const slugToPackage = new Map<string, Package>();
        catalog.forEach((p) => slugToPackage.set(p.slug, p));

        const requests = installed
            .map((entry) => {
                const cat = slugToPackage.get(entry.slug);
                if (!cat) return null;
                return {
                    packageId: cat.id,
                    currentVersion: entry.version || '1.0.0'
                };
            })
            .filter((r): r is { packageId: string; currentVersion: string } => r !== null);

        if (requests.length === 0) {
            set({ availableUpdates: [], lastUpdateCheck: Date.now() });
            return;
        }

        set({ checkingUpdates: true });

        try {
            const response = await panelFetch(PACKAGE_UPDATES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packages: requests })
            });

            if (!response.ok) {
                throw new Error(`Package update check failed: ${response.status}`);
            }

            const body = response.body as {
                data?: { updates?: Array<{
                    packageId: string;
                    hasUpdate: boolean;
                    latestVersion?: string;
                    currentVersion: string;
                    changelog?: string | null;
                }> };
                updates?: Array<{
                    packageId: string;
                    hasUpdate: boolean;
                    latestVersion?: string;
                    currentVersion: string;
                    changelog?: string | null;
                }>;
            };
            const updatesList = body.data?.updates ?? body.updates ?? [];

            const idToPackage = new Map<string, Package>();
            catalog.forEach((p) => idToPackage.set(p.id, p));

            const updates: PackageUpdate[] = [];
            updatesList
                .filter((u) => u.hasUpdate)
                .forEach((u) => {
                    const cat = idToPackage.get(u.packageId);
                    if (!cat) return;
                    const matchingInstalls = installed.filter((e) => e.slug === cat.slug);
                    if (matchingInstalls.length === 0) {
                        updates.push({
                            packageId: u.packageId,
                            slug: cat.slug,
                            currentVersion: u.currentVersion,
                            latestVersion: u.latestVersion || 'unknown',
                            hasUpdate: true,
                            changelog: u.changelog,
                            packageTitle: cat.title
                        });
                    } else {
                        matchingInstalls.forEach((entry) => {
                            updates.push({
                                packageId: u.packageId,
                                slug: cat.slug,
                                currentVersion: u.currentVersion,
                                latestVersion: u.latestVersion || 'unknown',
                                hasUpdate: true,
                                changelog: u.changelog,
                                packageTitle: cat.title,
                                simulator: entry.simulator,
                                installPath: entry.installPath
                            });
                        });
                    }
                });

            set({ availableUpdates: updates, lastUpdateCheck: Date.now(), checkingUpdates: false });
        } catch (error) {
            console.error('Failed to check for package updates', error);
            set({ checkingUpdates: false });
        }
    },

    updatePackage: async (update: PackageUpdate, catalog: Package[]) => {
        const api = getAPI();
        if (!api?.uninstallPackage || !api?.downloadPackage) {
            set({ error: 'Electron APIs are not available.' });
            return false;
        }

        const pkg = catalog.find((p) => p.id === update.packageId || p.slug === update.slug);
        if (!pkg) {
            set({ error: 'Package not found in catalog' });
            return false;
        }
        if (!update.simulator) {
            set({ error: 'Missing simulator information for package update' });
            return false;
        }

        const simulator = update.simulator as Simulator;

        try {
            const result = await api.uninstallPackage(update.slug, simulator);
            if (!result?.success) {
                throw new Error(result?.error || 'Failed to uninstall old package version');
            }
            await get().refreshInstalled();
        } catch (error) {
            console.error('Failed to uninstall during package update', error);
            set({ error: error instanceof Error ? error.message : 'Failed to remove old package version' });
            return false;
        }

        const success = await get().handleDownload(pkg, simulator);
        if (success) {
            set((state) => ({
                availableUpdates: state.availableUpdates.filter(
                    (u) => !(u.packageId === update.packageId && u.simulator === update.simulator)
                )
            }));
            return true;
        }
        return false;
    },

    dismissUpdate: (slug: string, simulator?: string) => {
        set((state) => ({
            availableUpdates: state.availableUpdates.filter((u) => {
                if (u.slug !== slug) return true;
                if (simulator && u.simulator !== simulator) return true;
                return false;
            })
        }));
    },

    clearError: () => set({ error: null })
}));

const PACKAGE_UPDATE_CHECK_THROTTLE_MS = 5 * 60 * 1000;

export const useInitializePackageStore = (packagesCatalog: Package[] | undefined) => {
    const installedCount = usePackageStore((state) => state.installedPackages.length);
    const lastUpdateCheck = usePackageStore((state) => state.lastUpdateCheck);

    useEffect(() => {
        const store = usePackageStore.getState();
        store.attachListener();
        void store.refreshInstalled();
    }, []);

    useEffect(() => {
        if (!packagesCatalog || packagesCatalog.length === 0) return;
        if (installedCount === 0) return;
        const now = Date.now();
        if (lastUpdateCheck && now - lastUpdateCheck < PACKAGE_UPDATE_CHECK_THROTTLE_MS) return;
        usePackageStore.getState().checkForUpdates(packagesCatalog).catch((error) =>
            console.error('Failed to auto-check for package updates', error)
        );
    }, [packagesCatalog, installedCount, lastUpdateCheck]);
};
