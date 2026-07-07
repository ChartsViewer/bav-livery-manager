import path from 'node:path';
import fs from 'fs-extra';
import archiver from 'archiver';
import { dialog, ipcMain, nativeTheme, shell } from 'electron';
import { generateLayout } from 'msfs-layout-generator';
import type { OpenDialogOptions } from 'electron';
import type { AppContext, DownloadResult, Settings } from '../types';
import { detectSimulatorPaths } from '../services/simulatorPaths';
import { fetchRemoteLiveryList } from '../services/liveryData';
import { downloadAndInstallLivery, cancelDownload, downloadAndInstallPackage, cancelPackageDownload } from '../services/downloadManager';
import { isSimulatorRunning } from '../services/simulatorMonitor';
import { loadSettings, saveSettings } from '../services/settingsStore';
import {
    getInstalledLiveries,
    removeInstallationByPath,
    validateInstallations
} from '../services/installedLiveriesStore';
import {
    getInstalledPackages,
    removePackageInstallation,
    validatePackageInstallations
} from '../services/installedPackagesStore';
import { fetchWithTimeout } from '../utils/network';
import { getAuthManager } from '../services/auth/authService';
import { PANEL_BASE_URL } from '../../shared/constants';
import * as versionManager from '../versionManager';

interface ApiFetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface ApiFetchResult {
    ok: boolean;
    status: number;
    body: unknown;
    error?: string;
}

interface DiskUsageEntry {
    type: 'livery' | 'package';
    liveryId?: string;
    slug?: string;
    name: string;
    folderName: string;
    installPath: string;
    simulator: string;
    resolution?: string;
    sizeBytes: number;
    missing?: boolean;
}

interface DriveStats {
    mountPath: string;
    label: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    bavBytes: number;
    associatedSimulators: string[];
}

interface DiskUsageReport {
    entries: DiskUsageEntry[];
    totalBytes: number;
    bySimulator: Record<string, number>;
    drives: DriveStats[];
    scannedAt: number;
}

function normalizeDriveKey(rawRoot: string): string {
    return rawRoot.replace(/[\\/]+$/, '').toLowerCase();
}

function driveLabelFor(rawRoot: string): string {
    const trimmed = rawRoot.replace(/[\\/]+$/, '');
    if (/^[a-zA-Z]:$/.test(trimmed)) {
        return `${trimmed.toUpperCase()}\\`;
    }
    return trimmed || rawRoot;
}

async function collectDriveStats(settings: Settings, entries: DiskUsageEntry[]): Promise<DriveStats[]> {
    const candidates: Array<{ simLabel: string; simPath: string }> = [];
    if (settings.msfs2020Path) candidates.push({ simLabel: 'MSFS 2020', simPath: settings.msfs2020Path });
    if (settings.msfs2024Path) candidates.push({ simLabel: 'MSFS 2024', simPath: settings.msfs2024Path });

    const driveMap = new Map<string, DriveStats>();

    for (const { simLabel, simPath } of candidates) {
        try {
            if (!(await fs.pathExists(simPath))) continue;
            const parsed = path.parse(simPath);
            const key = normalizeDriveKey(parsed.root);
            if (driveMap.has(key)) {
                const drive = driveMap.get(key)!;
                if (!drive.associatedSimulators.includes(simLabel)) {
                    drive.associatedSimulators.push(simLabel);
                }
                continue;
            }
            const stats = await fs.promises.statfs(simPath);
            const totalBytes = Number(stats.blocks) * Number(stats.bsize);
            const freeBytes = Number(stats.bavail) * Number(stats.bsize);
            driveMap.set(key, {
                mountPath: parsed.root || simPath,
                label: driveLabelFor(parsed.root || simPath),
                totalBytes,
                freeBytes,
                usedBytes: Math.max(totalBytes - freeBytes, 0),
                bavBytes: 0,
                associatedSimulators: [simLabel]
            });
        } catch (error) {
            console.warn('Failed to read drive stats for', simPath, error);
        }
    }

    entries.forEach((entry) => {
        if (entry.missing || !entry.installPath) return;
        try {
            const key = normalizeDriveKey(path.parse(entry.installPath).root);
            const drive = driveMap.get(key);
            if (drive) drive.bavBytes += entry.sizeBytes;
        } catch {
            // ignore
        }
    });

    return Array.from(driveMap.values()).sort((a, b) => b.totalBytes - a.totalBytes);
}

async function calculateFolderSize(folderPath: string): Promise<number> {
    let total = 0;
    let entries;
    try {
        entries = await fs.readdir(folderPath, { withFileTypes: true });
    } catch {
        return 0;
    }

    await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(folderPath, entry.name);
            try {
                if (entry.isDirectory()) {
                    total += await calculateFolderSize(entryPath);
                } else if (entry.isFile()) {
                    const stat = await fs.stat(entryPath);
                    total += stat.size;
                }
            } catch {
                // Inaccessible file/folder — skip it
            }
        })
    );

    return total;
}

let handlersRegistered = false;

export function registerIpcHandlers(appContext: AppContext) {
    if (handlersRegistered) {
        return;
    }

    ipcMain.handle('get-file-size', async (_event, url: string) => {
        try {
            const response = await fetchWithTimeout(url, { method: 'HEAD' }, 5000);
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
                const sizeInBytes = parseInt(contentLength, 10);
                return formatFileSize(sizeInBytes);
            }
            return 'Unknown';
        } catch (error) {
            console.error('Error getting file size:', error);
            return 'Unknown';
        }
    });

    ipcMain.handle('fetch-liveries', async () => {
        console.log('Fetching liveries from remote server...');
        return fetchRemoteLiveryList();
    });

    // Single authenticated-HTTP entry point for the renderer: the main process
    // attaches the bearer token and transparently refreshes it on 401.
    ipcMain.handle('api-fetch', async (_event, url: string, init?: ApiFetchInit): Promise<ApiFetchResult> => {
        if (typeof url !== 'string' || !url.startsWith(`${PANEL_BASE_URL}/`)) {
            return { ok: false, status: 0, body: null, error: 'URL not allowed' };
        }
        try {
            const response = await getAuthManager().authorizedFetch(url, {
                method: init?.method ?? 'GET',
                headers: init?.headers,
                body: init?.body
            });
            const text = await response.text();
            let body: unknown = null;
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch {
                    body = text;
                }
            }
            return { ok: response.ok, status: response.status, body };
        } catch (error) {
            return { ok: false, status: 0, body: null, error: (error as Error).message };
        }
    });

    ipcMain.handle('auth-get-session', async () => {
        try {
            const manager = getAuthManager();
            // Gate on the one-time launch restore, but answer with the current
            // session — a deep-link sign-in may have arrived since.
            await manager.initialize();
            return manager.getSessionSnapshot();
        } catch (error) {
            console.error('Failed to resolve auth session:', (error as Error).message);
            return null;
        }
    });

    ipcMain.handle('auth-sign-out', async () => {
        try {
            await getAuthManager().signOut();
        } catch (error) {
            console.error('Failed to clear auth session:', (error as Error).message);
        }
    });

    ipcMain.handle(
        'download-livery',
        async (
            _event,
            downloadEndpoint: string,
            liveryId: string,
            liveryName: string,
            liveryDeveloper: string,
            aircraft: string,
            simulator: 'MSFS2020' | 'MSFS2024',
            resolution: string
        ): Promise<DownloadResult> => {
        const simulatorActive = await isSimulatorRunning();
        if (simulatorActive) {
            return {
                success: false,
                error: 'Microsoft Flight Simulator appears to be running. Please close the simulator before installing liveries.'
            } satisfies DownloadResult;
        }

        const settings = loadSettings();
        return downloadAndInstallLivery({
                downloadEndpoint,
                liveryId,
                liveryName,
                liveryDeveloper,
                aircraft,
                simulator,
                resolution,
                settings,
                appContext
        });
        }
    );

    ipcMain.handle('cancel-download', async (_event, liveryId: string) => {
        return cancelDownload(liveryId);
    });

    ipcMain.handle(
        'download-package',
        async (
            _event,
            downloadEndpoint: string,
            slug: string,
            title: string,
            version: string | null,
            simulator: 'MSFS2020' | 'MSFS2024'
        ): Promise<DownloadResult> => {
            const simulatorActive = await isSimulatorRunning();
            if (simulatorActive) {
                return {
                    success: false,
                    error: 'Microsoft Flight Simulator appears to be running. Please close the simulator before installing packages.'
                } satisfies DownloadResult;
            }

            const settings = loadSettings();
            return downloadAndInstallPackage({
                downloadEndpoint,
                slug,
                title,
                version,
                simulator,
                settings,
                appContext
            });
        }
    );

    ipcMain.handle('cancel-package-download', async (_event, slug: string) => {
        return cancelPackageDownload(slug);
    });

    ipcMain.handle('get-installed-packages', async () => {
        try {
            await validatePackageInstallations();
            return getInstalledPackages();
        } catch (error) {
            console.error('Error getting installed packages:', error);
            return [];
        }
    });

    ipcMain.handle('uninstall-package', async (_event, slug: string, simulator: string) => {
        try {
            const record = await removePackageInstallation(slug, simulator);
            if (!record) return { success: true };
            if (await fs.pathExists(record.installPath)) {
                await fs.remove(record.installPath);
            }
            return { success: true };
        } catch (error) {
            console.error('Failed to uninstall package:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('detect-sim-paths', async () => {
        return detectSimulatorPaths();
    });

    ipcMain.handle('uninstall-livery', async (_event, liveryPath: string) => {
        try {
            console.log('Uninstalling livery from:', liveryPath);

            // Remove from our local store first
            await removeInstallationByPath(liveryPath);

            if (await fs.pathExists(liveryPath)) {
                await fs.remove(liveryPath);
                console.log('Successfully uninstalled livery');
                return { success: true };
            }
            return { success: true }; // Already removed, still success
        } catch (error) {
            console.error('Uninstall error:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('get-settings', () => loadSettings());
    ipcMain.handle('save-settings', (_event, settings: Settings) => saveSettings(settings));

    ipcMain.handle('open-directory-dialog', async () => {
        const options: OpenDialogOptions = {
            properties: ['openDirectory'],
            title: 'Select MSFS Community Folder'
        };

        const targetWindow = appContext.getMainWindow();
        const result = targetWindow ? await dialog.showOpenDialog(targetWindow, options) : await dialog.showOpenDialog(options);
        return result.filePaths[0] || null;
    });

    ipcMain.handle('get-liveries-folders', async (_event, basePath: string) => {
        try {
            if (!(await fs.pathExists(basePath))) return [];

            const items = await fs.readdir(basePath);
            const folders: string[] = [];

            for (const item of items) {
                if (item.startsWith('orbx-') || item.startsWith('asobo-') || item === 'Official' || item === 'OneStore') {
                    continue;
                }

                const itemPath = path.join(basePath, item);
                try {
                    const stat = await fs.stat(itemPath);
                    if (stat.isDirectory()) {
                        folders.push(item);
                    }
                } catch {
                    console.log(`Skipping inaccessible folder: ${item}`);
                }
            }

            return folders;
        } catch (error) {
            console.error('Error reading liveries folders:', error);
            return [];
        }
    });

    ipcMain.handle('path-exists', async (_event, targetPath: string) => fs.pathExists(targetPath));

    ipcMain.handle('get-local-version', (_event, liveryId: string) => versionManager.getLocalVersion(liveryId));
    ipcMain.handle('set-local-version', (_event, liveryId: string, version: string) => versionManager.setLocalVersion(liveryId, version));

    ipcMain.handle('get-installed-liveries', async () => {
        try {
            // First validate that recorded installations still exist on disk
            await validateInstallations();
            // Return all recorded installations
            return getInstalledLiveries();
        } catch (error) {
            console.error('Error getting installed liveries:', error);
            return [];
        }
    });

    ipcMain.handle('set-taskbar-progress', (_event, progress: number, mode?: 'normal' | 'indeterminate' | 'paused' | 'error' | 'none') => {
        const targetWindow = appContext.getMainWindow();
        if (!targetWindow || targetWindow.isDestroyed()) return;

        if (progress < 0) {
            targetWindow.setProgressBar(-1); // Clear progress
            targetWindow.setTitle('BAVirtual Livery Manager'); // Reset title
            return;
        }

        const progressValue = Math.min(Math.max(progress / 100, 0), 1);
        
        // Set progress bar mode based on the mode parameter
        if (mode) {
            targetWindow.setProgressBar(progressValue, { mode });
        } else {
            targetWindow.setProgressBar(progressValue);
        }
    });

    ipcMain.handle('set-window-title', (_event, title: string) => {
        const targetWindow = appContext.getMainWindow();
        if (!targetWindow || targetWindow.isDestroyed()) return;

        targetWindow.setTitle(title);
    });

    ipcMain.handle('set-titlebar-overlay', (_event, color: string, symbolColor: string, isDark: boolean) => {
        const targetWindow = appContext.getMainWindow();
        if (!targetWindow || targetWindow.isDestroyed()) return;

        nativeTheme.themeSource = isDark ? 'dark' : 'light';
        targetWindow.setTitleBarOverlay({ color, symbolColor });
    });

    ipcMain.handle('get-disk-usage', async (): Promise<DiskUsageReport> => {
        try {
            await validateInstallations();
            await validatePackageInstallations();

            const [liveries, packages] = await Promise.all([
                getInstalledLiveries(),
                getInstalledPackages()
            ]);

            const liveryEntries: DiskUsageEntry[] = await Promise.all(
                liveries.map(async (record) => {
                    const exists = await fs.pathExists(record.installPath);
                    const sizeBytes = exists ? await calculateFolderSize(record.installPath) : 0;
                    return {
                        type: 'livery' as const,
                        liveryId: record.liveryId,
                        name: record.originalName,
                        folderName: record.folderName,
                        installPath: record.installPath,
                        simulator: record.simulator,
                        resolution: record.resolution,
                        sizeBytes,
                        missing: !exists
                    };
                })
            );

            const packageEntries: DiskUsageEntry[] = await Promise.all(
                packages.map(async (record) => {
                    const exists = await fs.pathExists(record.installPath);
                    const sizeBytes = exists ? await calculateFolderSize(record.installPath) : 0;
                    return {
                        type: 'package' as const,
                        slug: record.slug,
                        name: record.title,
                        folderName: record.folderName,
                        installPath: record.installPath,
                        simulator: record.simulator,
                        sizeBytes,
                        missing: !exists
                    };
                })
            );

            const entries = [...liveryEntries, ...packageEntries];
            const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
            const bySimulator: Record<string, number> = {};
            entries.forEach((entry) => {
                bySimulator[entry.simulator] = (bySimulator[entry.simulator] ?? 0) + entry.sizeBytes;
            });

            const settings = loadSettings();
            const drives = await collectDriveStats(settings, entries);

            return {
                entries,
                totalBytes,
                bySimulator,
                drives,
                scannedAt: Date.now()
            };
        } catch (error) {
            console.error('Failed to calculate disk usage:', error);
            return { entries: [], totalBytes: 0, bySimulator: {}, drives: [], scannedAt: Date.now() };
        }
    });

    ipcMain.handle('open-path', async (_event, targetPath: string): Promise<{ success: boolean; error?: string }> => {
        if (!targetPath) {
            return { success: false, error: 'No path provided.' };
        }
        try {
            if (!(await fs.pathExists(targetPath))) {
                return { success: false, error: 'The folder no longer exists at that path.' };
            }
            const result = await shell.openPath(targetPath);
            if (result) {
                return { success: false, error: result };
            }
            return { success: true };
        } catch (error) {
            console.error('Failed to open path:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    let metaCancelRequested = false;

    const META_MANIFEST_KEY_ORDER = [
        'dependencies', 'content_type', 'title', 'manufacturer', 'package_version',
        'minimum_game_version', 'minimum_compatibility_version', 'builder', 'creator',
        'managerData',
    ];
    const META_MANAGER_KEY_ORDER = [
        'name', 'aircraft', 'developer', 'engine', 'year', 'category',
        'simulator', 'resolution', 'requiredPackages',
    ];

    function metaOrderManifest(raw: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const key of META_MANIFEST_KEY_ORDER) {
            if (key === 'dependencies') {
                out[key] = Array.isArray(raw[key]) ? raw[key] : [];
                continue;
            }
            if (!(key in raw)) continue;
            if (key === 'managerData' && raw[key] && typeof raw[key] === 'object') {
                const mgr = raw[key] as Record<string, unknown>;
                const orderedMgr: Record<string, unknown> = {};
                for (const mk of META_MANAGER_KEY_ORDER) {
                    if (mk in mgr && mgr[mk] != null && mgr[mk] !== '') orderedMgr[mk] = mgr[mk];
                }
                out[key] = orderedMgr;
            } else {
                out[key] = raw[key];
            }
        }
        return out;
    }

    async function metaFindLiveryDirsRecursively(dir: string): Promise<string[]> {
        if (await fs.pathExists(path.join(dir, 'manifest.json'))) return [dir];
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
        const results: string[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const found = await metaFindLiveryDirsRecursively(path.join(dir, entry.name));
            results.push(...found);
        }
        return results;
    }

    async function metaFindLayoutDirsRecursively(dir: string): Promise<string[]> {
        if (await fs.pathExists(path.join(dir, 'layout.json'))) return [dir];
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
        const results: string[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const found = await metaFindLayoutDirsRecursively(path.join(dir, entry.name));
            results.push(...found);
        }
        return results;
    }

    async function metaFindFileRecursively(dir: string, filename: string): Promise<string | null> {
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return null; }
        const lowerFilename = filename.toLowerCase();
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = await metaFindFileRecursively(fullPath, filename);
                if (found) return found;
            } else if (entry.name.toLowerCase() === lowerFilename) {
                return fullPath;
            }
        }
        return null;
    }

    async function metaFindAllFilesRecursively(dir: string, filename: string): Promise<string[]> {
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return []; }
        const lowerFilename = filename.toLowerCase();
        const results: string[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = await metaFindAllFilesRecursively(fullPath, filename);
                results.push(...found);
            } else if (entry.name.toLowerCase() === lowerFilename) {
                results.push(fullPath);
            }
        }
        return results;
    }

    function metaExtractAtcId(content: string): string | null {
        const patterns = [
            /atc_id\s*=\s*"([^"]+)"/,
            /atc_id\s*=\s*'([^']+)'/,
            /atc_id\s*=\s*([^;\s\r\n]+)/,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) return match[1].trim();
        }
        return null;
    }

    async function metaFindDirMatching(
        dir: string,
        predicate: (name: string) => boolean,
        depth = 10
    ): Promise<string | null> {
        if (depth <= 0) return null;
        let entries;
        try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return null; }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (predicate(entry.name)) return path.join(dir, entry.name);
            const found = await metaFindDirMatching(path.join(dir, entry.name), predicate, depth - 1);
            if (found) return found;
        }
        return null;
    }

    async function metaResolveAssetTarget(liveryDir: string, assetType: string): Promise<string | null> {
        if (assetType === 'manager-thumbnail') return liveryDir;
        const fs20Dir = await metaFindDirMatching(liveryDir, (name) => /^texture\..+/i.test(name));
        if (assetType === 'ingame-thumbnail') {
            if (fs20Dir) return fs20Dir;
            return await metaFindDirMatching(liveryDir, (name) => name.toLowerCase() === 'thumbnail');
        }
        if (assetType === 'texture') {
            if (fs20Dir) return fs20Dir;
            return await metaFindDirMatching(liveryDir, (name) => name.toLowerCase() === 'texture');
        }
        return null;
    }

    function metaLogTimestamp(): string {
        return `[${new Date().toLocaleTimeString('en-GB', { hour12: false })}]`;
    }

    function metaLog(msg: string) {
        const win = appContext.getMainWindow();
        if (win && !win.isDestroyed()) win.webContents.send('meta-finaliser-log', `${metaLogTimestamp()} ${msg}`);
    }

    ipcMain.handle('meta-select-livery-directories', async () => {
        const win = appContext.getMainWindow();
        const opts = {
            title: 'Select Livery Directories',
            properties: ['openDirectory', 'multiSelections'] as Array<'openDirectory' | 'multiSelections'>,
            buttonLabel: 'Add Liveries',
        };
        const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle('meta-scan-parent-directory', async () => {
        const win = appContext.getMainWindow();
        const opts = {
            title: 'Select Parent Directory to Scan',
            properties: ['openDirectory'] as Array<'openDirectory'>,
            buttonLabel: 'Scan',
        };
        const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        if (result.canceled || result.filePaths.length === 0) return [];
        return await metaFindLiveryDirsRecursively(result.filePaths[0]);
    });

    ipcMain.handle('meta-read-manifest', async (_event, dirPath: string) => {
        const manifestPath = path.join(dirPath, 'manifest.json');
        try {
            if (!(await fs.pathExists(manifestPath))) return null;
            return await fs.readJson(manifestPath);
        } catch { return null; }
    });

    ipcMain.handle(
        'meta-write-manifests',
        async (_event, updates: Array<{ dirPath: string; manifest: Record<string, unknown> }>) => {
            const errors: string[] = [];
            for (const { dirPath, manifest } of updates) {
                try {
                    await fs.writeJson(path.join(dirPath, 'manifest.json'), metaOrderManifest(manifest), { spaces: 2 });
                } catch (err) {
                    errors.push(`${path.basename(dirPath)}: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            return { success: errors.length === 0, errors };
        }
    );

    ipcMain.handle('meta-find-registration', async (_event, dirPath: string) => {
        for (const cfgName of ['livery.cfg', 'aircraft.cfg']) {
            const cfgPath = await metaFindFileRecursively(dirPath, cfgName);
            if (!cfgPath) continue;
            try {
                const content = await fs.readFile(cfgPath, 'utf-8');
                const atcId = metaExtractAtcId(content);
                if (atcId) return atcId;
            } catch { /* try next */ }
        }
        return null;
    });

    ipcMain.handle('meta-select-workspace-directory', async () => {
        const win = appContext.getMainWindow();
        const opts = {
            title: 'Select Workspace Directory',
            properties: ['openDirectory'] as Array<'openDirectory'>,
            buttonLabel: 'Select Workspace',
        };
        const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('meta-run-layout-generator', async (_event, workspaceDir: string) => {
        metaCancelRequested = false;
        const layoutDirs = await metaFindLayoutDirsRecursively(workspaceDir);
        if (layoutDirs.length === 0) { metaLog('No packages with layout.json found in workspace'); return false; }

        metaLog(`Found ${layoutDirs.length} package(s) — generating layouts...`);
        let success = 0;
        let failed = 0;

        for (const dir of layoutDirs) {
            if (metaCancelRequested) { metaLog('Cancelled'); break; }
            metaLog(`Processing: ${path.basename(dir)}`);
            try {
                await generateLayout(dir, { force: true, quiet: true });
                metaLog('  ✓ layout.json regenerated');
                success++;
            } catch (err) {
                metaLog(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
                failed++;
            }
        }

        if (!metaCancelRequested) metaLog(`Layout generation done — ${success} succeeded, ${failed} failed`);
        return !metaCancelRequested && failed === 0;
    });

    ipcMain.handle('meta-run-zip-packages', async (_event, workspaceDir: string) => {
        metaCancelRequested = false;
        const packageDirs = await metaFindLayoutDirsRecursively(workspaceDir);
        if (packageDirs.length === 0) { metaLog('No packages with layout.json found in workspace'); return false; }

        metaLog(`Found ${packageDirs.length} package(s) — zipping...`);
        let success = 0;
        let failed = 0;

        for (const dirPath of packageDirs) {
            if (metaCancelRequested) { metaLog('Cancelled'); break; }
            const name = path.basename(dirPath);
            const zipPath = path.join(path.dirname(dirPath), `${name}.zip`);
            metaLog(`Zipping: ${name}`);
            try {
                await new Promise<void>((resolve, reject) => {
                    const output = fs.createWriteStream(zipPath);
                    const archive = archiver('zip', { zlib: { level: 9 } });
                    output.on('close', resolve);
                    archive.on('error', reject);
                    archive.pipe(output);
                    archive.directory(dirPath, false);
                    archive.finalize();
                });
                if (!metaCancelRequested) { metaLog(`  ✓ ${name}.zip → ${path.dirname(dirPath)}`); success++; }
            } catch (err) {
                metaLog(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
                failed++;
            }
        }

        if (!metaCancelRequested) metaLog(`Zip packaging done — ${success} succeeded, ${failed} failed`);
        return !metaCancelRequested && failed === 0;
    });

    ipcMain.handle('meta-cancel-finaliser', () => {
        metaCancelRequested = true;
        metaLog('Cancelling...');
    });

    ipcMain.handle(
        'meta-select-asset-files',
        async (_event, filters: { name: string; extensions: string[] }[], multiSelect: boolean) => {
            const properties: Array<'openFile' | 'multiSelections'> = ['openFile'];
            if (multiSelect) properties.push('multiSelections');
            const win = appContext.getMainWindow();
            const result = win
                ? await dialog.showOpenDialog(win, { properties, filters })
                : await dialog.showOpenDialog({ properties, filters });
            return result.canceled ? [] : result.filePaths;
        }
    );

    ipcMain.handle('meta-scan-texture-cfg', async (_event, liveryDirs: string[]) => {
        const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
        const results = [];
        for (const liveryDir of liveryDirs) {
            const dirName = path.basename(liveryDir);
            const cfgPaths = await metaFindAllFilesRecursively(liveryDir, 'texture.cfg');
            let content: string | null = null;
            let allMatch = true;
            if (cfgPaths.length > 0) {
                try { content = normalize(await fs.readFile(cfgPaths[0], 'utf-8')); } catch { /* ignore */ }
                for (const p of cfgPaths.slice(1)) {
                    try {
                        const other = normalize(await fs.readFile(p, 'utf-8'));
                        if (other !== content) { allMatch = false; break; }
                    } catch { allMatch = false; break; }
                }
            }
            results.push({ liveryDir, dirName, cfgPaths, content, allMatch });
        }
        return results;
    });

    ipcMain.handle('meta-write-texture-cfg', async (_event, liveryDirs: string[], content: string) => {
        const results = [];
        for (const liveryDir of liveryDirs) {
            const dirName = path.basename(liveryDir);
            const cfgPaths = await metaFindAllFilesRecursively(liveryDir, 'texture.cfg');
            if (cfgPaths.length > 0) {
                const errors: string[] = [];
                for (const p of cfgPaths) {
                    try { await fs.writeFile(p, content, 'utf-8'); }
                    catch (err) { errors.push(err instanceof Error ? err.message : String(err)); }
                }
                results.push({ liveryDir, dirName, success: errors.length === 0, path: cfgPaths[0], error: errors[0] });
            } else {
                const targetDir = await metaResolveAssetTarget(liveryDir, 'texture') ?? liveryDir;
                const newPath = path.join(targetDir, 'texture.cfg');
                try {
                    await fs.ensureDir(targetDir);
                    await fs.writeFile(newPath, content, 'utf-8');
                    results.push({ liveryDir, dirName, success: true, path: newPath });
                } catch (err) {
                    results.push({ liveryDir, dirName, success: false, path: null, error: err instanceof Error ? err.message : String(err) });
                }
            }
        }
        return results;
    });

    ipcMain.handle(
        'meta-copy-asset-to-liveries',
        async (
            _event,
            filePaths: string[],
            liveryDirs: string[],
            assetType: 'manager-thumbnail' | 'ingame-thumbnail' | 'texture'
        ) => {
            const results: Array<{ liveryName: string; success: boolean; targetDir: string | null; error?: string }> = [];
            for (const liveryDir of liveryDirs) {
                const liveryName = path.basename(liveryDir);
                const targetDir = await metaResolveAssetTarget(liveryDir, assetType);
                if (!targetDir) {
                    results.push({ liveryName, success: false, targetDir: null, error: 'Target folder not found' });
                    continue;
                }
                try {
                    for (const filePath of filePaths) {
                        await fs.copy(filePath, path.join(targetDir, path.basename(filePath)), { overwrite: true });
                    }
                    results.push({ liveryName, success: true, targetDir });
                } catch (err) {
                    results.push({ liveryName, success: false, targetDir, error: err instanceof Error ? err.message : String(err) });
                }
            }
            return results;
        }
    );

    handlersRegistered = true;
}

function formatFileSize(bytes: number) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
