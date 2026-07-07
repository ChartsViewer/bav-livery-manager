import { app, BrowserWindow, Menu, ipcMain, shell, nativeImage, type NativeImage } from 'electron';
import path from 'node:path';
import { URL } from 'node:url';
import fs from 'fs-extra';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import log from 'electron-log';
import { registerIpcHandlers } from './ipc/registerHandlers';
import { initAuthService, tryGetAuthManager } from './services/auth/authService';
import type { AppContext } from './types';
import { installExtension,REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

const APP_TITLE = 'BAVirtual Livery Manager';
const AUTH_PROTOCOL = 'bav-livery-manager';
const ICON_BASENAME = 'BAV-Livery-Manager';
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let mainWindow: BrowserWindow | null = null;
let pendingAuthPayload: {
    token: string;
    session?: string | null;
    role?: string | null;
    bawId?: string | null;
    pilotId?: string | null;
    fullName?: string | null;
    rank?: string | null;
    totalTime?: string | null;
    liveryId?: string | null;
} | null = null;
const isDev = process.env.NODE_ENV === 'development';
app.setName(APP_TITLE);

const appContext: AppContext = {
    getMainWindow: () => mainWindow
};

function setupAutoUpdates() {
    if (!app.isPackaged) {
        console.log('Auto updates are disabled in development mode.');
        ipcMain.handle('check-for-app-update', async () => ({ success: false, error: 'Auto updates are disabled in development mode' }));
        ipcMain.handle('download-app-update', async () => ({ success: false, error: 'Auto updates are disabled in development mode' }));
        ipcMain.handle('install-app-update', async () => ({ success: false, error: 'Auto updates are disabled in development mode' }));
        ipcMain.handle('get-app-version', () => app.getVersion());
        return;
    }

    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    const sendToRenderer = (channel: string, data?: unknown) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    };

    const resetProgress = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setProgressBar(-1);
        }
    };

    autoUpdater.on('error', (error: Error) => {
        log.error('Auto update error:', error);
        resetProgress();
        sendToRenderer('app-update-status', {
            status: 'error',
            error: error.message
        });
    });

    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for application updates...');
        sendToRenderer('app-update-status', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
        log.info('Update available:', info.version);
        sendToRenderer('app-update-status', {
            status: 'available',
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        });
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
        log.info('No updates available. Current version:', info.version);
        resetProgress();
        sendToRenderer('app-update-status', {
            status: 'not-available',
            version: info.version
        });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setProgressBar(progress.percent / 100, { mode: 'normal' });
        }
        sendToRenderer('app-update-status', {
            status: 'downloading',
            percent: progress.percent,
            bytesPerSecond: progress.bytesPerSecond,
            transferred: progress.transferred,
            total: progress.total
        });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
        log.info('Update downloaded, will install on quit.', info.version);
        resetProgress();
        sendToRenderer('app-update-status', {
            status: 'downloaded',
            version: info.version
        });
    });

    // IPC handlers for manual update control
    ipcMain.handle('check-for-app-update', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, version: result?.updateInfo?.version };
        } catch (error) {
            log.error('Manual update check failed:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('download-app-update', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch (error) {
            log.error('Download update failed:', error);
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('install-app-update', () => {
        autoUpdater.quitAndInstall(false, true);
    });

    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    // Initial check on startup
    autoUpdater
        .checkForUpdates()
        .catch((error: Error) => log.error('Failed to check for updates on startup:', error));

    // Periodic background checks
    setInterval(() => {
        autoUpdater
            .checkForUpdates()
            .catch((error: Error) => log.error('Failed to check for updates:', error));
    }, UPDATE_CHECK_INTERVAL_MS);
}

function getRendererPath(): string {
    const distPath = path.resolve(__dirname, '..', '..', 'dist', 'index.html');
    if (fs.existsSync(distPath)) {
        return distPath;
    }
    return path.resolve(__dirname, '..', '..', 'index.html');
}

function getPublicAssetPath(assetRelativePath: string): string {
    const basePath = app.isPackaged
        ? path.join(process.resourcesPath, 'public')
        : path.resolve(__dirname, '..', '..', 'public');
    return path.join(basePath, assetRelativePath.replace(/^[/\\]/, ''));
}

function loadNativeImageFrom(assetPath: string): NativeImage | undefined {
    try {
        if (fs.existsSync(assetPath)) {
            const image = nativeImage.createFromPath(assetPath);
            if (!image.isEmpty()) {
                return image;
            }
        }
    } catch (error) {
        console.warn(`Failed to load icon at ${assetPath}:`, error);
    }

    return undefined;
}

function resolveIconAssets(): { browserIcon?: string | NativeImage; dockIcon?: NativeImage } {
    const pngPath = getPublicAssetPath(`${ICON_BASENAME}.png`);
    const icoPath = getPublicAssetPath(`${ICON_BASENAME}.ico`);

    const pngImage = loadNativeImageFrom(pngPath);
    const icoExists = fs.existsSync(icoPath);
    const icoImage = icoExists ? loadNativeImageFrom(icoPath) : undefined;

    const browserIcon = process.platform === 'win32'
        ? (icoExists ? icoPath : pngImage)
        : (pngImage ?? icoImage);

    if (!browserIcon) {
        console.warn('No icon assets were found. Ensure public/BAV-Livery-Manager.(png|ico) exists.');
    }

    const dockIcon = pngImage ?? icoImage;

    if (!pngImage) {
        console.warn(`PNG icon missing at ${pngPath}; dock icon will fall back to ICO if available.`);
    }

    if (process.platform === 'win32' && !icoExists) {
        console.warn(`ICO icon missing at ${icoPath}; Windows build falls back to PNG.`);
    }

    return { browserIcon, dockIcon };
}

function createWindow() {
    const { browserIcon, dockIcon } = resolveIconAssets();

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1400,
        minHeight: 850,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
        show: false,
        title: APP_TITLE,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#111111',
            symbolColor: '#ffffff',
            height: 40
        },
        icon: browserIcon
    });

    if (process.platform === 'darwin' && dockIcon) {
        app.dock?.setIcon(dockIcon);
    }

    const rendererEntry = getRendererPath();

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(rendererEntry);
    }

    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.webContents.on('did-finish-load', () => {
        if (pendingAuthPayload) {
            mainWindow?.webContents.send('auth-token', pendingAuthPayload);
            pendingAuthPayload = null;
        }
    });

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.setTitle(APP_TITLE);
}

function extractDeepLink(args: string[]): string | null {
    const target = args.find((arg) => arg.startsWith(`${AUTH_PROTOCOL}://`));
    return target ?? null;
}

function parseAuthPayload(rawUrl: string) {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== `${AUTH_PROTOCOL}:`) {
            return null;
        }

        const token = parsed.searchParams.get('token');
        if (!token) {
            return null;
        }

        return {
            token,
            refresh: parsed.searchParams.get('refresh'),
            expiresIn: parsed.searchParams.get('expiresIn'),
            session: parsed.searchParams.get('session'),
            role: parsed.searchParams.get('role'),
            bawId: parsed.searchParams.get('bawId'),
            pilotId: parsed.searchParams.get('pilotId'),
            fullName: parsed.searchParams.get('fullName'),
            rank: parsed.searchParams.get('rank'),
            totalTime: parsed.searchParams.get('totalTime'),
            liveryId: parsed.searchParams.get('liveryId')
        };
    } catch {
        return null;
    }
}

function forwardAuthPayload(rawUrl: string) {
    const parsed = parseAuthPayload(rawUrl);
    if (!parsed) {
        return;
    }

    // The refresh token stays in the main process only; the renderer gets the
    // access token and profile fields.
    const { refresh, expiresIn, ...payload } = parsed;
    const expiresInSec = expiresIn !== null ? Number(expiresIn) : null;
    tryGetAuthManager()?.setSession({
        accessToken: parsed.token,
        refreshToken: refresh,
        expiresInSec: Number.isFinite(expiresInSec) ? expiresInSec : null
    }).catch((error) => console.error('Failed to store auth session:', (error as Error).message));

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auth-token', payload);
    } else {
        pendingAuthPayload = payload;
    }
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (_event, argv) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }

        const deepLink = extractDeepLink(argv);
        if (deepLink) {
            forwardAuthPayload(deepLink);
        }
    });
}

app.whenReady().then(async () => {
    console.log('App ready, creating window...');

    setupAutoUpdates();

    if (isDev) {
        try {
            const name = await installExtension(REACT_DEVELOPER_TOOLS, { loadExtensionOptions: { allowFileAccess: true } });
            console.log(`Added Extension: ${name}`);
        } catch (err) {
            console.log('An error occurred: ', err);
        }
    }

    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
    }

    const sendToMainWindow = (channel: string, data?: unknown) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    };

    const authManager = initAuthService({
        onAccessTokenRefreshed: (session) => sendToMainWindow('auth-token-refreshed', session),
        onSessionExpired: () => sendToMainWindow('auth-session-expired')
    });
    // Launch refresh: renderer awaits the result via the auth-get-session IPC.
    void authManager.initialize().catch((error) => {
        console.error('Failed to restore auth session on launch:', (error as Error).message);
    });

    createWindow();
    registerIpcHandlers(appContext);

    const initialLink = process.platform === 'win32' ? extractDeepLink(process.argv) : null;
    if (initialLink) {
        forwardAuthPayload(initialLink);
    }

    if (process.platform === 'darwin') {
        app.on('open-url', (event, url) => {
            event.preventDefault();
            forwardAuthPayload(url);
        });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        console.log('Activating app, creating new window...');
        createWindow();
    }
});

app.on('before-quit', () => {
    console.log('Application shutting down...');
});

ipcMain.handle('auth-open-panel', async (_event, targetUrl: string) => {
    if (!targetUrl) {
        return;
    }

    try {
        await shell.openExternal(targetUrl);
    } catch (error) {
        console.error('Failed to open panel auth URL:', error);
    }
});

// Allow renderer to request opening arbitrary external links in the system browser
ipcMain.handle('open-external', async (_event, targetUrl: string) => {
    if (!targetUrl) return;

    try {
        await shell.openExternal(targetUrl, { activate: true });
    } catch (error) {
        console.error('Failed to open external URL:', error);
    }
});
