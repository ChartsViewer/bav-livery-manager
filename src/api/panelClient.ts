import type { ApiFetchInit, ApiFetchResult } from '@/types/electron-api';

export type PanelResponse<T> = ApiFetchResult<T>;

export const createStatusError = (status: number, message: string): Error & { status?: number } => {
    const error: Error & { status?: number } = new Error(message);
    error.status = status;
    return error;
};

/**
 * All authenticated panel requests go through the main process, which attaches
 * the bearer token and silently refreshes it on 401 before retrying once.
 * The renderer never handles refresh tokens.
 */
export async function panelFetch<T = unknown>(url: string, init?: ApiFetchInit): Promise<PanelResponse<T>> {
    const api = typeof window === 'undefined' ? undefined : window.electronAPI;
    if (api?.apiFetch) {
        const result = await api.apiFetch(url, init);
        if (!result.ok && result.status === 0) {
            // Network-level failure (offline, timeout): surface as a rejection so
            // callers treat it like a fetch() error, not an HTTP status.
            throw new Error(result.error ?? 'Network request failed');
        }
        return result as PanelResponse<T>;
    }

    // Fallback for non-Electron dev environments; no silent refresh available.
    const response = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
        cache: 'no-store'
    });
    let body: T | null = null;
    try {
        body = (await response.json()) as T;
    } catch {
        body = null;
    }
    return { ok: response.ok, status: response.status, body };
}

/** Unwraps the panel's `{ data: ... }` envelope when present. */
export function unwrapData<T>(body: unknown): T {
    if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
        return (body as { data: T }).data;
    }
    return body as T;
}
