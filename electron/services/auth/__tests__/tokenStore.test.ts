import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { createEncryptedFileTokenStore, createInMemoryTokenStore, type PersistedTokens } from '../tokenStore';

const SAMPLE: PersistedTokens = {
    accessToken: 'access-token-value-abc123',
    accessTokenExpiresAt: 1_900_000_000_000,
    refreshToken: 'refresh-token-value-xyz789',
    refreshTokenExpiresAt: null
};

// A reversible stand-in for safeStorage so tests can verify that only the
// encrypted form ever reaches disk.
const encrypt = (plainText: string) => Buffer.from(Buffer.from(plainText, 'utf8').toString('base64'), 'utf8');
const decrypt = (encrypted: Buffer) => Buffer.from(encrypted.toString('utf8'), 'base64').toString('utf8');

describe('createEncryptedFileTokenStore', () => {
    let dir: string;
    let filePath: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bav-token-store-'));
        filePath = path.join(dir, 'auth-tokens.bin');
    });

    afterEach(async () => {
        await fs.remove(dir);
    });

    const makeStore = () => createEncryptedFileTokenStore({ filePath, encrypt, decrypt });

    it('round-trips tokens through save and load', async () => {
        const store = makeStore();
        await store.save(SAMPLE);
        expect(await store.load()).toEqual(SAMPLE);
    });

    it('returns null when no file exists', async () => {
        expect(await makeStore().load()).toBeNull();
    });

    it('never writes token values to disk in plaintext', async () => {
        const store = makeStore();
        await store.save(SAMPLE);
        const raw = await fs.readFile(filePath, 'utf8');
        expect(raw).not.toContain(SAMPLE.accessToken);
        expect(raw).not.toContain(SAMPLE.refreshToken as string);
    });

    it('does not leave a temp file behind after saving', async () => {
        const store = makeStore();
        await store.save(SAMPLE);
        expect(await fs.pathExists(`${filePath}.tmp`)).toBe(false);
    });

    it('overwrites previous tokens on save', async () => {
        const store = makeStore();
        await store.save(SAMPLE);
        const rotated = { ...SAMPLE, accessToken: 'new-access', refreshToken: 'new-refresh' };
        await store.save(rotated);
        expect(await store.load()).toEqual(rotated);
    });

    it('returns null instead of throwing on a corrupt file', async () => {
        await fs.writeFile(filePath, Buffer.from('garbage-not-encrypted'));
        expect(await makeStore().load()).toBeNull();
    });

    it('returns null when decrypted content has the wrong shape', async () => {
        await fs.writeFile(filePath, encrypt(JSON.stringify({ hello: 'world' })));
        expect(await makeStore().load()).toBeNull();
    });

    it('clear removes the stored file', async () => {
        const store = makeStore();
        await store.save(SAMPLE);
        await store.clear();
        expect(await fs.pathExists(filePath)).toBe(false);
        expect(await store.load()).toBeNull();
    });

    it('clear is a no-op when nothing is stored', async () => {
        await makeStore().clear();
        expect(await fs.pathExists(filePath)).toBe(false);
    });
});

describe('createInMemoryTokenStore', () => {
    it('round-trips tokens without touching disk', async () => {
        const store = createInMemoryTokenStore();
        expect(await store.load()).toBeNull();
        await store.save(SAMPLE);
        expect(await store.load()).toEqual(SAMPLE);
        await store.clear();
        expect(await store.load()).toBeNull();
    });
});
