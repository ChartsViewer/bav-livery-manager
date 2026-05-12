import path from 'node:path';
import fs from 'fs-extra';
import { dialog, ipcMain } from 'electron';
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
import * as versionManager from '../versionManager';

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

    ipcMain.handle('fetch-liveries', async (_event, authToken: string | null) => {
        console.log('Fetching liveries from remote server...');
        return fetchRemoteLiveryList(authToken);
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
            resolution: string,
            authToken: string | null
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
                appContext,
                authToken
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
            simulator: 'MSFS2020' | 'MSFS2024',
            authToken: string | null
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
                appContext,
                authToken
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

    handlersRegistered = true;
}

function formatFileSize(bytes: number) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
