export interface ParsedCookie {
    value: string;
    /** Absolute epoch-ms expiry derived from Max-Age or Expires, if present. */
    expiresAt: number | null;
}

/**
 * Extracts a cookie's value (and expiry, when advertised) from Set-Cookie
 * header strings. Each entry is expected to be a single Set-Cookie header as
 * returned by Headers#getSetCookie().
 */
export function extractCookie(setCookieHeaders: string[], name: string, now: number = Date.now()): ParsedCookie | null {
    for (const header of setCookieHeaders) {
        const [pair, ...attributes] = header.split(';');
        const separator = pair.indexOf('=');
        if (separator === -1) continue;
        if (pair.slice(0, separator).trim() !== name) continue;

        const value = pair.slice(separator + 1).trim();
        if (!value) continue;

        let expiresAt: number | null = null;
        for (const attribute of attributes) {
            const [attrName, ...attrRest] = attribute.split('=');
            const attrValue = attrRest.join('=').trim();
            const normalized = attrName.trim().toLowerCase();
            if (normalized === 'max-age') {
                const seconds = Number(attrValue);
                if (Number.isFinite(seconds)) {
                    expiresAt = now + seconds * 1000;
                    break; // Max-Age wins over Expires per RFC 6265
                }
            } else if (normalized === 'expires' && expiresAt === null) {
                const parsed = Date.parse(attrValue);
                if (Number.isFinite(parsed)) {
                    expiresAt = parsed;
                }
            }
        }

        return { value, expiresAt };
    }

    return null;
}

export function getSetCookieHeaders(headers: Headers): string[] {
    if (typeof headers.getSetCookie === 'function') {
        return headers.getSetCookie();
    }
    const combined = headers.get('set-cookie');
    return combined ? [combined] : [];
}
