import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthRole } from '@/types/auth';
import { PANEL_AUTH_ENDPOINT } from '@/config/auth';

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
    status: 'idle' | 'awaiting-browser' | 'verifying' | 'error';
    error: string | null;
    isAuthenticated: boolean;
    markAwaitingAuth: () => void;
    applyBrowserToken: (payload: BrowserTokenPayload) => void;
    verifySession: () => Promise<void>;
    setError: (message: string | null) => void;
    logout: () => void;
}

const mapRole = (role?: string | null): AuthRole | null => {
    if (role === 'pilot' || role === 'admin') {
        return role;
    }
    return null;
};

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
            status: 'idle',
            error: null,
            isAuthenticated: false,
            markAwaitingAuth: () =>
                set({
                    status: 'awaiting-browser',
                    error: null,
                    isAuthenticated: false,
                    token: null,
                    role: null,
                    userId: null,
                    pilotId: null,
                    fullName: null,
                    rank: null,
                    totalTimeMins: null,
                    totalFlights: null
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
                    isAuthenticated: true
                });
            },
            verifySession: async () => {
                const { token, logout } = get();
                if (!token) return;

                set({ status: 'verifying' });

                try {
                    const response = await fetch(PANEL_AUTH_ENDPOINT, {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });

                    if (response.status === 401 || response.status === 403) {
                        console.warn('Session expired or invalid, logging out.');
                        logout();
                        set({ error: 'Your session has expired. Please log in again.' });
                        return;
                    }

                    if (!response.ok) {
                        throw new Error(`Verification failed: ${response.status}`);
                    }

                    const body = await response.json();
                    const payload = body?.data ?? body;
                    const user = payload?.user ?? payload ?? {};
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
                    console.error('Failed to verify session:', error);
                    // Strict enforcement: if we can't verify, we assume invalid.
                    logout();
                    set({ error: 'Unable to verify session. Please log in again.' });
                }
            },
            setError: (message) => set({ error: message, status: message ? 'error' : 'idle' }),
            logout: () =>
                set({
                    userId: null,
                    pilotId: null,
                    fullName: null,
                    rank: null,
                    totalTimeMins: null,
                    totalFlights: null,
                    role: null,
                    token: null,
                    status: 'idle',
                    error: null,
                    isAuthenticated: false
                })
        }),
        {
            name: 'bav-auth-store',
            storage: createJSONStorage(() => localStorage)
        }
    )
);
