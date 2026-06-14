import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../src/types/electron-api';

const INVOKE_CHANNELS = [
    'fetch-liveries',
    'download-livery',
    'download-package',
    'cancel-package-download',
    'get-installed-packages',
    'uninstall-package',
    'cancel-download',
    'uninstall-livery',
    'get-settings',
    'save-settings',
    'open-directory-dialog',
    'open-external',
    'get-file-size',
    'get-liveries-folders',
    'path-exists',
    'get-local-version',
    'set-local-version',
    'get-installed-liveries',
    'detect-sim-paths',
    'auth-open-panel',
    'set-taskbar-progress',
    'set-window-title',
    'check-for-app-update',
    'download-app-update',
    'install-app-update',
    'get-app-version',
    'get-disk-usage',
    'open-path',
    'set-titlebar-overlay',

    'meta-select-livery-directories',
    'meta-scan-parent-directory',
    'meta-read-manifest',
    'meta-write-manifests',
    'meta-find-registration',
    'meta-select-workspace-directory',
    'meta-run-layout-generator',
    'meta-run-zip-packages',
    'meta-cancel-finaliser',
    'meta-select-asset-files',
    'meta-copy-asset-to-liveries',
    'meta-scan-texture-cfg',
    'meta-write-texture-cfg',
] as const;

const ON_CHANNELS = ['download-progress', 'package-progress', 'auth-token', 'app-update-status', 'meta-finaliser-log'] as const;

type InvokeChannel = typeof INVOKE_CHANNELS[number];
type OnChannel = typeof ON_CHANNELS[number];

function ensureInvokeChannel(channel: InvokeChannel) {
    if (!INVOKE_CHANNELS.includes(channel)) {
        throw new Error(`Invalid invoke channel: ${channel}`);
    }
}

function ensureOnChannel(channel: OnChannel) {
    if (!ON_CHANNELS.includes(channel)) {
        throw new Error(`Invalid on channel: ${channel}`);
    }
}

const api: ElectronAPI = {
    fetchLiveries: (authToken?: string | null) => {
        ensureInvokeChannel('fetch-liveries');
        return ipcRenderer.invoke('fetch-liveries', authToken ?? null);
    },
    downloadLivery: (downloadEndpoint, liveryId, liveryName, liveryDeveloper, aircraft, simulator, resolution, authToken) => {
        ensureInvokeChannel('download-livery');
        return ipcRenderer.invoke('download-livery', downloadEndpoint, liveryId, liveryName, liveryDeveloper, aircraft, simulator, resolution, authToken ?? null);
    },
    cancelDownload: (liveryId) => {
        ensureInvokeChannel('cancel-download');
        return ipcRenderer.invoke('cancel-download', liveryId);
    },
    downloadPackage: (downloadEndpoint, slug, title, version, simulator, authToken) => {
        ensureInvokeChannel('download-package');
        return ipcRenderer.invoke('download-package', downloadEndpoint, slug, title, version ?? null, simulator, authToken ?? null);
    },
    cancelPackageDownload: (slug) => {
        ensureInvokeChannel('cancel-package-download');
        return ipcRenderer.invoke('cancel-package-download', slug);
    },
    getInstalledPackages: () => {
        ensureInvokeChannel('get-installed-packages');
        return ipcRenderer.invoke('get-installed-packages');
    },
    uninstallPackage: (slug, simulator) => {
        ensureInvokeChannel('uninstall-package');
        return ipcRenderer.invoke('uninstall-package', slug, simulator);
    },
    uninstallLivery: (installPath) => {
        ensureInvokeChannel('uninstall-livery');
        return ipcRenderer.invoke('uninstall-livery', installPath);
    },
    getSettings: () => {
        ensureInvokeChannel('get-settings');
        return ipcRenderer.invoke('get-settings');
    },
    saveSettings: (settings) => {
        ensureInvokeChannel('save-settings');
        return ipcRenderer.invoke('save-settings', settings);
    },
    detectSimPaths: () => {
        ensureInvokeChannel('detect-sim-paths');
        return ipcRenderer.invoke('detect-sim-paths');
    },
    openDirectoryDialog: () => {
        ensureInvokeChannel('open-directory-dialog');
        return ipcRenderer.invoke('open-directory-dialog');
    },
    openExternalLink: (targetUrl: string) => {
        ensureInvokeChannel('open-external');
        return ipcRenderer.invoke('open-external', targetUrl);
    },
    getFileSize: (url) => {
        ensureInvokeChannel('get-file-size');
        return ipcRenderer.invoke('get-file-size', url);
    },
    getLiveriesFolders: (basePath) => {
        ensureInvokeChannel('get-liveries-folders');
        return ipcRenderer.invoke('get-liveries-folders', basePath);
    },
    pathExists: (targetPath) => {
        ensureInvokeChannel('path-exists');
        return ipcRenderer.invoke('path-exists', targetPath);
    },
    getLocalVersion: (liveryId) => {
        ensureInvokeChannel('get-local-version');
        return ipcRenderer.invoke('get-local-version', liveryId);
    },
    setLocalVersion: (liveryId, version) => {
        ensureInvokeChannel('set-local-version');
        return ipcRenderer.invoke('set-local-version', liveryId, version);
    },
    getInstalledLiveries: () => {
        ensureInvokeChannel('get-installed-liveries');
        return ipcRenderer.invoke('get-installed-liveries');
    },
    openPanelAuth: (url) => {
        ensureInvokeChannel('auth-open-panel');
        return ipcRenderer.invoke('auth-open-panel', url);
    },
    setTaskbarProgress: (progress, mode) => {
        ensureInvokeChannel('set-taskbar-progress');
        return ipcRenderer.invoke('set-taskbar-progress', progress, mode);
    },
    setWindowTitle: (title) => {
        ensureInvokeChannel('set-window-title');
        return ipcRenderer.invoke('set-window-title', title);
    },
    setTitleBarOverlay: (color: string, symbolColor: string, isDark: boolean) => {
        ensureInvokeChannel('set-titlebar-overlay');
        return ipcRenderer.invoke('set-titlebar-overlay', color, symbolColor, isDark);
    },
    onDownloadProgress: (callback) => {
        ensureOnChannel('download-progress');
        ipcRenderer.removeAllListeners('download-progress');

        if (callback && typeof callback === 'function') {
            ipcRenderer.on('download-progress', (_event, data) => {
                callback(data);
            });
        }
    },
    removeAllDownloadProgressListeners: () => {
        ipcRenderer.removeAllListeners('download-progress');
    },
    onPackageProgress: (callback) => {
        ensureOnChannel('package-progress');
        ipcRenderer.removeAllListeners('package-progress');

        if (callback && typeof callback === 'function') {
            ipcRenderer.on('package-progress', (_event, data) => {
                callback(data);
            });
        }
    },
    removeAllPackageProgressListeners: () => {
        ipcRenderer.removeAllListeners('package-progress');
    },
    onAuthToken: (callback) => {
        ensureOnChannel('auth-token');
        ipcRenderer.removeAllListeners('auth-token');

        if (callback && typeof callback === 'function') {
            ipcRenderer.on('auth-token', (_event, payload) => {
                callback(payload);
            });
        }
    },
    checkForAppUpdate: () => {
        ensureInvokeChannel('check-for-app-update');
        return ipcRenderer.invoke('check-for-app-update');
    },
    downloadAppUpdate: () => {
        ensureInvokeChannel('download-app-update');
        return ipcRenderer.invoke('download-app-update');
    },
    installAppUpdate: () => {
        ensureInvokeChannel('install-app-update');
        return ipcRenderer.invoke('install-app-update');
    },
    getAppVersion: () => {
        ensureInvokeChannel('get-app-version');
        return ipcRenderer.invoke('get-app-version');
    },
    onAppUpdateStatus: (callback) => {
        ensureOnChannel('app-update-status');
        ipcRenderer.removeAllListeners('app-update-status');

        if (callback && typeof callback === 'function') {
            ipcRenderer.on('app-update-status', (_event, data) => {
                callback(data);
            });
        }
    },
    removeAppUpdateListeners: () => {
        ipcRenderer.removeAllListeners('app-update-status');
    },
    getDiskUsage: () => {
        ensureInvokeChannel('get-disk-usage');
        return ipcRenderer.invoke('get-disk-usage');
    },
    openPath: (targetPath: string) => {
        ensureInvokeChannel('open-path');
        return ipcRenderer.invoke('open-path', targetPath);
    },

    metaSelectLiveryDirectories: () => {
        ensureInvokeChannel('meta-select-livery-directories');
        return ipcRenderer.invoke('meta-select-livery-directories');
    },
    metaScanParentDirectory: () => {
        ensureInvokeChannel('meta-scan-parent-directory');
        return ipcRenderer.invoke('meta-scan-parent-directory');
    },
    metaReadManifest: (dirPath: string) => {
        ensureInvokeChannel('meta-read-manifest');
        return ipcRenderer.invoke('meta-read-manifest', dirPath);
    },
    metaWriteManifests: (updates: Array<{ dirPath: string; manifest: Record<string, unknown> }>) => {
        ensureInvokeChannel('meta-write-manifests');
        return ipcRenderer.invoke('meta-write-manifests', updates);
    },
    metaFindRegistration: (dirPath: string) => {
        ensureInvokeChannel('meta-find-registration');
        return ipcRenderer.invoke('meta-find-registration', dirPath);
    },
    metaSelectWorkspaceDirectory: () => {
        ensureInvokeChannel('meta-select-workspace-directory');
        return ipcRenderer.invoke('meta-select-workspace-directory');
    },
    metaRunLayoutGenerator: (workspaceDir: string) => {
        ensureInvokeChannel('meta-run-layout-generator');
        return ipcRenderer.invoke('meta-run-layout-generator', workspaceDir);
    },
    metaRunZipPackages: (workspaceDir: string) => {
        ensureInvokeChannel('meta-run-zip-packages');
        return ipcRenderer.invoke('meta-run-zip-packages', workspaceDir);
    },
    metaCancelFinaliser: () => {
        ensureInvokeChannel('meta-cancel-finaliser');
        return ipcRenderer.invoke('meta-cancel-finaliser');
    },
    metaSelectAssetFiles: (filters: { name: string; extensions: string[] }[], multiSelect: boolean) => {
        ensureInvokeChannel('meta-select-asset-files');
        return ipcRenderer.invoke('meta-select-asset-files', filters, multiSelect);
    },
    metaCopyAssetToLiveries: (
        filePaths: string[],
        liveryDirs: string[],
        assetType: 'manager-thumbnail' | 'ingame-thumbnail' | 'texture'
    ) => {
        ensureInvokeChannel('meta-copy-asset-to-liveries');
        return ipcRenderer.invoke('meta-copy-asset-to-liveries', filePaths, liveryDirs, assetType);
    },
    metaScanTextureCfg: (liveryDirs: string[]) => {
        ensureInvokeChannel('meta-scan-texture-cfg');
        return ipcRenderer.invoke('meta-scan-texture-cfg', liveryDirs);
    },
    metaWriteTextureCfg: (liveryDirs: string[], content: string) => {
        ensureInvokeChannel('meta-write-texture-cfg');
        return ipcRenderer.invoke('meta-write-texture-cfg', liveryDirs, content);
    },
    onMetaFinaliserLog: (callback: (message: string) => void) => {
        ensureOnChannel('meta-finaliser-log');
        ipcRenderer.removeAllListeners('meta-finaliser-log');
        if (callback && typeof callback === 'function') {
            ipcRenderer.on('meta-finaliser-log', (_event, message: string) => callback(message));
        }
    },
    removeMetaFinaliserLogListeners: () => {
        ipcRenderer.removeAllListeners('meta-finaliser-log');
    },
};

contextBridge.exposeInMainWorld('electronAPI', api);

console.log('Preload script loaded successfully');

process.once('loaded', () => {
    console.log('Preload script initialized');
});
