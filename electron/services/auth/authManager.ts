import { DEFAULT_FETCH_TIMEOUT_MS } from '../../../shared/constants';
import type { PersistedTokens, TokenStore } from './tokenStore';
import { extractCookie, getSetCookieHeaders } from './setCookie';

const REFRESH_COOKIE_NAME = 'bav_refresh';
/** Refresh this long before the access token actually expires. */
const PROACTIVE_REFRESH_LEAD_MS = 60_000;
/** Treat tokens expiring within this window as already expired. */
const EXPIRY_SKEW_MS = 15_000;
const DEFAULT_ACCESS_TOKEN_TTL_SEC = 900;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export interface SessionSnapshot {
    token: string;
    expiresAt: number;
}

export interface AuthManagerDeps {
    store: TokenStore;
    refreshUrl: string;
    fetchFn?: typeof fetch;
    now?: () => number;
    setTimer?: (callback: () => void, delayMs: number) => unknown;
    clearTimer?: (handle: unknown) => void;
    timeoutMs?: number;
    /** Fired whenever a new access token becomes available (refresh or new sign-in). */
    onAccessTokenRefreshed?: (session: SessionSnapshot) => void;
    /** Fired when the session is irrecoverably dead and interactive sign-in is required. */
    onSessionExpired?: () => void;
}

export type RefreshResult =
    | { ok: true; token: string }
    | { ok: false; fatal: boolean };

export interface AuthManager {
    /** Loads persisted tokens and, if a refresh token exists, refreshes once. */
    initialize: () => Promise<SessionSnapshot | null>;
    /** Installs a session delivered by the deep-link sign-in flow. */
    setSession: (input: { accessToken: string; refreshToken?: string | null; expiresInSec?: number | null }) => Promise<void>;
    getSessionSnapshot: () => SessionSnapshot | null;
    /** Returns a non-expired access token, refreshing first if needed. */
    getValidAccessToken: () => Promise<string | null>;
    /**
     * The single authenticated-HTTP interceptor: attaches the bearer token,
     * and on a 401 refreshes once and retries the request exactly once.
     */
    authorizedFetch: (url: string, init?: RequestInit, timeoutMs?: number) => Promise<Response>;
    /** Clears tokens everywhere without emitting session-expired (explicit logout). */
    signOut: () => Promise<void>;
    dispose: () => void;
}

interface RefreshResponseBody {
    status?: string;
    payload?: {
        token?: string;
        expiresIn?: number;
    };
}

export function createAuthManager(deps: AuthManagerDeps): AuthManager {
    const {
        store,
        refreshUrl,
        fetchFn = fetch,
        now = Date.now,
        setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
        clearTimer = (handle) => clearTimeout(handle as NodeJS.Timeout),
        timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
        onAccessTokenRefreshed,
        onSessionExpired
    } = deps;

    let tokens: PersistedTokens | null = null;
    let refreshPromise: Promise<RefreshResult> | null = null;
    let initializePromise: Promise<SessionSnapshot | null> | null = null;
    let proactiveTimer: unknown = null;
    let backoffTimer: unknown = null;
    let backoffAttempts = 0;
    let disposed = false;

    const cancelTimers = () => {
        if (proactiveTimer !== null) {
            clearTimer(proactiveTimer);
            proactiveTimer = null;
        }
        if (backoffTimer !== null) {
            clearTimer(backoffTimer);
            backoffTimer = null;
        }
    };

    const snapshot = (): SessionSnapshot | null => {
        if (!tokens) return null;
        return { token: tokens.accessToken, expiresAt: tokens.accessTokenExpiresAt };
    };

    const isAccessTokenValid = () =>
        tokens !== null && tokens.accessTokenExpiresAt - now() > EXPIRY_SKEW_MS;

    const scheduleProactiveRefresh = () => {
        if (proactiveTimer !== null) {
            clearTimer(proactiveTimer);
            proactiveTimer = null;
        }
        if (!tokens?.refreshToken || disposed) return;
        const delay = Math.max(tokens.accessTokenExpiresAt - now() - PROACTIVE_REFRESH_LEAD_MS, 5_000);
        proactiveTimer = setTimer(() => {
            proactiveTimer = null;
            void refresh();
        }, delay);
    };

    const scheduleBackoffRetry = () => {
        if (backoffTimer !== null || disposed || !tokens?.refreshToken) return;
        backoffAttempts += 1;
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** (backoffAttempts - 1), BACKOFF_MAX_MS);
        console.warn(`Token refresh failed transiently; retrying in ${Math.round(delay / 1000)}s.`);
        backoffTimer = setTimer(() => {
            backoffTimer = null;
            void refresh();
        }, delay);
    };

    const persist = async () => {
        if (!tokens) return;
        try {
            await store.save(tokens);
        } catch (error) {
            // Persistence failure must not break the in-memory session.
            console.error('Failed to persist auth tokens:', (error as Error).message);
        }
    };

    const expireSession = async () => {
        tokens = null;
        cancelTimers();
        backoffAttempts = 0;
        await store.clear();
        onSessionExpired?.();
    };

    const doRefresh = async (): Promise<RefreshResult> => {
        const sessionAtStart = tokens;
        const refreshToken = tokens?.refreshToken;
        if (!refreshToken) {
            return { ok: false, fatal: true };
        }

        // The session we refreshed for may be signed out or replaced by a new
        // deep-link sign-in while the request is in flight; its outcome must
        // then be discarded instead of resurrecting/killing the wrong session.
        const superseded = () => tokens !== sessionAtStart;

        if (tokens?.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt <= now()) {
            console.warn('Refresh token expired; interactive sign-in required.');
            await expireSession();
            return { ok: false, fatal: true };
        }

        let response: Response;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(new Error('Timeout')), timeoutMs);
            try {
                // Native-client refresh: the refresh token travels as a cookie and
                // no Origin header may be sent (main-process fetch adds none).
                response = await fetchFn(refreshUrl, {
                    method: 'POST',
                    headers: {
                        Cookie: `${REFRESH_COOKIE_NAME}=${refreshToken}`,
                        Accept: 'application/json'
                    },
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }
        } catch (error) {
            console.warn('Token refresh request failed:', (error as Error).message);
            if (!superseded()) {
                scheduleBackoffRetry();
            }
            return { ok: false, fatal: false };
        }

        if (superseded()) {
            return { ok: false, fatal: false };
        }

        if (response.status === 401) {
            console.warn('Refresh token rejected (expired/revoked/reused); signing out.');
            await expireSession();
            return { ok: false, fatal: true };
        }

        if (!response.ok) {
            console.warn(`Token refresh failed with status ${response.status}; keeping current session.`);
            scheduleBackoffRetry();
            return { ok: false, fatal: false };
        }

        let body: RefreshResponseBody;
        try {
            body = (await response.json()) as RefreshResponseBody;
        } catch (error) {
            console.warn('Token refresh returned an unreadable body; keeping current session.');
            scheduleBackoffRetry();
            return { ok: false, fatal: false };
        }

        const newAccessToken = body?.payload?.token;
        if (!newAccessToken) {
            console.warn('Token refresh response did not include a token; keeping current session.');
            scheduleBackoffRetry();
            return { ok: false, fatal: false };
        }

        const expiresInSec = typeof body?.payload?.expiresIn === 'number' && body.payload.expiresIn > 0
            ? body.payload.expiresIn
            : DEFAULT_ACCESS_TOKEN_TTL_SEC;

        // The refresh token is rotated on every use; the replacement arrives via
        // Set-Cookie and MUST replace the (now spent) previous one.
        const rotated = extractCookie(getSetCookieHeaders(response.headers), REFRESH_COOKIE_NAME, now());
        if (!rotated) {
            console.warn('Token refresh response did not include a rotated refresh cookie; keeping the previous one.');
        }

        if (superseded()) {
            return { ok: false, fatal: false };
        }

        tokens = {
            accessToken: newAccessToken,
            accessTokenExpiresAt: now() + expiresInSec * 1000,
            refreshToken: rotated?.value ?? refreshToken,
            refreshTokenExpiresAt: rotated ? rotated.expiresAt : tokens?.refreshTokenExpiresAt ?? null
        };
        backoffAttempts = 0;
        if (backoffTimer !== null) {
            clearTimer(backoffTimer);
            backoffTimer = null;
        }
        await persist();
        scheduleProactiveRefresh();
        onAccessTokenRefreshed?.({ token: newAccessToken, expiresAt: tokens.accessTokenExpiresAt });
        return { ok: true, token: newAccessToken };
    };

    /** Single-flight: concurrent callers share one in-flight refresh request. */
    const refresh = (): Promise<RefreshResult> => {
        if (!refreshPromise) {
            refreshPromise = doRefresh()
                .catch((error): RefreshResult => {
                    console.error('Unexpected token refresh error:', (error as Error).message);
                    scheduleBackoffRetry();
                    return { ok: false, fatal: false };
                })
                .finally(() => {
                    refreshPromise = null;
                });
        }
        return refreshPromise;
    };

    const getValidAccessToken = async (): Promise<string | null> => {
        if (isAccessTokenValid()) {
            return tokens!.accessToken;
        }
        if (!tokens?.refreshToken) {
            return null;
        }
        const result = await refresh();
        if (result.ok) {
            return result.token;
        }
        // Transient failure: fall back to the (possibly stale) token so the
        // request itself decides — a 401 there re-enters the refresh path.
        return result.fatal ? null : tokens?.accessToken ?? null;
    };

    const withAuthHeader = (init: RequestInit, token: string | null): RequestInit => {
        const headers = new Headers(init.headers);
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        } else {
            headers.delete('Authorization');
        }
        return { ...init, headers };
    };

    const timedFetch = async (url: string, init: RequestInit, requestTimeoutMs: number): Promise<Response> => {
        const controller = new AbortController();
        const externalSignal = init.signal;
        if (externalSignal) {
            if (externalSignal.aborted) {
                controller.abort(externalSignal.reason);
            } else {
                externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
            }
        }
        const timer = setTimeout(() => controller.abort(new Error('Timeout')), requestTimeoutMs);
        try {
            return await fetchFn(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    };

    const authorizedFetch = async (url: string, init: RequestInit = {}, requestTimeoutMs: number = timeoutMs): Promise<Response> => {
        const token = await getValidAccessToken();
        let response = await timedFetch(url, withAuthHeader(init, token), requestTimeoutMs);

        if (response.status === 401) {
            const current = tokens?.accessToken ?? null;
            if (current && current !== token) {
                // Someone else already refreshed while we were in flight.
                response = await timedFetch(url, withAuthHeader(init, current), requestTimeoutMs);
            } else {
                const result = await refresh();
                if (result.ok) {
                    response = await timedFetch(url, withAuthHeader(init, result.token), requestTimeoutMs);
                } else if (!result.fatal) {
                    // The session may still be alive (network/5xx during refresh).
                    // Don't hand callers a 401 they would read as "signed out".
                    throw new Error('Authentication temporarily unavailable; retrying in the background.');
                }
            }
        }

        return response;
    };

    const setSession: AuthManager['setSession'] = async ({ accessToken, refreshToken, expiresInSec }) => {
        cancelTimers();
        backoffAttempts = 0;
        const ttlSec = typeof expiresInSec === 'number' && expiresInSec > 0 ? expiresInSec : DEFAULT_ACCESS_TOKEN_TTL_SEC;
        tokens = {
            accessToken,
            accessTokenExpiresAt: now() + ttlSec * 1000,
            refreshToken: refreshToken ?? null,
            refreshTokenExpiresAt: null
        };
        await persist();
        scheduleProactiveRefresh();
        onAccessTokenRefreshed?.({ token: accessToken, expiresAt: tokens.accessTokenExpiresAt });
    };

    const initialize = (): Promise<SessionSnapshot | null> => {
        if (!initializePromise) {
            initializePromise = (async () => {
                tokens = await store.load();
                if (!tokens) {
                    return null;
                }
                if (!tokens.refreshToken) {
                    return isAccessTokenValid() ? snapshot() : null;
                }
                // Always refresh once on launch: it validates the session and
                // hands us a full-lifetime access token before any API calls.
                const result = await refresh();
                if (result.ok) {
                    return snapshot();
                }
                if (result.fatal) {
                    return null;
                }
                // Transient failure: keep the session alive — the backoff timer
                // keeps retrying and any 401 re-enters the refresh path.
                return snapshot();
            })();
        }
        return initializePromise;
    };

    return {
        initialize,
        setSession,
        getSessionSnapshot: snapshot,
        getValidAccessToken,
        authorizedFetch,
        signOut: async () => {
            tokens = null;
            cancelTimers();
            backoffAttempts = 0;
            await store.clear();
        },
        dispose: () => {
            disposed = true;
            cancelTimers();
        }
    };
}
