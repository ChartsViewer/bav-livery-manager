import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export const AuthTokenListener = () => {
    const applyBrowserToken = useAuthStore((state) => state.applyBrowserToken);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const pendingLiveryRedirect = useAuthStore((state) => state.pendingLiveryRedirect);
    const clearPendingLiveryRedirect = useAuthStore((state) => state.clearPendingLiveryRedirect);
    const navigate = useNavigate();

    // Restore a persisted session from the main process on launch (silent
    // refresh happens there before this resolves).
    useEffect(() => {
        useAuthStore.getState().restoreSession().catch((error) => {
            console.warn('Session restore failed', error);
        });
    }, []);

    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onAuthToken) {
            return;
        }

        api.onAuthToken((payload) => {
            if (payload?.token) {
                applyBrowserToken(payload);
            }
        });

        api.onAuthTokenRefreshed?.((session) => {
            if (session?.token) {
                useAuthStore.getState().applyRefreshedToken(session.token);
            }
        });

        api.onAuthSessionExpired?.(() => {
            useAuthStore.getState().handleSessionExpired();
        });

        return () => {
            api.onAuthToken?.(null);
            api.onAuthTokenRefreshed?.(null);
            api.onAuthSessionExpired?.(null);
        };
    }, [applyBrowserToken]);

    useEffect(() => {
        if (isAuthenticated && pendingLiveryRedirect) {
            navigate(`/information/${pendingLiveryRedirect}`, { replace: true });
            clearPendingLiveryRedirect();
        }
    }, [isAuthenticated, pendingLiveryRedirect, navigate, clearPendingLiveryRedirect]);

    return null;
};
