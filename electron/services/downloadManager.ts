import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import * as fs from 'fs-extra';
import type { AppContext, DownloadProgress, DownloadResult, Settings } from '../types';
import { fetchJson, fetchWithTimeout } from '../utils/network';
import { recordInstallation } from './installedLiveriesStore';
import { PANEL_BASE_URL } from '../../shared/constants';
import extract from 'extract-zip';
import { processLayout } from 'msfs-layout-generator';
import { detectSimulatorPaths } from './simulatorPaths';

interface DownloadLiveryOptions {
    downloadEndpoint: string;
    liveryId: string;
    liveryName: string;
    liveryDeveloper: string;
    aircraft: string;
    simulator: 'MSFS2020' | 'MSFS2024';
    resolution: string;
    settings: Settings;
    appContext: AppContext;
    authToken: string | null;
}

const DOWNLOAD_ATTEMPTS = 3;
const RESOLVE_ATTEMPTS = 2;
const BACKOFF_MS = 800;

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]+/g;

const DUMMY_PMDG_MANIFEST = {
  "dependencies": [],
  "content_type": "AIRCRAFT",
  "title": "Liveries",
  "manufacturer": "PMDG",
  "creator": "PMDG Simulations",
  "package_version": "1.0.0",
  "minimum_game_version": "1.20.6",
  "release_notes": {
    "neutral": {
      "LastUpdate": "",
      "OlderHistory": ""
    }
  }
};

const activeDownloads = new Map<string, AbortController>();

export function cancelDownload(liveryId: string): boolean {
    const controller = activeDownloads.get(liveryId);
    if (controller) {
        controller.abort(new Error('Download cancelled by user'));
        activeDownloads.delete(liveryId);
        return true;
    }
    return false;
}

async function retryAsync<T>(
    fn: () => Promise<T>,
    attempts: number,
    backoffMs: number,
    signal?: AbortSignal
): Promise<T> {
    let lastError: Error | undefined;
    for (let i = 0; i < attempts; i++) {
        if (signal?.aborted) {
            throw new Error('Download cancelled');
        }
        try {
            return await fn();
        } catch (error) {
            if (signal?.aborted) {
                throw new Error('Download cancelled');
            }
            lastError = error instanceof Error ? error : new Error(String(error));
            if (i < attempts - 1) {
                await new Promise((resolve) => setTimeout(resolve, backoffMs * (i + 1)));
            }
        }
    }
    throw lastError ?? new Error('retryAsync failed');
}

function deriveZipFilename(downloadUrl: string): string {
    const buildName = (raw?: string | null) => {
        if (!raw) {
            return '';
        }
        return raw.replace(INVALID_FILENAME_CHARS, '_');
    };

    try {
        const parsed = new URL(downloadUrl);
        //regex removes unnecessary data added after uploading to S3
        const fromPath = buildName(path.basename(parsed.pathname)).replace(/^[^-]+-[^-]+-/, '');
        if (fromPath) {
            return fromPath;
        }
    } catch {
        // Non-absolute URL, fall back to manual parsing
    }

    const withoutQuery = downloadUrl.split(/[?#]/)[0];
    const fallback = buildName(path.basename(withoutQuery));
    if (fallback) {
        return fallback;
    }

    return `livery-${Date.now()}.zip`;
}

export async function downloadAndInstallLivery(options: DownloadLiveryOptions): Promise<DownloadResult> {
    const { downloadEndpoint, liveryId, liveryName, liveryDeveloper, aircraft, simulator, resolution, settings, appContext, authToken } = options;

    if (!authToken) {
        return { success: false, error: 'Missing authentication token. Please sign in again.' };
    }

    const abortController = new AbortController();
    activeDownloads.set(liveryId, abortController);

    const baseFolder = simulator === 'MSFS2024' && settings.msfs2024Path ? settings.msfs2024Path : settings.msfs2020Path;

    if (!baseFolder) {
        const errorMsg = 'No simulator path configured. Please set it in Settings.';
        console.error(errorMsg);
        return { success: false, error: errorMsg, path: '' };
    }

    await fs.ensureDir(baseFolder);

    let outputPath = '';
    let extractPath = '';

    try {
        const signedDownload = await retryAsync(() => resolveDownloadEndpoint(downloadEndpoint, authToken, abortController.signal), RESOLVE_ATTEMPTS, BACKOFF_MS, abortController.signal);
        const downloadUrl = signedDownload.downloadUrl;

        const zipFilename = deriveZipFilename(downloadUrl);
        const folderName = zipFilename.replace(/\.zip$/i, '');
        outputPath = path.join(baseFolder, zipFilename);
        extractPath = path.join(baseFolder, folderName);

        let lastProgressSentAt = 0;
        const PROGRESS_THROTTLE_MS = 80;

        await retryAsync(() => downloadFile(downloadUrl, outputPath, abortController.signal, (progress) => {
            const now = Date.now();
            if (now - lastProgressSentAt < PROGRESS_THROTTLE_MS && progress.percent < 100) {
                return;
            }
            lastProgressSentAt = now;

            const targetWindow = appContext.getMainWindow();
            if (!targetWindow || targetWindow.isDestroyed()) {
                return;
            }

            targetWindow.webContents.send('download-progress', {
                liveryName,
                progress: progress.percent,
                downloaded: progress.transferred,
                total: progress.total
            });

            // Update taskbar progress
            targetWindow.setProgressBar(progress.percent / 100, { mode: 'normal' });
        }), DOWNLOAD_ATTEMPTS, BACKOFF_MS);

        const targetWindow = appContext.getMainWindow();
        if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('download-progress', {
                liveryName,
                progress: 100,
                extracting: true
            });

            // Set taskbar to indeterminate mode during extraction
            targetWindow.setProgressBar(2, { mode: 'indeterminate' });
        }

        if (liveryDeveloper === 'PMDG') {
            extractPath = await installPMDG(outputPath, baseFolder, simulator, aircraft, liveryDeveloper, liveryName, folderName);
        } else {
            await extractZip(outputPath, extractPath);
        }

        // Record the installation in our local store (not in the livery folder)
        const simCode = simulator === 'MSFS2024' ? 'FS24' : 'FS20';
        await recordInstallation({
            liveryId,
            originalName: liveryName,
            folderName,
            installPath: extractPath,
            resolution,
            simulator: simCode,
            version: '1.0.0'
        });

        await fs.remove(outputPath);

        // Track the download completion
        try {
            await trackDownloadCompletion(liveryId, simulator, resolution, authToken);
        } catch (trackError) {
            console.warn('Failed to track download, but installation succeeded:', trackError);
        }

        // Clear taskbar progress
        const finalWindow = appContext.getMainWindow();
        if (finalWindow && !finalWindow.isDestroyed()) {
            finalWindow.setProgressBar(-1);
        }

        activeDownloads.delete(liveryId);

        return {
            success: true,
            path: extractPath
        };
    } catch (error) {
        activeDownloads.delete(liveryId);

        if (abortController.signal.aborted) {
             const finalWindow = appContext.getMainWindow();
             if (finalWindow && !finalWindow.isDestroyed()) {
                 finalWindow.setProgressBar(-1);
             }
             return { success: false, error: 'Download cancelled by user' };
        }

        console.error('Download process failed:', error);

        // Set taskbar to error state briefly, then clear
        const errorWindow = appContext.getMainWindow();
        if (errorWindow && !errorWindow.isDestroyed()) {
            errorWindow.setProgressBar(1, { mode: 'error' });
            setTimeout(() => {
                if (errorWindow && !errorWindow.isDestroyed()) {
                    errorWindow.setProgressBar(-1);
                }
            }, 2000);
        }

        const status = (error as Error & { status?: number }).status;
        return {
            success: false,
            error: (error as Error).message,
            details: typeof status === 'number' ? `Server responded with ${status}` : undefined
        };
    }
}

async function downloadFile(url: string, filePath: string, signal: AbortSignal, onProgress?: (progress: DownloadProgress) => void) {
    if (signal.aborted) {
        throw new Error('Download cancelled');
    }
    const writer = fs.createWriteStream(filePath);
    const response = await fetchWithTimeout(url, { method: 'GET', signal }, 30000);

    if (!response.body) {
        writer.close();
        throw new Error('Download response did not include a body stream');
    }

    const totalLengthHeader = response.headers.get('content-length');
    const totalLength = totalLengthHeader ? parseInt(totalLengthHeader, 10) : 0;
    let downloadedLength = 0;
    const nodeStream = Readable.fromWeb(response.body as unknown as NodeReadableStream);

    return new Promise<void>((resolve, reject) => {
        const handleError = async (error: Error) => {
            writer.destroy();
            nodeStream.destroy();
            try {
                await fs.remove(filePath);
            } catch {
                // no-op
            }
            reject(error);
        };

        nodeStream.on('data', (chunk: Buffer) => {
            downloadedLength += chunk.length;
            if (onProgress && totalLength) {
                const percent = Math.round((downloadedLength / totalLength) * 100);
                onProgress({
                    percent,
                    transferred: downloadedLength,
                    total: totalLength
                });
            }
        });

        nodeStream.on('error', (error) => handleError(error as Error));
        writer.on('error', (error) => handleError(error as Error));

        writer.on('finish', () => {
            writer.close();
            resolve();
        });

        if (signal.aborted) {
             handleError(new Error('Download cancelled'));
        } else {
             signal.addEventListener('abort', () => {
                 handleError(new Error('Download cancelled'));
             }, { once: true });
        }

        nodeStream.pipe(writer);
    });
}

interface SignedDownloadPayload {
    downloadUrl: string;
    expiresAt: string;
    sizeBytes?: number;
    version?: string;
}

async function resolveDownloadEndpoint(endpoint: string, authToken: string | null, signal?: AbortSignal): Promise<SignedDownloadPayload> {
    const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    return fetchJson<SignedDownloadPayload>(endpoint, { headers, signal }, 15000);
}

async function installPMDG(zipPath: string, extractPath: string, simulator: 'MSFS2020' | 'MSFS2024', aircraft: string, liveryDeveloper: string, liveryName: string, folderName: string) {
    const aircraftShort = aircraft === "B77W" ? "77w" : aircraft === "B772" ? "77er" : aircraft.toLowerCase();
    const aircraftFull = aircraftShort === "77w" ? "777-300ER" : aircraftShort === "77er" ? "777-200ER" : aircraft;
    const pmdgLiveryFolderPath = `${extractPath}/pmdg-aircraft-${aircraftShort}-liveries`;
    const exptractPathForPmdg = `${pmdgLiveryFolderPath}/SimObjects/Airplanes/${simulator === 'MSFS2024' ? 'PMDG ' + aircraftFull + '/liveries/pmdg' : ''}/${folderName}`;

    const registation = liveryName.split(' ')[0];

    await extractZip(zipPath, exptractPathForPmdg);

    try {
        await fs.access(`${pmdgLiveryFolderPath}/manifest.json`, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
        await fs.writeJson(`${pmdgLiveryFolderPath}/manifest.json`, DUMMY_PMDG_MANIFEST);
    }

    await processLayout(pmdgLiveryFolderPath, { force: true });

    const wasmFolder = simulator === "MSFS2020" ? (await detectSimulatorPaths()).msfs2020WasmPath : (await detectSimulatorPaths()).msfs2024WasmPath;

    if (!wasmFolder) {
        throw new Error(`Could not detect WASM folder for ${simulator}`);
    }

    const sourceFile = path.join(exptractPathForPmdg, "options.ini");
    const destinationPath = path.join(wasmFolder + `/pmdg-aircraft-${aircraftShort}/work/Aircraft`, `${registation}.ini`);

    console.log(sourceFile, destinationPath);

    await fs.copy(sourceFile, destinationPath);

    return exptractPathForPmdg;
}

function extractZip(zipPath: string, extractPath: string) {
    return new Promise<void>(async (resolve, reject) => {
        try {
            await extract(zipPath, { dir: extractPath })
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

async function trackDownloadCompletion(
    liveryId: string,
    simulator: 'MSFS2020' | 'MSFS2024',
    resolution: string,
    authToken: string
): Promise<void> {
    const simCode = simulator === 'MSFS2024' ? 'FS24' : 'FS20';
    const trackUrl = `${PANEL_BASE_URL}/api/v2/simulator/liveries/${liveryId}/track`;

    try {
        const response = await fetchWithTimeout(trackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                simulator: simCode,
                resolution
            })
        }, 10000);

        if (!response.ok) {
            const statusText = response.statusText || 'Unknown error';
            console.warn(`Download tracking failed: ${response.status} ${statusText}`);
        }
    } catch (error) {
        // Log but don't throw - tracking failures shouldn't prevent downloads
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('Failed to track download:', errorMessage);
        throw error;
    }
}
