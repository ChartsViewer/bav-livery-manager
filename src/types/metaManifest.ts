export interface AircraftRecord {
    registration: string;
    aircraftType: string;
    engine: string;
    category: string;
    year: string;
    livery: string;
}

export interface ManagerData {
    name?: string;
    aircraft?: string;
    developer?: string;
    engine?: string;
    year?: string;
    category?: string;
    simulator?: string;
    resolution?: string;
    requiredPackages?: string[];
}

export interface Manifest {
    dependencies?: string[];
    content_type?: string;
    title?: string;
    manufacturer?: string;
    creator?: string;
    package_version?: string;
    minimum_game_version?: string;
    minimum_compatibility_version?: string;
    builder?: string;
    managerData?: ManagerData;
    [key: string]: unknown;
}

export interface LiveryEntry {
    id: string;
    dirPath: string;
    dirName: string;
    manifest: Manifest;
    originalManifest: Manifest;
    hasChanges: boolean;
    loadError: boolean;
}
