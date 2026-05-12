import type { Livery, RequiredPackageRef, Resolution, Simulator } from '@/types/livery';
import { PANEL_BASE_URL } from '@shared/constants';

const asString = (value: unknown): string | null => {
    if (value === undefined || value === null) {
        return null;
    }
    return String(value);
};

export const normalizeRemoteLivery = (entry: Record<string, unknown>): Livery => {
    const tailNumber = asString(entry.tailNumber);
    const title = asString(entry.title) ?? asString(entry.name) ?? 'Unknown Livery';
    const name = tailNumber ?? title;
    const id = asString(entry.id) ?? name;
    const downloadEndpoint = asString(entry.downloadEndpoint) ?? '';
    const previewUrl = asString(entry.previewUrl) ?? asString(entry.preview) ?? null;

    return {
        id,
        name,
        title,
        tailNumber,
        developerId: asString(entry.developerId) ?? 'unknown-developer',
        developerName: asString(entry.developerName) ?? asString(entry.developer) ?? 'Unknown developer',
        aircraftProfileId: asString(entry.aircraftProfileId) ?? 'unknown-aircraft',
        aircraftProfileName: asString(entry.aircraftProfileName) ?? asString(entry.aircraft) ?? 'Unknown type',
        aircraft: asString(entry.aircraft) ?? undefined,
        year: typeof entry.year === 'string' || typeof entry.year === 'number' ? entry.year : null,
        engine: asString(entry.engine),
        resolutionId: asString(entry.resolutionId) ?? 'unknown-resolution',
        resolutionValue: asString(entry.resolutionValue) ?? asString(entry.resolution) ?? 'Unknown',
        size: typeof entry.sizeBytes === 'string' || typeof entry.sizeBytes === 'number' ? entry.sizeBytes : 
              typeof entry.size === 'string' || typeof entry.size === 'number' ? entry.size : null,
        preview: previewUrl,
        previewUrl,
        downloadEndpoint,
        packageKey: asString(entry.packageKey),
        simulatorId: asString(entry.simulatorId) ?? 'unknown-sim',
        simulatorCode: asString(entry.simulatorCode) ?? asString(entry.simulator) ?? 'Unknown',
        registration: asString(entry.registration),
        version: asString(entry.version),
        manufacturer: asString(entry.manufacturer),
        tags: Array.isArray(entry.tags) ? (entry.tags as string[]) : [],
        status: asString(entry.status) ?? undefined,
        categoryId: asString(entry.categoryId),
        categoryName: asString(entry.categoryName),
        requiredPackages: Array.isArray(entry.requiredPackages)
            ? (entry.requiredPackages as unknown[]).filter((v): v is string => typeof v === 'string')
            : [],
        requiredPackagesResolved: Array.isArray(entry.requiredPackagesResolved)
            ? (entry.requiredPackagesResolved as Array<Record<string, unknown>>).map((ref): RequiredPackageRef => ({
                slug: asString(ref.slug) ?? '',
                title: asString(ref.title),
                version: asString(ref.version),
                sizeBytes: typeof ref.sizeBytes === 'number' ? ref.sizeBytes : null,
                downloadEndpoint: asString(ref.downloadEndpoint)
            })).filter((ref) => ref.slug.length > 0)
            : []
    };
};

export const ITEMS_PER_PAGE = 24;

const slugify = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'livery';

export const buildDownloadRequestUrl = (livery: Livery, resolution: Resolution, simulator: Simulator): string => {
    if (!livery.downloadEndpoint) {
        throw new Error('Missing download endpoint for livery');
    }
    let url: URL;
    try {
        // Try to parse as absolute URL first
        url = new URL(livery.downloadEndpoint);
    } catch {
        // If it's a relative path, use the shared PANEL_BASE_URL as the base
        url = new URL(livery.downloadEndpoint, PANEL_BASE_URL);
    }

    // If the endpoint points at localhost (or other local dev host), prefer PANEL_BASE_URL
    try {
        const host = url.hostname.toLowerCase();
        if (/^(localhost|127(?:\.[0-9]{1,3}){3}|0\.0\.0\.0)$/.test(host)) {
            const base = new URL(PANEL_BASE_URL);
            url = new URL(url.pathname + url.search + url.hash, base.toString());
        }
    } catch {
        // ignore and proceed with parsed url
    }
    url.searchParams.set('resolution', resolution);
    url.searchParams.set('simulator', simulator);
    url.searchParams.set('name', livery.name);
    if (livery.packageKey) {
        url.searchParams.set('packageKey', livery.packageKey);
    }
    return url.toString();
};

export const deriveInstallFolderName = (livery: Livery): string => {
    if (livery.packageKey) {
        const key = livery.packageKey.split('/').pop();
        if (key) {
            return key.replace(/\.zip$/i, '');
        }
    }
    const base = slugify(livery.name);
    const version = livery.version ? slugify(livery.version) : 'v1-0-0';
    return `${base}-${version}`;
};

export const joinPaths = (base: string, folder: string): string => {
    const sanitizedBase = base.replace(/[\\/]+$/, '');
    const separator = sanitizedBase.includes('\\') ? '\\' : '/';
    return `${sanitizedBase}${separator}${folder}`;
};

export const formatDate = (date: string | number | Date): string => {
    try {
        const parsed = new Date(date);
        return parsed.toLocaleDateString();
    } catch (error) {
        return '';
    }
};
