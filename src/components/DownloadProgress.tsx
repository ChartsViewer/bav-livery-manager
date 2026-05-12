import { useLiveryStore } from '@/store/liveryStore';
import { usePackageStore } from '@/store/packageStore';
import styles from './DownloadProgress.module.css';
import {Download} from "react-feather";
import type {DownloadProgress as DownloadProgressType} from "@/types/livery";
import { useMemo, useState } from 'react';

interface DownloadProgressProps {
    isCollapsed: boolean;
    isExpanding?: boolean;
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

interface DownloadsInformation {
    entries: [string, DownloadProgressType][]
}

const DownloadsInformation = ({entries}: DownloadsInformation) => {
    if (entries.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <DownloadIcon />
                    </div>
                    <p className={styles.emptyText}>No active downloads</p>
                    <p className={styles.emptyHint}>Browse the catalog to find liveries</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <DownloadIcon />
                <span>Downloading</span>
                <span className={styles.badge}>{entries.length}</span>
            </div>

            <div className={styles.list}>
                {entries.map(([name, state]) => {
                    const infoParts = [
                        state.registration,
                        state.aircraft,
                        state.simulator,
                        state.resolution
                    ].filter(Boolean);

                    return (
                        <div key={name} className={styles.item}>
                            <div className={styles.itemHeader}>
                                <span className={styles.itemName} title={name}>
                                    {name}
                                </span>
                                <span className={styles.itemPercent}>
                                    {state.extracting ? 'Installing' : `${Math.round(state.progress)}%`}
                                </span>
                            </div>

                            {infoParts.length > 0 && (
                                <div className={styles.itemInfo}>
                                    {infoParts.join(' · ')}
                                </div>
                            )}

                            <div className={styles.progressTrack}>
                                <div
                                    className={`${styles.progressBar} ${state.extracting ? styles.progressBarExtracting : ''}`}
                                    style={{ width: `${state.progress}%` }}
                                />
                            </div>

                            <div className={styles.itemMeta}>
                                {state.extracting ? (
                                    <span className={styles.extractingText}>Extracting files...</span>
                                ) : state.downloaded !== undefined && state.total !== undefined ? (
                                    <>
                                        <span>{formatBytes(state.downloaded)}</span>
                                        <span className={styles.separator}>/</span>
                                        <span>{formatBytes(state.total)}</span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    )
}

export const DownloadProgress = ({isCollapsed, isExpanding}: DownloadProgressProps) => {
    const liveryStates = useLiveryStore((state) => state.downloadStates);
    const packageStates = usePackageStore((state) => state.downloadStates);
    const entries = useMemo<[string, DownloadProgressType][]>(() => {
        const merged: [string, DownloadProgressType][] = Object.entries(liveryStates);
        Object.values(packageStates).forEach((pkg) => {
            merged.push([
                `📦 ${pkg.title}`,
                {
                    progress: pkg.progress,
                    downloaded: pkg.downloaded,
                    total: pkg.total,
                    extracting: pkg.extracting,
                    simulator: pkg.simulator
                }
            ]);
        });
        return merged;
    }, [liveryStates, packageStates]);
    const [isHovered, setIsHovered] = useState(false);

    if (isExpanding) {
        return null;
    }

    if (isCollapsed) {
        return (
            <div 
                className={styles.minimizedWrapper}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div className={styles.containerMinimized}>
                    <Download/>
                    <span className={styles.badgeMinimized}
                          style={entries.length > 0 ? {background: "#4a9eff"} : {}}>{entries.length}</span>
                </div>
                {isHovered && (
                    <div className={styles.modal}>
                        <DownloadsInformation entries={entries}/>
                    </div>
                )}
            </div>
        )
    }

    if (entries.length === 0) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <DownloadIcon />
                    </div>
                    <p className={styles.emptyText}>No active downloads</p>
                    <p className={styles.emptyHint}>Browse the catalog to find liveries</p>
                </div>
            </div>
        );
    }

    return (
        <DownloadsInformation entries={entries} />
    );
};
