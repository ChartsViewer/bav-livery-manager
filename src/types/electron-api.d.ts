import type { Livery, Settings } from './livery';

interface DownloadProgressEvent {
    liveryName: string;
    progress: number;
    downloaded?: number;
    total?: number;
    extracting?: boolean;
}

interface PackageProgressEvent {
    slug: string;
    title: string;
    progress: number;
    downloaded?: number;
    total?: number;
    extracting?: boolean;
}

interface DownloadResult {
    success: boolean;
    path?: string;
    error?: string;
    details?: string;
}

interface DetectedSimPaths {
    msfs2020Path: string | null;
    msfs2024Path: string | null;
}

export interface AuthTokenPayload {
    token: string;
    role?: string | null;
    bawId?: string | null;
    pilotId?: string | null;
    fullName?: string | null;
    rank?: string | null;
    totalTime?: string | null;
    totalFlights?: number | null;
    liveryId?: string | null;
}

export interface AuthSessionSnapshot {
    token: string;
    expiresAt: number;
}

export interface ApiFetchInit {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface ApiFetchResult<T = unknown> {
    ok: boolean;
    status: number;
    body: T | null;
    error?: string;
}

export interface AppUpdateStatus {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    version?: string;
    releaseDate?: string;
    releaseNotes?: string | { version: string; note: string }[] | null;
    percent?: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
    error?: string;
}

/** Record of an installed package from the local store */
export interface InstalledPackageRecord {
    slug: string;
    title: string;
    folderName: string;
    installPath: string;
    simulator: string;
    installDate: string;
    version?: string | null;
}

/** Record of an installed livery from the local store */
export interface InstalledLiveryRecord {
    liveryId: string;
    originalName: string;
    folderName: string;
    installPath: string;
    resolution: string;
    simulator: string;
    installDate: string;
    version?: string;
}

export interface DiskUsageEntry {
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

export interface DriveStats {
    mountPath: string;
    label: string;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    bavBytes: number;
    associatedSimulators: string[];
}

export interface DiskUsageReport {
    entries: DiskUsageEntry[];
    totalBytes: number;
    bySimulator: Record<string, number>;
    drives: DriveStats[];
    scannedAt: number;
}

export interface MetaCopyAssetResult {
    liveryName: string;
    success: boolean;
    targetDir: string | null;
    error?: string;
}

export interface MetaTextureCfgScanResult {
    liveryDir: string;
    dirName: string;
    cfgPaths: string[];
    content: string | null;
    allMatch: boolean;
}

export interface MetaTextureCfgWriteResult {
    liveryDir: string;
    dirName: string;
    success: boolean;
    path: string | null;
    error?: string;
}

export interface ElectronAPI {
    fetchLiveries: (authToken?: string | null) => Promise<{ version?: string; liveries: Livery[] }>;
    downloadLivery: (
        downloadEndpoint: string,
        liveryId: string,
        liveryName: string,
        developerName: string,
        aircraft: string,
        simulator: 'MSFS2020' | 'MSFS2024',
        resolution: string,
        authToken?: string | null
    ) => Promise<DownloadResult>;
    cancelDownload: (liveryId: string) => Promise<boolean>;
    downloadPackage: (
        downloadEndpoint: string,
        slug: string,
        title: string,
        version: string | null,
        simulator: 'MSFS2020' | 'MSFS2024',
        authToken?: string | null
    ) => Promise<DownloadResult>;
    cancelPackageDownload: (slug: string) => Promise<boolean>;
    getInstalledPackages: () => Promise<InstalledPackageRecord[]>;
    uninstallPackage: (slug: string, simulator: string) => Promise<{ success: boolean; error?: string }>;
    uninstallLivery: (installPath: string) => Promise<{ success: boolean; error?: string }>;
    getSettings: () => Promise<Settings>;
    saveSettings: (settings: Settings) => Promise<boolean>;
    detectSimPaths: () => Promise<DetectedSimPaths | null>;
    openDirectoryDialog: () => Promise<string | null>;
    getFileSize: (url: string) => Promise<string>;
    getLiveriesFolders: (path: string) => Promise<string[]>;
    pathExists: (path: string) => Promise<boolean>;
    getLocalVersion: (liveryId: string) => Promise<string | null>;
    setLocalVersion: (liveryId: string, version: string) => Promise<boolean>;
    getInstalledLiveries: () => Promise<InstalledLiveryRecord[]>;
    setTaskbarProgress: (progress: number, mode?: 'normal' | 'indeterminate' | 'paused' | 'error' | 'none') => Promise<void>;
    setWindowTitle: (title: string) => Promise<void>;
    setTitleBarOverlay: (color: string, symbolColor: string, isDark: boolean) => Promise<void>;
    onDownloadProgress: (callback: ((event: DownloadProgressEvent) => void) | null) => void;
    removeAllDownloadProgressListeners: () => void;
    onPackageProgress: (callback: ((event: PackageProgressEvent) => void) | null) => void;
    removeAllPackageProgressListeners: () => void;
    openPanelAuth: (url: string) => Promise<void>;
    openExternalLink: (url: string) => Promise<void>;
    onAuthToken: (callback: ((payload: AuthTokenPayload) => void) | null) => void;
    onAuthTokenRefreshed: (callback: ((session: AuthSessionSnapshot) => void) | null) => void;
    onAuthSessionExpired: (callback: (() => void) | null) => void;
    authGetSession: () => Promise<AuthSessionSnapshot | null>;
    authSignOut: () => Promise<void>;
    apiFetch: (url: string, init?: ApiFetchInit) => Promise<ApiFetchResult>;
    checkForAppUpdate: () => Promise<{ success: boolean; version?: string; error?: string }>;
    downloadAppUpdate: () => Promise<{ success: boolean; error?: string }>;
    installAppUpdate: () => Promise<void>;
    getAppVersion: () => Promise<string>;
    onAppUpdateStatus: (callback: ((status: AppUpdateStatus) => void) | null) => void;
    removeAppUpdateListeners: () => void;
    getDiskUsage: () => Promise<DiskUsageReport>;
    openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;

    // ─── Meta Editor API ─────────────────────────────────────────────────────
    metaSelectLiveryDirectories: () => Promise<string[]>;
    metaScanParentDirectory: () => Promise<string[]>;
    metaReadManifest: (dirPath: string) => Promise<Record<string, unknown> | null>;
    metaWriteManifests: (
        updates: Array<{ dirPath: string; manifest: Record<string, unknown> }>
    ) => Promise<{ success: boolean; errors: string[] }>;
    metaFindRegistration: (dirPath: string) => Promise<string | null>;
    metaSelectWorkspaceDirectory: () => Promise<string | null>;
    metaRunLayoutGenerator: (workspaceDir: string) => Promise<boolean>;
    metaRunZipPackages: (workspaceDir: string) => Promise<boolean>;
    metaCancelFinaliser: () => Promise<void>;
    metaSelectAssetFiles: (
        filters: { name: string; extensions: string[] }[],
        multiSelect: boolean
    ) => Promise<string[]>;
    metaCopyAssetToLiveries: (
        filePaths: string[],
        liveryDirs: string[],
        assetType: 'manager-thumbnail' | 'ingame-thumbnail' | 'texture'
    ) => Promise<MetaCopyAssetResult[]>;
    onMetaFinaliserLog: (callback: (message: string) => void) => void;
    removeMetaFinaliserLogListeners: () => void;
    metaScanTextureCfg: (liveryDirs: string[]) => Promise<MetaTextureCfgScanResult[]>;
    metaWriteTextureCfg: (liveryDirs: string[], content: string) => Promise<MetaTextureCfgWriteResult[]>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
