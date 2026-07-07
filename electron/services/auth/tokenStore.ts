import path from 'node:path';
import fs from 'fs-extra';

export interface PersistedTokens {
    accessToken: string;
    accessTokenExpiresAt: number;
    refreshToken: string | null;
    refreshTokenExpiresAt: number | null;
}

export interface TokenStore {
    load: () => Promise<PersistedTokens | null>;
    save: (tokens: PersistedTokens) => Promise<void>;
    clear: () => Promise<void>;
}

export interface EncryptedFileTokenStoreOptions {
    filePath: string;
    encrypt: (plainText: string) => Buffer;
    decrypt: (encrypted: Buffer) => string;
}

function isValidShape(value: unknown): value is PersistedTokens {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record.accessToken === 'string' && typeof record.accessTokenExpiresAt === 'number';
}

/**
 * Persists tokens as an OS-encrypted blob (Electron safeStorage: DPAPI on
 * Windows, Keychain on macOS, libsecret on Linux). Writes go to a temp file
 * first and are renamed into place so a crash never leaves a partial file.
 * Token values must never be logged here.
 */
export function createEncryptedFileTokenStore(options: EncryptedFileTokenStoreOptions): TokenStore {
    const { filePath, encrypt, decrypt } = options;

    return {
        load: async () => {
            try {
                if (!(await fs.pathExists(filePath))) {
                    return null;
                }
                const encrypted = await fs.readFile(filePath);
                const parsed: unknown = JSON.parse(decrypt(encrypted));
                if (!isValidShape(parsed)) {
                    console.warn('Stored auth tokens have an unexpected shape; ignoring them.');
                    return null;
                }
                return {
                    accessToken: parsed.accessToken,
                    accessTokenExpiresAt: parsed.accessTokenExpiresAt,
                    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
                    refreshTokenExpiresAt: typeof parsed.refreshTokenExpiresAt === 'number' ? parsed.refreshTokenExpiresAt : null
                };
            } catch (error) {
                console.warn('Failed to load stored auth tokens:', (error as Error).message);
                return null;
            }
        },
        save: async (tokens) => {
            const encrypted = encrypt(JSON.stringify(tokens));
            const tempPath = `${filePath}.tmp`;
            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(tempPath, encrypted);
            await fs.rename(tempPath, filePath);
        },
        clear: async () => {
            try {
                await fs.remove(`${filePath}.tmp`);
                await fs.remove(filePath);
            } catch (error) {
                console.warn('Failed to clear stored auth tokens:', (error as Error).message);
            }
        }
    };
}

/**
 * Fallback when OS-level encryption is unavailable (e.g. Linux without a
 * secret service). Tokens then only live for the lifetime of the process —
 * we never write them to disk in plaintext.
 */
export function createInMemoryTokenStore(): TokenStore {
    let tokens: PersistedTokens | null = null;
    return {
        load: async () => tokens,
        save: async (next) => {
            tokens = next;
        },
        clear: async () => {
            tokens = null;
        }
    };
}
