import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PANEL_BASE_URL } from '@shared/constants';
import { useAuthStore } from '@/store/authStore';
import styles from './LoginPage.module.css';
import {useThemeStore} from "@/store/themeStore";

const buildPortalUrl = () => {
    const url = new URL(PANEL_BASE_URL);
    url.searchParams.set('client', 'bav-livery-manager');
    return url.toString();
};

export const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const status = useAuthStore((state) => state.status);
    const error = useAuthStore((state) => state.error);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const markAwaitingAuth = useAuthStore((state) => state.markAwaitingAuth);
    const setError = useAuthStore((state) => state.setError);
    const pendingLiveryRedirect = useAuthStore((state) => state.pendingLiveryRedirect);

    const [lastAttempt, setLastAttempt] = useState<number | null>(null);
    const fromPath = (location.state as { from?: string })?.from ?? '/search';

    const {currentTheme} = useThemeStore();

    useEffect(() => {
        if (isAuthenticated && !pendingLiveryRedirect) {
            navigate(fromPath, { replace: true });
        }
    }, [fromPath, isAuthenticated, navigate, pendingLiveryRedirect]);

    const openPortal = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.openPanelAuth) {
            setError('Unable to open secure browser login. Please reinstall the app.');
            return;
        }

        markAwaitingAuth();
        setError(null);
        await api.openPanelAuth(buildPortalUrl());
        setLastAttempt(Date.now());
    }, [markAwaitingAuth, setError]);

    // Auto-open on first mount if not already waiting
    useEffect(() => {
        if (status === 'idle' && !lastAttempt) {
            openPortal().catch((err) => {
                console.error('Failed to open panel auth flow', err);
            });
        }
    }, [openPortal, status, lastAttempt]);

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.titleGroup}>
                    <img style={currentTheme === "light" ? {filter: "invert()"} : {}} src="https://pub-505cce096f5e4523867626e0594f0337.r2.dev/InstallerLogo.png" alt="Livery Manager"/>
                    <h1>Authenticate via browser</h1>
                    <p>To use the manager you need to sign in with your BAV account.</p>
                </div>

                <div className={styles.notice}>
                    {status === 'awaiting-browser' ? (
                        <div className={styles.awaiting}>
                            <p><strong>Browser window opened.</strong></p>
                            <p>Please log in or confirm your session in the browser window.</p>
                            <p>Once verified, this app will unlock automatically.</p>
                        </div>
                    ) : (
                        <ol>
                            <li>We'll open a secure browser window.</li>
                            <li>Enter your BAW ID and password there.</li>
                            <li>The app will reopen automatically.</li>
                        </ol>
                    )}
                </div>

                {error && <p className={styles.error}>{error}</p>}

                <div className={styles.actions}>
                    <button
                        className={styles.button}
                        type="button"
                        onClick={() => openPortal()}
                    >
                        {status === 'awaiting-browser' ? 'Re-open login page' : 'Open login page'}
                    </button>
                </div>

                {lastAttempt && (
                    <p className={styles.helper}>
                        Waiting for token... (started {new Date(lastAttempt).toLocaleTimeString()})
                    </p>
                )}
            </div>
        </div>
    );
};
