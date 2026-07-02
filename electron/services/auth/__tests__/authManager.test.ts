import { describe, expect, it } from 'bun:test';
import { createAuthManager, type SessionSnapshot } from '../authManager';
import { createInMemoryTokenStore, type PersistedTokens } from '../tokenStore';

const REFRESH_URL = 'https://panel.test/api/v1/auth/refresh';
const DATA_URL = 'https://panel.test/api/v2/things';
const START_TIME = 1_000_000_000_000;

interface RecordedCall {
    url: string;
    init: RequestInit;
    headers: Headers;
}

interface FakeTimer {
    callback: () => void;
    delayMs: number;
    cancelled: boolean;
}

function refreshOkResponse(token: string, rotatedRefresh: string | null, expiresIn = 900): Response {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (rotatedRefresh) {
        headers['set-cookie'] = `bav_refresh=${rotatedRefresh}; Path=/api/v1/auth; HttpOnly; Secure; Max-Age=604800`;
    }
    return new Response(
        JSON.stringify({ status: 'Ok', payload: { token, expiresIn, user: {} } }),
        { status: 200, headers }
    );
}

function statusResponse(status: number): Response {
    return new Response(status === 204 ? null : JSON.stringify({}), { status });
}

function createHarness(options: {
    initialTokens?: PersistedTokens | null;
    fetchImpl?: (call: RecordedCall, callIndex: number) => Response | Promise<Response>;
} = {}) {
    const store = createInMemoryTokenStore();
    if (options.initialTokens) {
        void store.save(options.initialTokens);
    }

    const calls: RecordedCall[] = [];
    const timers: FakeTimer[] = [];
    const refreshedSessions: SessionSnapshot[] = [];
    let expiredCount = 0;
    let currentTime = START_TIME;

    let fetchImpl = options.fetchImpl ?? (() => refreshOkResponse('unused', null));

    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
        const call: RecordedCall = {
            url: String(input),
            init: init ?? {},
            headers: new Headers(init?.headers)
        };
        calls.push(call);
        return fetchImpl(call, calls.length - 1);
    }) as typeof fetch;

    const manager = createAuthManager({
        store,
        refreshUrl: REFRESH_URL,
        fetchFn,
        now: () => currentTime,
        setTimer: (callback, delayMs) => {
            const timer: FakeTimer = { callback, delayMs, cancelled: false };
            timers.push(timer);
            return timer;
        },
        clearTimer: (handle) => {
            (handle as FakeTimer).cancelled = true;
        },
        onAccessTokenRefreshed: (session) => refreshedSessions.push(session),
        onSessionExpired: () => {
            expiredCount += 1;
        }
    });

    return {
        manager,
        store,
        calls,
        timers,
        refreshedSessions,
        get expiredCount() {
            return expiredCount;
        },
        advanceTime: (ms: number) => {
            currentTime += ms;
        },
        get now() {
            return currentTime;
        },
        setFetchImpl: (impl: typeof fetchImpl) => {
            fetchImpl = impl;
        },
        pendingTimers: () => timers.filter((timer) => !timer.cancelled),
        refreshCalls: () => calls.filter((call) => call.url === REFRESH_URL),
        dataCalls: () => calls.filter((call) => call.url === DATA_URL)
    };
}

describe('setSession', () => {
    it('persists tokens and announces the new access token', async () => {
        const harness = createHarness();
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        expect(await harness.store.load()).toMatchObject({ accessToken: 'acc-1', refreshToken: 'ref-1' });
        expect(harness.refreshedSessions).toEqual([{ token: 'acc-1', expiresAt: START_TIME + 900_000 }]);
    });

    it('schedules a proactive refresh 60s before expiry', async () => {
        const harness = createHarness();
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        const pending = harness.pendingTimers();
        expect(pending).toHaveLength(1);
        expect(pending[0].delayMs).toBe(900_000 - 60_000);
    });

    it('does not schedule a refresh without a refresh token', async () => {
        const harness = createHarness();
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: null, expiresInSec: 900 });
        expect(harness.pendingTimers()).toHaveLength(0);
    });
});

describe('refresh', () => {
    it('sends the refresh token as a cookie with no Origin header', async () => {
        const harness = createHarness({
            fetchImpl: () => refreshOkResponse('acc-2', 'ref-2')
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        harness.pendingTimers()[0].callback();
        await Bun.sleep(0);

        const [request] = harness.refreshCalls();
        expect(request).toBeDefined();
        expect(request.init.method).toBe('POST');
        expect(request.headers.get('cookie')).toBe('bav_refresh=ref-1');
        expect(request.headers.has('origin')).toBe(false);
        expect(request.headers.has('authorization')).toBe(false);
    });

    it('stores the new access token and the rotated refresh token atomically', async () => {
        const harness = createHarness({
            fetchImpl: () => refreshOkResponse('acc-2', 'ref-2', 900)
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        const token = await harness.manager.getValidAccessToken();

        expect(token).toBe('acc-2');
        expect(await harness.store.load()).toMatchObject({
            accessToken: 'acc-2',
            refreshToken: 'ref-2',
            accessTokenExpiresAt: harness.now + 900_000,
            refreshTokenExpiresAt: harness.now + 604_800_000
        });
    });

    it('uses the rotated refresh token on the next refresh (single-use rotation)', async () => {
        const harness = createHarness({
            fetchImpl: (_call, index) => refreshOkResponse(`acc-${index + 2}`, `ref-${index + 2}`)
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        harness.advanceTime(900_000);
        await harness.manager.getValidAccessToken();
        harness.advanceTime(900_000);
        await harness.manager.getValidAccessToken();

        const refreshes = harness.refreshCalls();
        expect(refreshes).toHaveLength(2);
        expect(refreshes[0].headers.get('cookie')).toBe('bav_refresh=ref-1');
        expect(refreshes[1].headers.get('cookie')).toBe('bav_refresh=ref-2');
    });

    it('keeps the previous refresh token when the response omits Set-Cookie', async () => {
        const harness = createHarness({
            fetchImpl: () => refreshOkResponse('acc-2', null)
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        await harness.manager.getValidAccessToken();

        expect(await harness.store.load()).toMatchObject({ accessToken: 'acc-2', refreshToken: 'ref-1' });
    });

    it('collapses concurrent refreshes into a single request', async () => {
        let releaseRefresh: (response: Response) => void = () => undefined;
        const harness = createHarness({
            fetchImpl: () => new Promise<Response>((resolve) => {
                releaseRefresh = resolve;
            })
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        const first = harness.manager.getValidAccessToken();
        const second = harness.manager.getValidAccessToken();
        await Bun.sleep(0);

        expect(harness.refreshCalls()).toHaveLength(1);
        releaseRefresh(refreshOkResponse('acc-2', 'ref-2'));

        expect(await first).toBe('acc-2');
        expect(await second).toBe('acc-2');
        expect(harness.refreshCalls()).toHaveLength(1);
    });

    it('clears the session and signals expiry when the server rejects the refresh token', async () => {
        const harness = createHarness({
            fetchImpl: () => statusResponse(401)
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        const token = await harness.manager.getValidAccessToken();

        expect(token).toBeNull();
        expect(harness.expiredCount).toBe(1);
        expect(harness.manager.getSessionSnapshot()).toBeNull();
        expect(await harness.store.load()).toBeNull();
    });

    it('keeps tokens and schedules a backoff retry on a 5xx', async () => {
        const harness = createHarness({
            fetchImpl: () => statusResponse(503)
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        await harness.manager.getValidAccessToken();

        expect(harness.expiredCount).toBe(0);
        expect(await harness.store.load()).toMatchObject({ accessToken: 'acc-1', refreshToken: 'ref-1' });
        // Alongside the still-pending proactive timer there must now be a retry.
        expect(harness.pendingTimers().map((timer) => timer.delayMs)).toContain(5_000);
    });

    it('keeps tokens and never signs out on a network error, with growing backoff', async () => {
        const harness = createHarness({
            fetchImpl: () => {
                throw new Error('ECONNRESET');
            }
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        await harness.manager.getValidAccessToken();
        const firstRetry = harness.pendingTimers().find((timer) => timer.delayMs === 5_000);
        expect(firstRetry).toBeDefined();

        firstRetry!.callback();
        await Bun.sleep(0);

        const delays = harness.pendingTimers().map((timer) => timer.delayMs);
        expect(delays).toContain(10_000);
        expect(harness.expiredCount).toBe(0);
        expect(await harness.store.load()).toMatchObject({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    });

    it('discards a refresh that completes after sign-out instead of resurrecting the session', async () => {
        let releaseRefresh: (response: Response) => void = () => undefined;
        const harness = createHarness({
            fetchImpl: () => new Promise<Response>((resolve) => {
                releaseRefresh = resolve;
            })
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        const pending = harness.manager.getValidAccessToken();
        await Bun.sleep(0);
        await harness.manager.signOut();
        releaseRefresh(refreshOkResponse('acc-2', 'ref-2'));
        await pending;

        expect(harness.manager.getSessionSnapshot()).toBeNull();
        expect(await harness.store.load()).toBeNull();
    });

    it('does not kill a new session when a stale refresh gets a 401', async () => {
        let releaseRefresh: (response: Response) => void = () => undefined;
        const harness = createHarness({
            fetchImpl: () => new Promise<Response>((resolve) => {
                releaseRefresh = resolve;
            })
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });
        harness.advanceTime(900_000);

        const pending = harness.manager.getValidAccessToken();
        await Bun.sleep(0);
        // A fresh browser sign-in replaces the session mid-refresh…
        await harness.manager.setSession({ accessToken: 'acc-new', refreshToken: 'ref-new', expiresInSec: 900 });
        // …and the old (spent) refresh token is then rejected by the server.
        releaseRefresh(statusResponse(401));
        await pending;

        expect(harness.expiredCount).toBe(0);
        expect(harness.manager.getSessionSnapshot()?.token).toBe('acc-new');
        expect(await harness.store.load()).toMatchObject({ accessToken: 'acc-new', refreshToken: 'ref-new' });
    });

    it('treats a locally expired refresh token as a dead session without a network call', async () => {
        const harness = createHarness({
            initialTokens: {
                accessToken: 'acc-1',
                accessTokenExpiresAt: START_TIME - 1000,
                refreshToken: 'ref-1',
                refreshTokenExpiresAt: START_TIME - 1000
            }
        });

        const session = await harness.manager.initialize();

        expect(session).toBeNull();
        expect(harness.refreshCalls()).toHaveLength(0);
        expect(harness.expiredCount).toBe(1);
    });
});

describe('authorizedFetch', () => {
    it('attaches the bearer token', async () => {
        const harness = createHarness({
            fetchImpl: () => statusResponse(204)
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        const response = await harness.manager.authorizedFetch(DATA_URL);

        expect(response.status).toBe(204);
        expect(harness.dataCalls()[0].headers.get('authorization')).toBe('Bearer acc-1');
    });

    it('refreshes once and retries exactly once on a 401', async () => {
        const harness = createHarness();
        harness.setFetchImpl((call) => {
            if (call.url === REFRESH_URL) return refreshOkResponse('acc-2', 'ref-2');
            return call.headers.get('authorization') === 'Bearer acc-2' ? statusResponse(200) : statusResponse(401);
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        const response = await harness.manager.authorizedFetch(DATA_URL);

        expect(response.status).toBe(200);
        const dataCalls = harness.dataCalls();
        expect(dataCalls).toHaveLength(2);
        expect(dataCalls[1].headers.get('authorization')).toBe('Bearer acc-2');
        expect(harness.refreshCalls()).toHaveLength(1);
    });

    it('returns the 401 without looping when the retry also fails', async () => {
        const harness = createHarness();
        harness.setFetchImpl((call) => {
            if (call.url === REFRESH_URL) return refreshOkResponse('acc-2', 'ref-2');
            return statusResponse(401);
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        const response = await harness.manager.authorizedFetch(DATA_URL);

        expect(response.status).toBe(401);
        expect(harness.dataCalls()).toHaveLength(2);
        expect(harness.refreshCalls()).toHaveLength(1);
    });

    it('returns the original 401 when the session is truly dead', async () => {
        const harness = createHarness();
        harness.setFetchImpl((call) => statusResponse(401));
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        const response = await harness.manager.authorizedFetch(DATA_URL);

        expect(response.status).toBe(401);
        expect(harness.expiredCount).toBe(1);
        expect(harness.dataCalls()).toHaveLength(1);
    });

    it('throws instead of returning a 401 when refresh fails transiently', async () => {
        const harness = createHarness();
        harness.setFetchImpl((call) => {
            if (call.url === REFRESH_URL) return statusResponse(503);
            return statusResponse(401);
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        expect(harness.manager.authorizedFetch(DATA_URL)).rejects.toThrow('Authentication temporarily unavailable');
        await Bun.sleep(0);
        expect(harness.expiredCount).toBe(0);
    });

    it('retries with the current token when another caller already refreshed', async () => {
        const harness = createHarness();
        harness.setFetchImpl(async (call) => {
            if (call.url === REFRESH_URL) return refreshOkResponse('acc-9', 'ref-9');
            if (call.headers.get('authorization') === 'Bearer acc-1') {
                // Simulate a refresh completing elsewhere while this request is in flight.
                await harness.manager.setSession({ accessToken: 'acc-2', refreshToken: 'ref-2', expiresInSec: 900 });
                return statusResponse(401);
            }
            return statusResponse(200);
        });
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        const response = await harness.manager.authorizedFetch(DATA_URL);

        expect(response.status).toBe(200);
        expect(harness.refreshCalls()).toHaveLength(0);
        expect(harness.dataCalls()[1].headers.get('authorization')).toBe('Bearer acc-2');
    });
});

describe('initialize', () => {
    it('returns null and makes no requests when nothing is stored', async () => {
        const harness = createHarness();
        expect(await harness.manager.initialize()).toBeNull();
        expect(harness.calls).toHaveLength(0);
    });

    it('refreshes once on launch when a refresh token is stored', async () => {
        const harness = createHarness({
            initialTokens: {
                accessToken: 'acc-old',
                accessTokenExpiresAt: START_TIME + 600_000,
                refreshToken: 'ref-1',
                refreshTokenExpiresAt: null
            },
            fetchImpl: () => refreshOkResponse('acc-new', 'ref-2')
        });

        const session = await harness.manager.initialize();

        expect(session).toEqual({ token: 'acc-new', expiresAt: START_TIME + 900_000 });
        expect(harness.refreshCalls()).toHaveLength(1);
        expect(await harness.store.load()).toMatchObject({ accessToken: 'acc-new', refreshToken: 'ref-2' });
    });

    it('clears everything when the launch refresh is rejected', async () => {
        const harness = createHarness({
            initialTokens: {
                accessToken: 'acc-old',
                accessTokenExpiresAt: START_TIME + 600_000,
                refreshToken: 'ref-1',
                refreshTokenExpiresAt: null
            },
            fetchImpl: () => statusResponse(401)
        });

        expect(await harness.manager.initialize()).toBeNull();
        expect(await harness.store.load()).toBeNull();
    });

    it('keeps the session alive when the launch refresh fails transiently', async () => {
        const harness = createHarness({
            initialTokens: {
                accessToken: 'acc-old',
                accessTokenExpiresAt: START_TIME + 600_000,
                refreshToken: 'ref-1',
                refreshTokenExpiresAt: null
            },
            fetchImpl: () => {
                throw new Error('offline');
            }
        });

        const session = await harness.manager.initialize();

        expect(session).toEqual({ token: 'acc-old', expiresAt: START_TIME + 600_000 });
        expect(harness.expiredCount).toBe(0);
        expect(harness.pendingTimers().length).toBeGreaterThan(0);
    });

    it('only initializes once', async () => {
        const harness = createHarness({
            initialTokens: {
                accessToken: 'acc-old',
                accessTokenExpiresAt: START_TIME + 600_000,
                refreshToken: 'ref-1',
                refreshTokenExpiresAt: null
            },
            fetchImpl: () => refreshOkResponse('acc-new', 'ref-2')
        });

        await Promise.all([harness.manager.initialize(), harness.manager.initialize()]);
        await harness.manager.initialize();

        expect(harness.refreshCalls()).toHaveLength(1);
    });
});

describe('signOut', () => {
    it('clears tokens and cancels timers without emitting session-expired', async () => {
        const harness = createHarness();
        await harness.manager.setSession({ accessToken: 'acc-1', refreshToken: 'ref-1', expiresInSec: 900 });

        await harness.manager.signOut();

        expect(harness.manager.getSessionSnapshot()).toBeNull();
        expect(await harness.store.load()).toBeNull();
        expect(harness.pendingTimers()).toHaveLength(0);
        expect(harness.expiredCount).toBe(0);
        expect(await harness.manager.getValidAccessToken()).toBeNull();
    });
});
