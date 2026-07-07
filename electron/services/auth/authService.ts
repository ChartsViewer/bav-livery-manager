import path from 'node:path';
import { app, safeStorage } from 'electron';
import { PANEL_BASE_URL } from '../../../shared/constants';
import { createAuthManager, type AuthManager, type SessionSnapshot } from './authManager';
import { createEncryptedFileTokenStore, createInMemoryTokenStore, type TokenStore } from './tokenStore';

export const PANEL_REFRESH_ENDPOINT = `${PANEL_BASE_URL}/api/v1/auth/refresh`;

let manager: AuthManager | null = null;

function createStore(): TokenStore {
    if (!safeStorage.isEncryptionAvailable()) {
        console.warn('OS-level encryption is unavailable; auth tokens will not persist across restarts.');
        return createInMemoryTokenStore();
    }
    return createEncryptedFileTokenStore({
        filePath: path.join(app.getPath('userData'), 'auth-tokens.bin'),
        encrypt: (plainText) => safeStorage.encryptString(plainText),
        decrypt: (encrypted) => safeStorage.decryptString(encrypted)
    });
}

export interface AuthServiceHooks {
    onAccessTokenRefreshed?: (session: SessionSnapshot) => void;
    onSessionExpired?: () => void;
}

/** Must be called once after app.whenReady() (safeStorage needs a ready app). */
export function initAuthService(hooks: AuthServiceHooks = {}): AuthManager {
    if (manager) {
        return manager;
    }
    manager = createAuthManager({
        store: createStore(),
        refreshUrl: PANEL_REFRESH_ENDPOINT,
        onAccessTokenRefreshed: hooks.onAccessTokenRefreshed,
        onSessionExpired: hooks.onSessionExpired
    });
    return manager;
}

export function getAuthManager(): AuthManager {
    if (!manager) {
        throw new Error('Auth service used before initAuthService().');
    }
    return manager;
}

export function tryGetAuthManager(): AuthManager | null {
    return manager;
}
