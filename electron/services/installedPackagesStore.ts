import path from 'node:path';
import { app } from 'electron';
import fs from 'fs-extra';

export interface InstalledPackageRecord {
    slug: string;
    title: string;
    folderName: string;
    installPath: string;
    simulator: string;
    installDate: string;
    version?: string | null;
}

interface InstalledPackagesData {
    version: number;
    packages: InstalledPackageRecord[];
}

const DATA_VERSION = 1;
let storeFilePath: string | null = null;
let cachedData: InstalledPackagesData | null = null;

function getStorePath(): string {
    if (!storeFilePath) {
        storeFilePath = path.join(app.getPath('userData'), 'installed-packages.json');
    }
    return storeFilePath;
}

async function loadData(): Promise<InstalledPackagesData> {
    if (cachedData) return cachedData;
    const filePath = getStorePath();
    try {
        if (await fs.pathExists(filePath)) {
            const data = await fs.readJson(filePath);
            cachedData = {
                version: data.version ?? DATA_VERSION,
                packages: Array.isArray(data.packages) ? data.packages : []
            };
        } else {
            cachedData = { version: DATA_VERSION, packages: [] };
        }
    } catch (error) {
        console.error('Failed to load installed packages data:', error);
        cachedData = { version: DATA_VERSION, packages: [] };
    }
    return cachedData;
}

async function saveData(data: InstalledPackagesData): Promise<void> {
    const filePath = getStorePath();
    try {
        await fs.writeJson(filePath, data, { spaces: 2 });
        cachedData = data;
    } catch (error) {
        console.error('Failed to save installed packages data:', error);
    }
}

export async function recordPackageInstallation(record: Omit<InstalledPackageRecord, 'installDate'>): Promise<void> {
    const data = await loadData();
    data.packages = data.packages.filter(
        (entry) => !(entry.slug === record.slug && entry.simulator === record.simulator)
    );
    data.packages.push({ ...record, installDate: new Date().toISOString() });
    await saveData(data);
}

export async function removePackageInstallation(slug: string, simulator: string): Promise<InstalledPackageRecord | null> {
    const data = await loadData();
    const record = data.packages.find((entry) => entry.slug === slug && entry.simulator === simulator);
    if (record) {
        data.packages = data.packages.filter((entry) => entry !== record);
        await saveData(data);
    }
    return record ?? null;
}

export async function getInstalledPackages(): Promise<InstalledPackageRecord[]> {
    const data = await loadData();
    return data.packages;
}

export async function validatePackageInstallations(): Promise<void> {
    const data = await loadData();
    const valid: InstalledPackageRecord[] = [];
    for (const entry of data.packages) {
        if (await fs.pathExists(entry.installPath)) {
            valid.push(entry);
        } else {
            console.log('Removing stale package installation record:', entry.installPath);
        }
    }
    if (valid.length !== data.packages.length) {
        data.packages = valid;
        await saveData(data);
    }
}
