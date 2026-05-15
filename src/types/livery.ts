export type Resolution = '4K' | '8K';
export type Simulator = 'FS20' | 'FS24';

export interface RequiredPackageRef {
    slug: string;
    title?: string | null;
    version?: string | null;
    sizeBytes?: number | null;
    downloadEndpoint?: string | null;
}

export interface Livery {
    id: string;
    name: string;
    title?: string;
    tailNumber?: string | null;
    developerId: string;
    developerName: string;
    aircraftProfileId: string;
    aircraftProfileName: string;
    aircraft?: string;
    year?: string | number | null;
    engine?: string | null;
    resolutionId: string;
    resolutionValue: string;
    size?: string | number | null;
    preview?: string | null;
    previewUrl?: string | null;
    downloadEndpoint: string;
    packageKey?: string | null;
    simulatorId: string;
    simulatorCode: string;
    registration?: string | null;
    version?: string | null;
    manufacturer?: string | null;
    tags?: string[];
    status?: string;
    categoryId?: string | null;
    categoryName?: string | null;
    requiredPackages?: string[];
    requiredPackagesResolved?: RequiredPackageRef[];
}

export interface Settings {
    msfs2020Path: string;
    msfs2024Path: string;
    defaultResolution: Resolution;
    defaultSimulator: Simulator;
}

/** Installed livery record from local store */
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

export interface DownloadProgress {
    progress: number;
    downloaded?: number;
    total?: number;
    extracting?: boolean;
    registration?: string;
    aircraft?: string;
    resolution?: string;
    simulator?: string;
    dependencySlug?: string;
    dependencyTitle?: string;
    dependencyIndex?: number;
    dependencyTotal?: number;
}

export interface LiveryUpdate {
    liveryId: string;
    currentVersion: string;
    latestVersion: string;
    hasUpdate: boolean;
    changelog?: string | null;
    liveryName?: string;
    installPath?: string;
    resolution?: string;
    simulator?: string;
}
