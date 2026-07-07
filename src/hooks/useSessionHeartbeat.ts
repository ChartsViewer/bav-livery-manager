import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PANEL_AUTH_ENDPOINT } from '@/config/auth';
import { useAuthStore } from '@/store/authStore';
import { panelFetch, createStatusError } from '@/api/panelClient';

const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export const useSessionHeartbeat = () => {
    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);
    const setError = useAuthStore((state) => state.setError);

    const query = useQuery({
        queryKey: ['session', 'heartbeat', token],
        enabled: Boolean(token),
        queryFn: async () => {
            if (!token) throw new Error('Missing auth token');
            const response = await panelFetch(PANEL_AUTH_ENDPOINT);

            if (response.status === 401 || response.status === 403) {
                throw createStatusError(response.status, 'Session expired');
            }

            if (!response.ok) {
                throw new Error(`Session check failed (${response.status})`);
            }

            return response.body;
        },
        refetchInterval: HEARTBEAT_INTERVAL_MS,
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000
    });

    useEffect(() => {
        if (!query.error) return;
        const status = (query.error as Error & { status?: number }).status;
        // Only an explicit auth rejection ends the session — the main process
        // has already tried a silent refresh by the time we see a 401/403.
        // Transient network errors must never sign the user out.
        if (status === 401 || status === 403) {
            console.warn('Session heartbeat unauthorized; logging out', query.error);
            logout();
            setError('Session expired. Please log in again.');
        } else {
            console.warn('Session heartbeat failed transiently; keeping session', query.error);
        }
    }, [logout, query.error, setError]);

    useEffect(() => {
        if (query.data) {
            setError(null);
        }
    }, [query.data, setError]);

    // Run an eager check as soon as a token arrives.
    useEffect(() => {
        if (token) {
            query.refetch().catch((err) => console.warn('Initial heartbeat failed', err));
        }
    }, [token, query]);

    return query;
};
