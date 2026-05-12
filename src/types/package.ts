export interface Package {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    category: string | null;
    version: string | null;
    sizeBytes: number | null;
    previewUrl: string | null;
    aircraftProfileName: string | null;
    simulatorCode: string | null;
    tags: string[];
    updatedAt: string | null;
    downloadEndpoint: string;
}

export interface RemotePackagesPayload {
    issuedAt?: string;
    requestedBy?: string;
    count?: number;
    packages: Package[];
}

export interface PackageDownloadState {
    slug: string;
    title: string;
    progress: number;
    downloaded?: number;
    total?: number;
    extracting?: boolean;
    simulator: 'FS20' | 'FS24';
}
