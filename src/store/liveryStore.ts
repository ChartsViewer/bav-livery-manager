import { useEffect } from 'react';
import { create } from 'zustand';
import type {
    DownloadProgress,
    InstalledLiveryRecord,
    Livery,
    LiveryUpdate,
    Resolution,
    Settings,
    Simulator
} from '@/types/livery';
import { useAuthStore } from '@/store/authStore';
import { buildDownloadRequestUrl, deriveInstallFolderName, joinPaths, normalizeRemoteLivery } from '@/utils/livery';
import { REMOTE_LIVERY_LIST_URL, LIVERY_UPDATES_URL } from '@shared/constants';

const DEFAULT_SETTINGS: Settings = {
    msfs2020Path: '',
    msfs2024Path: '',
    defaultResolution: '4K',
    defaultSimulator: 'FS20'
};

const getAPI = () => (typeof window === 'undefined' ? undefined : window.electronAPI);

interface LiveryState {
    liveries: Livery[];
    installedLiveries: InstalledLiveryRecord[];
    availableUpdates: LiveryUpdate[];
    settings: Settings;
    downloadStates: Record<string, DownloadProgress>;
    loading: boolean;
    error: string | null;
    initialized: boolean;
    downloadListenerAttached: boolean;
    checkingUpdates: boolean;
    lastUpdateCheck: number | null;
    initialize: () => Promise<void>;
    attachDownloadListener: () => void;
    loadSettings: () => Promise<void>;
    refreshLiveries: () => Promise<void>;
    refreshInstalled: () => Promise<void>;
    checkForUpdates: () => Promise<void>;
    updateLivery: (update: LiveryUpdate) => Promise<boolean>;
    dismissUpdate: (liveryId: string) => void;
    updateSettings: (partial: Partial<Settings>) => Promise<void>;
    handleDownload: (livery: Livery, resolution: Resolution, simulator: Simulator) => Promise<boolean>;
    cancelDownload: (liveryId: string, liveryName: string) => Promise<void>;
    handleUninstall: (livery: Livery, resolution: Resolution, simulator: Simulator) => Promise<boolean>;
    uninstallByPath: (installPath: string) => Promise<boolean>;
    uninstallEntry: (entry: InstalledLiveryRecord) => Promise<boolean>;
    isVariantInstalled: (livery: Livery, resolution: Resolution, simulator: Simulator) => boolean;
    clearError: () => void;
}

export const useLiveryStore = create<LiveryState>((set, get) => {
    const matchInstalledEntry = (livery: Livery, resolution: Resolution, simulator: Simulator) => {
        const installed = get().installedLiveries;

        return installed.find((entry) => {
            // Match by liveryId (preferred) or fall back to originalName for older records
            const idMatch = entry.liveryId === livery.id;
            const nameMatch = entry.originalName === livery.name;
            return (
                (idMatch || nameMatch) &&
                entry.resolution === resolution &&
                entry.simulator === simulator
            );
        });
    };

    const hasHighResolutionConflict = (livery: Livery, resolution: Resolution, simulator: Simulator) => {
        const installed = get().installedLiveries;
        const conflictingResolution: Resolution = resolution === '4K' ? '8K' : '4K';

        return installed.some((entry) => {
            const idMatch = entry.liveryId === livery.id;
            const nameMatch = entry.originalName === livery.name;
            return (
                (idMatch || nameMatch) &&
                entry.simulator === simulator &&
                entry.resolution === conflictingResolution
            );
        });
    };

    return ({
        liveries: [],
        installedLiveries: [],
        availableUpdates: [],
        settings: DEFAULT_SETTINGS,
        downloadStates: {},
        loading: false,
        error: null,
        initialized: false,
        downloadListenerAttached: false,
        checkingUpdates: false,
        lastUpdateCheck: null,

        initialize: async () => {
            if (get().initialized) return;
            await get().loadSettings();
            // Remote liveries are now fetched via TanStack Query hook (useLiveriesQuery) once a token exists.
            await get().refreshInstalled();
            get().attachDownloadListener();
            set({ initialized: true });
        },

        attachDownloadListener: () => {
            if (get().downloadListenerAttached) return;
            const api = getAPI();
            if (!api?.onDownloadProgress) return;

            api.onDownloadProgress((payload) => {
                const existing = get().downloadStates[payload.liveryName];
                if (!existing) return;

                // Skip redundant updates where nothing meaningful changed
                if (existing.progress === payload.progress && existing.extracting === payload.extracting) return;

                const newStates = {
                    ...get().downloadStates,
                    [payload.liveryName]: {
                        ...existing,
                        progress: payload.progress,
                        downloaded: payload.downloaded,
                        total: payload.total,
                        extracting: payload.extracting
                    }
                };

                set({ downloadStates: newStates });

                // Update taskbar progress and window title based on active downloads
                const activeDownloads = Object.values(newStates);
                if (activeDownloads.length > 0) {
                    // Calculate average progress across all active downloads
                    const totalProgress = activeDownloads.reduce((sum, state) => sum + state.progress, 0);
                    const avgProgress = totalProgress / activeDownloads.length;
                    
                    // Show indeterminate if any download is extracting
                    const anyExtracting = activeDownloads.some(state => state.extracting);
                    
                    if (anyExtracting) {
                        api.setTaskbarProgress?.(100, 'indeterminate');
                        api.setWindowTitle?.(`Extracting ${payload.liveryName}... - BAVirtual Livery Manager`);
                    } else {
                        api.setTaskbarProgress?.(avgProgress, 'normal');
                        const count = activeDownloads.length;
                        const title = count === 1 
                            ? `Downloading ${payload.liveryName} (${Math.round(avgProgress)}%) - BAVirtual Livery Manager`
                            : `Downloading ${count} liveries (${Math.round(avgProgress)}%) - BAVirtual Livery Manager`;
                        api.setWindowTitle?.(title);
                    }
                } else {
                    // Clear taskbar progress and reset title when no downloads
                    api.setTaskbarProgress?.(-1);
                    api.setWindowTitle?.('BAVirtual Livery Manager');
                }
            });

            set({ downloadListenerAttached: true });
        },

        loadSettings: async () => {
            const api = getAPI();
            if (!api?.getSettings) return;
            try {
                const persisted = await api.getSettings();
                set({ settings: { ...DEFAULT_SETTINGS, ...persisted } });
            } catch (error) {
                console.error('Failed to load settings', error);
                set({ settings: DEFAULT_SETTINGS });
            }
        },

        refreshLiveries: async () => {
            const authToken = useAuthStore.getState().token ?? null;
            if (!authToken) {
                set({ loading: false, liveries: [], error: 'Please sign in to load liveries.' });
                return;
            }

            set({ loading: true, error: null });
            const api = getAPI();

            try {
                if (api?.fetchLiveries) {
                    const payload = await api.fetchLiveries(authToken);
                    const normalized = (payload?.liveries ?? []).map((entry) => normalizeRemoteLivery(entry as unknown as Record<string, unknown>));
                    set({ liveries: normalized });
                } else {
                    const response = await fetch(REMOTE_LIVERY_LIST_URL, {
                        headers: { Authorization: `Bearer ${authToken}` }
                    });
                    if (!response.ok) {
                        const error: Error & { status?: number } = new Error(`Remote list request failed with status ${response.status}`);
                        error.status = response.status;
                        throw error;
                    }
                    const body = await response.json();
                    const payload = body?.data ?? body;
                    const normalized = (payload?.liveries ?? []).map((entry: Record<string, unknown>) => normalizeRemoteLivery(entry));
                    set({ liveries: normalized });
                }
            } catch (error) {
                const status = (error as Error & { status?: number }).status;
                if (status === 401 || status === 403) {
                    console.warn('Livery fetch unauthorized; clearing session.');
                    useAuthStore.getState().logout();
                    set({ liveries: [], error: 'Session expired. Please sign in again.' });
                } else {
                    console.error('Failed to load liveries', error);
                    set({ liveries: [], error: 'Unable to load liveries. Please check your connection.' });
                }
            } finally {
                set({ loading: false });
            }
        },

        refreshInstalled: async () => {
            const api = getAPI();
            if (!api?.getInstalledLiveries) {
                set({ installedLiveries: [] });
                return;
            }

            try {
                const entries = await api.getInstalledLiveries();
                set({ installedLiveries: entries });
                
                // Auto-check for updates after refreshing installed liveries
                const lastCheck = get().lastUpdateCheck;
                const now = Date.now();
                const fiveMinutes = 5 * 60 * 1000;
                
                if (!lastCheck || now - lastCheck > fiveMinutes) {
                    get().checkForUpdates().catch((error) => 
                        console.error('Failed to auto-check for updates', error)
                    );
                }
            } catch (error) {
                console.error('Failed to refresh installed liveries', error);
                set({ installedLiveries: [] });
            }
        },

        checkForUpdates: async () => {
            const api = getAPI();
            if (!api?.getLocalVersion) {
                console.warn('Version management not available');
                return;
            }

            const { installedLiveries, liveries } = get();
            
            if (installedLiveries.length === 0) {
                set({ availableUpdates: [], lastUpdateCheck: Date.now() });
                return;
            }

            set({ checkingUpdates: true });

            try {
                // Build update check request
                const updateRequests = await Promise.all(
                    installedLiveries.map(async (entry) => {
                        const version = await api.getLocalVersion(entry.liveryId);
                        return {
                            liveryId: entry.liveryId,
                            currentVersion: version || entry.version || '1.0.0',
                        };
                    })
                );

                // Call API to check for updates
                const authToken = useAuthStore.getState().token;
                const headers: HeadersInit = {
                    'Content-Type': 'application/json',
                };
                
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }

                const response = await fetch(LIVERY_UPDATES_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ liveries: updateRequests }),
                });

                if (!response.ok) {
                    throw new Error(`Update check failed: ${response.statusText}`);
                }

                const body = await response.json() as {
                    data?: { updates: Array<{
                        liveryId: string;
                        hasUpdate: boolean;
                        latestVersion?: string;
                        currentVersion: string;
                        changelog?: string | null;
                    }> };
                    updates?: Array<{
                        liveryId: string;
                        hasUpdate: boolean;
                        latestVersion?: string;
                        currentVersion: string;
                        changelog?: string | null;
                    }>;
                };
                const data = body.data ?? { updates: body.updates ?? [] };

                // Map updates to installed liveries — one entry per (liveryId, simulator) pair
                // so that liveries installed for both FS20 and FS24 both receive updates.
                const updates: LiveryUpdate[] = [];
                data.updates
                    .filter((u) => u.hasUpdate)
                    .forEach((u) => {
                        const matchingInstalls = installedLiveries.filter((e) => e.liveryId === u.liveryId);
                        const livery = liveries.find((l) => l.id === u.liveryId);

                        if (matchingInstalls.length === 0) {
                            updates.push({
                                liveryId: u.liveryId,
                                currentVersion: u.currentVersion,
                                latestVersion: u.latestVersion || 'unknown',
                                hasUpdate: true,
                                changelog: u.changelog,
                                liveryName: livery?.name || 'Unknown',
                            });
                        } else {
                            matchingInstalls.forEach((installed) => {
                                updates.push({
                                    liveryId: u.liveryId,
                                    currentVersion: u.currentVersion,
                                    latestVersion: u.latestVersion || 'unknown',
                                    hasUpdate: true,
                                    changelog: u.changelog,
                                    liveryName: installed.originalName || livery?.name || 'Unknown',
                                    installPath: installed.installPath,
                                    resolution: installed.resolution,
                                    simulator: installed.simulator,
                                });
                            });
                        }
                    });

                set({ 
                    availableUpdates: updates, 
                    lastUpdateCheck: Date.now(),
                    checkingUpdates: false 
                });
            } catch (error) {
                console.error('Failed to check for updates', error);
                set({ checkingUpdates: false });
            }
        },

        updateLivery: async (update: LiveryUpdate) => {
            const api = getAPI();
            const { liveries } = get();
            
            const livery = liveries.find((l) => l.id === update.liveryId);
            if (!livery) {
                set({ error: 'Livery not found in catalog' });
                return false;
            }

            if (!update.resolution || !update.simulator) {
                set({ error: 'Missing resolution or simulator information' });
                return false;
            }

            const resolution = update.resolution as Resolution;
            const simulator = update.simulator as Simulator;

            // Uninstall old version
            if (update.installPath) {
                try {
                    const uninstallResult = await api?.uninstallLivery?.(update.installPath);
                    if (!uninstallResult?.success) {
                        throw new Error('Failed to uninstall old version');
                    }
                } catch (error) {
                    console.error('Failed to uninstall during update', error);
                    set({ error: 'Failed to remove old version' });
                    return false;
                }
            }

            // Download new version
            const downloadSuccess = await get().handleDownload(livery, resolution, simulator);
            
            if (downloadSuccess) {
                // Remove this update from the list
                set((state) => ({
                    availableUpdates: state.availableUpdates.filter((u) => u.liveryId !== update.liveryId)
                }));
                return true;
            }

            return false;
        },

        dismissUpdate: (liveryId: string) => {
            set((state) => ({
                availableUpdates: state.availableUpdates.filter((u) => u.liveryId !== liveryId)
            }));
        },

        updateSettings: async (partial: Partial<Settings>) => {
            const api = getAPI();
            const next = { ...get().settings, ...partial };
            set({ settings: next });
            try {
                await api?.saveSettings?.(next);
                await get().refreshInstalled();
            } catch (error) {
                console.error('Failed to save settings', error);
                set({ error: 'Unable to save settings.' });
            }
        },

        handleDownload: async (livery: Livery, resolution: Resolution, simulator: Simulator) => {
            const api = getAPI();
            if (!api?.downloadLivery) {
                set({ error: 'Electron APIs are not available.' });
                return false;
            }

            if (hasHighResolutionConflict(livery, resolution, simulator)) {
                set({ error: 'Please uninstall the other high-resolution variant (4K or 8K) before installing this one.' });
                return false;
            }

            const downloadRequestUrl = buildDownloadRequestUrl(livery, resolution, simulator);
            const authToken = useAuthStore.getState().token ?? null;
            if (!authToken) {
                set({ error: 'Please sign in again to download liveries.' });
                return false;
            }
            const targetSimulator = simulator === 'FS24' ? 'MSFS2024' : 'MSFS2020';

            set((state) => ({
                downloadStates: {
                    ...state.downloadStates,
                    [livery.name]: {
                        progress: 0,
                        downloaded: 0,
                        total: 0,
                        extracting: false,
                        registration: livery.registration ?? undefined,
                        aircraft: livery.aircraftProfileName ?? livery.aircraft ?? undefined,
                        resolution,
                        simulator
                    }
                }
            }));

            try {
                const result = await api.downloadLivery(downloadRequestUrl, livery.id, livery.name, livery.developerName, livery.aircraftProfileName, targetSimulator, resolution, authToken);
                if (!result.success) {
                    if (result.error === 'Download cancelled by user') {
                        return false;
                    }
                    throw new Error(result.error || 'Download failed');
                }

                await api.setLocalVersion?.(livery.id, livery.version ?? '1.0.0');
                await get().refreshInstalled();
                return true;
            } catch (error) {
                console.error('Download failed', error);
                set({ error: error instanceof Error ? error.message : 'Download failed' });
                
                // Set taskbar to error state briefly
                api.setTaskbarProgress?.(100, 'error');
                setTimeout(() => {
                    api.setTaskbarProgress?.(-1);
                }, 2000);
                
                return false;
            } finally {
                set((state) => {
                    const clone = { ...state.downloadStates };
                    delete clone[livery.name];
                    
                    // Clear taskbar progress and reset title if no more downloads
                    if (Object.keys(clone).length === 0) {
                        api.setTaskbarProgress?.(-1);
                        api.setWindowTitle?.('BAVirtual Livery Manager');
                    }
                    
                    return { downloadStates: clone };
                });
            }
        },

        cancelDownload: async (liveryId: string, liveryName: string) => {
            const api = getAPI();
            if (!api?.cancelDownload) return;

            try {
                await api.cancelDownload(liveryId);
            } catch (error) {
                console.error('Failed to cancel download', error);
            } finally {
                set((state) => {
                    const newStates = { ...state.downloadStates };
                    delete newStates[liveryName];
                    
                    if (Object.keys(newStates).length === 0) {
                        api?.setTaskbarProgress?.(-1);
                        api?.setWindowTitle?.('BAVirtual Livery Manager');
                    }
                    
                    return { downloadStates: newStates };
                });
            }
        },

        handleUninstall: async (livery: Livery, resolution: Resolution, simulator: Simulator) => {
            const api = getAPI();
            if (!api?.uninstallLivery) {
                set({ error: 'Electron APIs are not available.' });
                return false;
            }

            const basePath = simulator === 'FS24' ? get().settings.msfs2024Path : get().settings.msfs2020Path;
            if (!basePath) {
                set({ error: `No ${simulator === 'FS24' ? 'MSFS 2024' : 'MSFS 2020'} path configured.` });
                return false;
            }

            const installedMatch = matchInstalledEntry(livery, resolution, simulator);
            const installPath = installedMatch?.installPath ?? joinPaths(basePath, deriveInstallFolderName(livery));

            try {
                const result = await api.uninstallLivery(installPath);
                if (!result.success) {
                    throw new Error(result.error || 'Uninstall failed');
                }
                await get().refreshInstalled();
                return true;
            } catch (error) {
                console.error('Uninstall failed', error);
                set({ error: error instanceof Error ? error.message : 'Unable to uninstall livery.' });
                return false;
            }
        },

        uninstallEntry: async (entry: InstalledLiveryRecord) => {
            const api = getAPI();
            if (!api?.uninstallLivery) {
                set({ error: 'Electron APIs are not available.' });
                return false;
            }

            try {
                const result = await api.uninstallLivery(entry.installPath);
                if (!result.success) {
                    throw new Error(result.error || 'Uninstall failed');
                }
                await get().refreshInstalled();
                return true;
            } catch (error) {
                console.error('Uninstall failed', error);
                set({ error: error instanceof Error ? error.message : 'Unable to uninstall livery.' });
                return false;
            }
        },

        uninstallByPath: async (installPath: string) => {
            const api = getAPI();
            if (!api?.uninstallLivery) {
                set({ error: 'Electron APIs are not available.' });
                return false;
            }

            try {
                const result = await api.uninstallLivery(installPath);
                if (!result.success) {
                    throw new Error(result.error || 'Uninstall failed');
                }
                await get().refreshInstalled();
                return true;
            } catch (error) {
                console.error('Uninstall failed', error);
                set({ error: error instanceof Error ? error.message : 'Unable to uninstall livery.' });
                return false;
            }
        },

        isVariantInstalled: (livery: Livery, resolution: Resolution, simulator: Simulator) => {
            return Boolean(matchInstalledEntry(livery, resolution, simulator));
        },

        clearError: () => {
            set({ error: null });
        }
    });
});

export const useInitializeLiveryStore = () => {
    const initialized = useLiveryStore((state) => state.initialized);
    const token = useAuthStore((state) => state.token);
    useEffect(() => {
        if (!initialized) {
            useLiveryStore.getState().initialize().catch((error) => {
                console.error('Failed to initialize livery store', error);
            });
        }
    }, [initialized]);

    // When a fresh auth token arrives (after login), fetch liveries with proper authorization.
    useEffect(() => {
        if (initialized && token) {
            useLiveryStore
                .getState()
                .refreshLiveries()
                .catch((error) => console.error('Failed to refresh liveries after login', error));
        }
    }, [initialized, token]);
};
