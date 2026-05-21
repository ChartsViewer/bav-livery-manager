import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, HardDrive } from 'react-feather';
import type { DiskUsageEntry, DiskUsageReport, DriveStats } from '@/types/electron-api';
import { useLiveryStore } from '@/store/liveryStore';
import { formatBytes } from '@/utils/formatBytes';
import styles from './DiskUsage.module.css';

type GroupKey = 'developer' | 'aircraft' | 'simulator' | 'item';

interface GroupedRow {
    key: string;
    label: string;
    sublabel?: string;
    sizeBytes: number;
    count: number;
}

const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

const SIM_LABEL: Record<string, string> = {
    FS20: 'MSFS 2020',
    FS24: 'MSFS 2024'
};

const formatTimestamp = (ms: number): string => {
    try {
        return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '—';
    }
};

const TOP_N = 8;

export const DiskUsage = () => {
    const liveries = useLiveryStore((state) => state.liveries);
    const [report, setReport] = useState<DiskUsageReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [groupBy, setGroupBy] = useState<GroupKey>('developer');

    const liveryLookup = useMemo(() => {
        const map = new Map<string, { developerName: string; aircraftProfileName: string }>();
        liveries.forEach((l) => {
            map.set(l.id, { developerName: l.developerName, aircraftProfileName: l.aircraftProfileName });
        });
        return map;
    }, [liveries]);

    const scan = useCallback(async () => {
        const api = window.electronAPI;
        if (!api?.getDiskUsage) {
            setError('Disk usage is only available in the desktop app.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await api.getDiskUsage();
            setReport(result);
        } catch (err) {
            console.error('Disk usage scan failed', err);
            setError('Unable to scan installed liveries.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void scan();
    }, [scan]);

    const groupedRows = useMemo<GroupedRow[]>(() => {
        if (!report) return [];

        if (groupBy === 'item') {
            return report.entries
                .map<GroupedRow>((entry) => {
                    const developerName =
                        entry.type === 'livery' && entry.liveryId
                            ? liveryLookup.get(entry.liveryId)?.developerName
                            : undefined;
                    const sublabelParts = [
                        SIM_LABEL[entry.simulator] ?? entry.simulator,
                        entry.resolution,
                        developerName,
                        entry.type === 'package' ? 'Package' : undefined
                    ].filter(Boolean) as string[];
                    return {
                        key: entry.installPath,
                        label: entry.name,
                        sublabel: sublabelParts.join(' · '),
                        sizeBytes: entry.sizeBytes,
                        count: 1
                    };
                })
                .sort((a, b) => b.sizeBytes - a.sizeBytes);
        }

        const groupKeyFn = (entry: DiskUsageEntry): { key: string; label: string } => {
            if (groupBy === 'simulator') {
                const sim = entry.simulator;
                return { key: sim, label: SIM_LABEL[sim] ?? sim };
            }

            if (entry.type === 'package') {
                return { key: '__package__', label: 'Required Packages' };
            }

            const meta = entry.liveryId ? liveryLookup.get(entry.liveryId) : undefined;

            if (groupBy === 'developer') {
                const label = meta?.developerName?.trim() || 'Unknown developer';
                return { key: label.toLowerCase(), label };
            }
            const label = meta?.aircraftProfileName?.trim() || 'Unknown aircraft';
            return { key: label.toLowerCase(), label };
        };

        const buckets = new Map<string, GroupedRow>();
        report.entries.forEach((entry) => {
            const { key, label } = groupKeyFn(entry);
            const existing = buckets.get(key);
            if (existing) {
                existing.sizeBytes += entry.sizeBytes;
                existing.count += 1;
            } else {
                buckets.set(key, { key, label, sizeBytes: entry.sizeBytes, count: 1 });
            }
        });

        return Array.from(buckets.values()).sort((a, b) => b.sizeBytes - a.sizeBytes);
    }, [groupBy, liveryLookup, report]);

    const maxGroupBytes = groupedRows[0]?.sizeBytes ?? 0;
    const visibleRows = groupBy === 'item' ? groupedRows.slice(0, TOP_N) : groupedRows;
    const hiddenCount = groupedRows.length - visibleRows.length;

    const sims = useMemo(() => {
        if (!report) return [] as Array<{ key: string; label: string; bytes: number; share: number }>;
        const entries = Object.entries(report.bySimulator);
        if (!entries.length) return [];
        const maxSim = Math.max(...entries.map(([, bytes]) => bytes), 1);
        return entries
            .map(([key, bytes]) => ({
                key,
                label: SIM_LABEL[key] ?? key,
                bytes,
                share: bytes / maxSim
            }))
            .sort((a, b) => b.bytes - a.bytes);
    }, [report]);

    const totalCount = report?.entries.length ?? 0;
    const liveryCount = report?.entries.filter((e) => e.type === 'livery').length ?? 0;
    const packageCount = report?.entries.filter((e) => e.type === 'package').length ?? 0;

    const drives = report?.drives ?? [];

    return (
        <div className={styles.container}>
            <div className={styles.staticContent}>
                <div className={styles.summary}>
                    <div className={styles.summaryText}>
                        <div className={styles.totalRow}>
                            <span className={styles.totalValue}>
                                {report ? formatBytes(report.totalBytes) : '—'}
                            </span>
                            <span className={styles.totalLabel}>used by BAV liveries &amp; packages</span>
                        </div>
                        <p className={styles.scanInfo}>
                            {report
                                ? `${liveryCount} ${liveryCount === 1 ? 'livery' : 'liveries'}${packageCount > 0 ? ` · ${packageCount} ${packageCount === 1 ? 'package' : 'packages'}` : ''} · scanned at ${formatTimestamp(report.scannedAt)}`
                                : loading
                                    ? 'Scanning installed liveries…'
                                    : 'Click refresh to scan.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        className={classNames(styles.refreshButton, loading && styles.refreshButtonSpin)}
                        onClick={() => void scan()}
                        disabled={loading}
                        aria-label="Rescan disk usage"
                    >
                        <RefreshCw size={14} className={styles.refreshIcon} />
                        {loading ? 'Scanning…' : 'Refresh'}
                    </button>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                {drives.length > 0 && (
                    <div className={styles.drivesBlock}>
                        {drives.map((drive) => (
                            <DriveCard key={drive.mountPath} drive={drive} />
                        ))}
                    </div>
                )}

                {loading && !report && (
                    <div className={styles.skeleton}>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className={styles.skeletonRow} />
                        ))}
                    </div>
                )}

                {report && totalCount === 0 && !loading && (
                    <div className={styles.emptyState}>
                        <HardDrive size={32} />
                        <p>No installed liveries yet — install one to see disk usage here.</p>
                    </div>
                )}

                {report && sims.length > 1 && (
                    <div className={styles.simulatorBlock}>
                        {sims.map((sim) => (
                            <div key={sim.key} className={styles.simRow}>
                                <span className={styles.simLabel}>{sim.label}</span>
                                <div className={styles.bar}>
                                    <div
                                        className={classNames(styles.barFill, sim.key === 'FS24' && styles.barFillFs24)}
                                        style={{ width: `${Math.max(sim.share * 100, 2)}%` }}
                                    />
                                </div>
                                <span className={styles.simSize}>{formatBytes(sim.bytes)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {report && totalCount > 0 && (
                <div className={styles.scrollableSection}>
                    <div className={styles.tabs} role="tablist" aria-label="Group disk usage">
                        {([
                            { id: 'developer', label: 'By Developer' },
                            { id: 'aircraft', label: 'By Aircraft' },
                            { id: 'simulator', label: 'By Simulator' },
                            { id: 'item', label: 'Largest items' }
                        ] as Array<{ id: GroupKey; label: string }>).map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={groupBy === tab.id}
                                className={classNames(styles.tab, groupBy === tab.id && styles.tabActive)}
                                onClick={() => setGroupBy(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className={styles.scrollableList}>
                        {visibleRows.map((row) => {
                            const share = maxGroupBytes > 0 ? row.sizeBytes / maxGroupBytes : 0;
                            return (
                                <div key={row.key} className={styles.listItem}>
                                    <div className={styles.listItemHeader}>
                                        <span className={styles.listItemName} title={row.label}>{row.label}</span>
                                        <span className={styles.listItemMeta}>
                                            {groupBy === 'item'
                                                ? row.sublabel
                                                : `${row.count} ${row.count === 1 ? 'item' : 'items'}`}
                                        </span>
                                    </div>
                                    <span className={styles.listItemSize}>{formatBytes(row.sizeBytes)}</span>
                                    <div className={classNames(styles.bar, styles.listItemBar)}>
                                        <div
                                            className={styles.barFill}
                                            style={{ width: `${Math.max(share * 100, 2)}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {hiddenCount > 0 && (
                            <p className={styles.scanInfo}>+ {hiddenCount} more {hiddenCount === 1 ? 'item' : 'items'} not shown</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

interface DriveCardProps {
    drive: DriveStats;
}

const DriveCard = ({ drive }: DriveCardProps) => {
    const otherBytes = Math.max(drive.usedBytes - drive.bavBytes, 0);
    const total = drive.totalBytes || 1;
    const otherPct = (otherBytes / total) * 100;
    const bavPct = (drive.bavBytes / total) * 100;
    const freePct = Math.max(100 - otherPct - bavPct, 0);

    return (
        <div className={styles.driveCard}>
            <div className={styles.driveHeader}>
                <div>
                    <span className={styles.driveLabel}>{drive.label}</span>
                    {drive.associatedSimulators.length > 0 && (
                        <span className={styles.driveSims}>
                            ({drive.associatedSimulators.join(', ')})
                        </span>
                    )}
                </div>
                <span className={styles.driveSummary}>
                    <span className={styles.driveSummaryStrong}>{formatBytes(drive.freeBytes)}</span>
                    {' free of '}
                    <span className={styles.driveSummaryStrong}>{formatBytes(drive.totalBytes)}</span>
                </span>
            </div>
            <div className={styles.stackedBar} role="img" aria-label={`${formatBytes(drive.freeBytes)} free, ${formatBytes(drive.bavBytes)} used by BAV, ${formatBytes(otherBytes)} used by other apps`}>
                {otherPct > 0 && (
                    <div
                        className={classNames(styles.stackedSegment, styles.segmentOther)}
                        style={{ width: `${otherPct}%` }}
                        title={`Other apps: ${formatBytes(otherBytes)}`}
                    />
                )}
                {bavPct > 0 && (
                    <div
                        className={classNames(styles.stackedSegment, styles.segmentBav)}
                        style={{ width: `${Math.max(bavPct, 0.6)}%` }}
                        title={`BAV liveries & packages: ${formatBytes(drive.bavBytes)}`}
                    />
                )}
                {freePct > 0 && (
                    <div
                        className={classNames(styles.stackedSegment, styles.segmentFree)}
                        style={{ width: `${freePct}%` }}
                        title={`Free: ${formatBytes(drive.freeBytes)}`}
                    />
                )}
            </div>
            <div className={styles.legend}>
                <span className={styles.legendItem}>
                    <span className={classNames(styles.legendSwatch, styles.legendSwatchOther)} />
                    Other apps <span className={styles.legendValue}>{formatBytes(otherBytes)}</span>
                </span>
                <span className={styles.legendItem}>
                    <span className={classNames(styles.legendSwatch, styles.legendSwatchBav)} />
                    BAV <span className={styles.legendValue}>{formatBytes(drive.bavBytes)}</span>
                </span>
                <span className={styles.legendItem}>
                    <span className={classNames(styles.legendSwatch, styles.legendSwatchFree)} />
                    Free <span className={styles.legendValue}>{formatBytes(drive.freeBytes)}</span>
                </span>
            </div>
        </div>
    );
};
