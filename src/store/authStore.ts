import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthRole } from '@/types/auth';
import { PANEL_AUTH_ENDPOINT } from '@/config/auth';
import { panelFetch, unwrapData } from '@/api/panelClient';

export interface BrowserTokenPayload {
    token: string;
    session?: string | null;
    role?: string | null;
    bawId?: string | null;
    pilotId?: string | null;
    fullName?: string | null;
    rank?: string | null;
    totalTime?: string | null;
    totalFlights?: number | null;
    liveryId?: string | null;
}

interface AuthState {
    userId: string | null;
    pilotId: string | null;
    fullName: string | null;
    rank: string | null;
    totalTimeMins: number | null;
    totalFlights: number | null;
    role: AuthRole | null;
    token: string | null;
    status: 'restoring' | 'idle' | 'awaiting-browser' | 'verifying' | 'error';
    error: string | null;
    isAuthenticated: boolean;
    pendingLiveryRedirect: string | null;
    markAwaitingAuth: () => void;
    applyBrowserToken: (payload: BrowserTokenPayload) => void;
    /** Restores a persisted session from the main process on app launch. */
    restoreSession: () => Promise<void>;
    /** Applies a silently refreshed access token pushed by the main process. */
    applyRefreshedToken: (token: string) => void;
    /** The main process declared the session dead (refresh token rejected). */
    handleSessionExpired: () => void;
    verifySession: () => Promise<void>;
    setError: (message: string | null) => void;
    logout: () => void;
    clearPendingLiveryRedirect: () => void;
}

const mapRole = (role?: string | null): AuthRole | null => {
    if (role === 'pilot' || role === 'admin') {
        return role;
    }
    return null;
};

const clearedSession = {
    userId: null,
    pilotId: null,
    fullName: null,
    rank: null,
    totalTimeMins: null,
    totalFlights: null,
    role: null,
    token: null,
    isAuthenticated: false,
    pendingLiveryRedirect: null
} as const;

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            userId: null,
            pilotId: null,
            fullName: null,
            rank: null,
            totalTimeMins: null,
            totalFlights: null,
            role: null,
            token: null,
            // 'restoring' until the main process reports whether a stored
            // session could be refreshed — keeps the login page (and its
            // auto-opened browser window) from flashing on every launch.
            status: 'restoring',
            error: null,
            isAuthenticated: false,
            pendingLiveryRedirect: null,
            markAwaitingAuth: () =>
                set({
                    ...clearedSession,
                    status: 'awaiting-browser',
                    error: null
                }),
            applyBrowserToken: (payload) => {
                if (!payload?.token) {
                    set({ status: 'error', error: 'Missing authentication token.' });
                    return;
                }

                set({
                    token: payload.token,
                    role: mapRole(payload.role),
                    userId: payload.bawId ?? null,
                    pilotId: payload.pilotId ?? null,
                    fullName: payload.fullName ?? null,
                    rank: payload.rank ?? null,
                    totalTimeMins: (() => {
                        if (payload.totalTime === undefined || payload.totalTime === null) {
                            return null;
                        }
                        const numeric = Number(payload.totalTime);
                        return Number.isFinite(numeric) ? numeric : null;
                    })(),
                    totalFlights: typeof payload.totalFlights === 'number' ? payload.totalFlights : null,
                    status: 'idle',
                    error: null,
                    isAuthenticated: true,
                    pendingLiveryRedirect: payload.liveryId ?? null
                });
            },
            restoreSession: async () => {
                const api = typeof window === 'undefined' ? undefined : window.electronAPI;
                if (!api?.authGetSession) {
                    set({ status: 'idle' });
                    return;
                }

                try {
                    const session = await api.authGetSession();
                    // A deep-link sign-in may have completed while we waited;
                    // never wipe a session that arrived in the meantime.
                    if (session?.token) {
                        set({ token: session.token, isAuthenticated: true, status: 'idle', error: null });
                        void get().verifySession();
                    } else if (!get().isAuthenticated) {
                        set({ ...clearedSession, status: 'idle' });
                    } else if (get().status === 'restoring') {
                        set({ status: 'idle' });
                    }
                } catch (error) {
                    console.warn('Failed to restore session', error);
                    if (get().status === 'restoring') {
                        set({ status: 'idle' });
                    }
                }
            },
            applyRefreshedToken: (token) => {
                if (!token) return;
                set({ token, isAuthenticated: true });
            },
            handleSessionExpired: () => {
                set({
                    ...clearedSession,
                    status: 'idle',
                    error: 'Your session has expired. Please log in again.'
                });
            },
            clearPendingLiveryRedirect: () => set({ pendingLiveryRedirect: null }),
            verifySession: async () => {
                const { token, logout } = get();
                if (!token) return;

                set({ status: 'verifying' });

                try {
                    const response = await panelFetch(PANEL_AUTH_ENDPOINT);

                    if (response.status === 401 || response.status === 403) {
                        console.warn('Session expired or invalid, logging out.');
                        logout();
                        set({ error: 'Your session has expired. Please log in again.' });
                        return;
                    }

                    if (!response.ok) {
                        throw new Error(`Verification failed: ${response.status}`);
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const payload = unwrapData<Record<string, any>>(response.body) ?? {};
                    const user = payload.user ?? payload ?? {};
                    const firstName = user.firstName ?? '';
                    const lastName = user.lastName ?? '';
                    const composedFullName = `${firstName} ${lastName}`.trim();
                    const totalDutyMins = user?.stats?.totalDutyMins;

                    set((state) => ({
                        role: mapRole(user.role) ?? state.role,
                        userId: user.bawId ?? state.userId,
                        pilotId: user.id != null ? String(user.id) : state.pilotId,
                        fullName: composedFullName || state.fullName,
                        rank: user?.rank?.name ?? state.rank,
                        totalTimeMins: typeof totalDutyMins === 'number'
                            ? totalDutyMins
                            : state.totalTimeMins,
                        totalFlights: typeof user?.stats?.totalFlights === 'number'
                            ? user.stats.totalFlights
                            : state.totalFlights,
                        status: 'idle'
                    }));
                } catch (error) {
                    // Transient failure (offline, timeout): keep the session — the
                    // main process retries the refresh in the background and any
                    // real auth failure surfaces as a 401/403 or expiry event.
                    console.warn('Could not verify session (keeping current session):', error);
                    set({ status: 'idle' });
                }
            },
            setError: (message) => set({ error: message, status: message ? 'error' : 'idle' }),
            logout: () => {
                const api = typeof window === 'undefined' ? undefined : window.electronAPI;
                api?.authSignOut?.().catch((error) => console.warn('Failed to clear stored session', error));
                set({
                    ...clearedSession,
                    status: 'idle',
                    error: null
                });
            }
        }),
        {
            name: 'bav-auth-store',
            storage: createJSONStorage(() => localStorage),
            version: 1,
            // Tokens live in the OS secure store (main process) only — never in
            // localStorage. Only non-sensitive profile data persists here.
            partialize: (state) => ({
                userId: state.userId,
                pilotId: state.pilotId,
                fullName: state.fullName,
                rank: state.rank,
                totalTimeMins: state.totalTimeMins,
                totalFlights: state.totalFlights,
                role: state.role
            }),
            migrate: (persisted) => {
                // v0 persisted the raw token and auth flags; drop them.
                const state = (persisted ?? {}) as Partial<AuthState>;
                delete state.token;
                delete state.isAuthenticated;
                delete state.status;
                delete state.error;
                delete state.pendingLiveryRedirect;
                return state;
            }
        }
    )
);
