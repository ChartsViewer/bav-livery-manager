import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export const AuthTokenListener = () => {
    const applyBrowserToken = useAuthStore((state) => state.applyBrowserToken);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const pendingLiveryRedirect = useAuthStore((state) => state.pendingLiveryRedirect);
    const clearPendingLiveryRedirect = useAuthStore((state) => state.clearPendingLiveryRedirect);
    const navigate = useNavigate();

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

        return () => {
            api.onAuthToken?.(null);
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
