import { describe, expect, it } from 'bun:test';
import { extractCookie } from '../setCookie';

const NOW = 1_750_000_000_000;

describe('extractCookie', () => {
    it('extracts the named cookie value', () => {
        const result = extractCookie(['bav_refresh=abc123; Path=/; HttpOnly; Secure'], 'bav_refresh', NOW);
        expect(result?.value).toBe('abc123');
    });

    it('ignores other cookies', () => {
        const result = extractCookie(
            ['session=other; Path=/', 'bav_refresh=target-value; Path=/api/v1/auth; HttpOnly'],
            'bav_refresh',
            NOW
        );
        expect(result?.value).toBe('target-value');
    });

    it('returns null when the cookie is absent', () => {
        expect(extractCookie(['session=other; Path=/'], 'bav_refresh', NOW)).toBeNull();
        expect(extractCookie([], 'bav_refresh', NOW)).toBeNull();
    });

    it('does not match cookies whose name merely contains the target', () => {
        expect(extractCookie(['not_bav_refresh=nope; Path=/'], 'bav_refresh', NOW)).toBeNull();
    });

    it('derives expiry from Max-Age', () => {
        const result = extractCookie(['bav_refresh=abc; Max-Age=604800; Path=/'], 'bav_refresh', NOW);
        expect(result?.expiresAt).toBe(NOW + 604800 * 1000);
    });

    it('prefers Max-Age over Expires', () => {
        const result = extractCookie(
            ['bav_refresh=abc; Expires=Wed, 01 Jan 2020 00:00:00 GMT; Max-Age=60'],
            'bav_refresh',
            NOW
        );
        expect(result?.expiresAt).toBe(NOW + 60_000);
    });

    it('falls back to Expires when Max-Age is absent', () => {
        const result = extractCookie(
            ['bav_refresh=abc; Expires=Wed, 01 Jan 2031 00:00:00 GMT'],
            'bav_refresh',
            NOW
        );
        expect(result?.expiresAt).toBe(Date.parse('Wed, 01 Jan 2031 00:00:00 GMT'));
    });

    it('reports null expiry for a session cookie', () => {
        const result = extractCookie(['bav_refresh=abc; Path=/; HttpOnly'], 'bav_refresh', NOW);
        expect(result?.expiresAt).toBeNull();
    });

    it('handles values containing an equals sign', () => {
        const result = extractCookie(['bav_refresh=abc=def==; Path=/'], 'bav_refresh', NOW);
        expect(result?.value).toBe('abc=def==');
    });

    it('ignores an empty value', () => {
        expect(extractCookie(['bav_refresh=; Max-Age=0; Path=/'], 'bav_refresh', NOW)).toBeNull();
    });
});
