import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Livery, Resolution, Simulator } from '@/types/livery';
import { useLiveryStore } from '@/store/liveryStore';
import { usePackageStore } from '@/store/packageStore';
import styles from './LiveryCard.module.css';
import { Info } from 'react-feather';
import { NavLink } from 'react-router-dom';
import {useThemeStore} from "@/store/themeStore";

interface LiveryCardProps {
    livery: Livery;
    allLiveries: Livery[];
    defaultResolution: Resolution;
    defaultSimulator: Simulator;
    resolutionFilter?: Resolution | 'all';
    isInstalled: (resolution: Resolution, simulator: Simulator) => boolean;
    onDownload: (resolution: Resolution, simulator: Simulator) => Promise<boolean>;
    onCancelDownload?: () => void;
    onUninstall: (resolution: Resolution, simulator: Simulator) => Promise<boolean>;
}

const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

const formatSize = (size?: string | number | null) => {
    if (typeof size === 'number') {
        const mb = size / (1024 * 1024);
        return `${mb >= 0.1 ? mb.toFixed(1) : mb.toFixed(2)} MB`;
    }
    if (typeof size === 'string' && size.trim()) {
        return size;
    }
    return '';
};

const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isHighResolution = (value: Resolution) => value === '4K' || value === '8K';
const HIGH_RESOLUTION_CONFLICT_MESSAGE = 'Cannot install the same registration twice for the same simulator version.';

const DownloadIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const UninstallIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const LiveryCard = ({
    livery,
    allLiveries,
    defaultResolution,
    defaultSimulator,
    resolutionFilter,
    isInstalled,
    onDownload,
    onCancelDownload,
    onUninstall
}: LiveryCardProps) => {
    const [simulator, setSimulator] = useState<Simulator>(defaultSimulator);
    const [busy, setBusy] = useState(false);
    const isResolutionForced = Boolean(resolutionFilter && resolutionFilter !== 'all');
    const showConflictToast = useCallback(() => {
        useLiveryStore.setState({ error: HIGH_RESOLUTION_CONFLICT_MESSAGE });
    }, []);

    const downloadState = useLiveryStore((state) => state.downloadStates[livery.name]);
    const dependencySlug = downloadState?.dependencySlug;
    const dependencyDownloadState = usePackageStore((state) =>
        dependencySlug ? state.downloadStates[dependencySlug] : undefined
    );

    const textColor = useThemeStore((state) => state.theme.text);

    void defaultResolution;

    useEffect(() => {
        setSimulator(defaultSimulator);
    }, [defaultSimulator]);

    const peerResolutions = useMemo(() => {
        const title = (livery.title || livery.name || '').trim().toLowerCase();
        const matches = allLiveries.filter((entry) => {
            const entryTitle = (entry.title || entry.name || '').trim().toLowerCase();
            return (
                entry.developerId === livery.developerId &&
                entry.aircraftProfileId === livery.aircraftProfileId &&
                entry.simulatorId === livery.simulatorId &&
                entryTitle === title
            );
        });

        const map = new Map<Resolution, { resolution: Resolution; size?: string | number | null }>();
        matches.forEach((entry) => {
            const res = (entry.resolutionValue as Resolution) ?? null;
            if (!res) return;
            if (!map.has(res)) {
                map.set(res, { resolution: res, size: entry.size });
            }
        });

        if (!map.size) {
            map.set(livery.resolutionValue as Resolution, { resolution: livery.resolutionValue as Resolution, size: livery.size });
        }

        return Array.from(map.values()).sort((a, b) => a.resolution.localeCompare(b.resolution));
    }, [allLiveries, livery]);

    const handleCancelDownload = () => {
        if (onCancelDownload) {
            onCancelDownload();
        }
    };

    const installedHighResolution = useMemo(() => {
        return peerResolutions.find((variant) => {
            return isHighResolution(variant.resolution) && isInstalled(variant.resolution, simulator);
        });
    }, [peerResolutions, simulator, isInstalled]);

    const handleDownload = async (res: Resolution, { blocked }: { blocked?: boolean } = {}) => {
        if (blocked) {
            showConflictToast();
            return;
        }
        setBusy(true);
        try {
            await onDownload(res, simulator);
        } finally {
            setBusy(false);
        }
    };

    const handleUninstall = async (res: Resolution) => {
        setBusy(true);
        try {
            await onUninstall(res, simulator);
        } finally {
            setBusy(false);
        }
    };

    const installedAny = peerResolutions.some((variant) => isInstalled(variant.resolution, simulator));
    const disableDownload = busy || Boolean(downloadState);

    // Always show all resolutions unless filtered from above (resolutionFilter prop)
    const resolutionsToRender = isResolutionForced
        ? peerResolutions.filter((variant) => variant.resolution === resolutionFilter)
        : peerResolutions;

    return (
        <article className={styles.card} aria-label={`${livery.name} livery`}>
            <div className={styles.imageContainer}>
                {downloadState && (() => {
                    const isDepPhase = Boolean(downloadState.dependencyTitle);
                    const live = isDepPhase ? dependencyDownloadState : undefined;
                    const progress = live?.progress ?? downloadState.progress;
                    const extracting = live?.extracting ?? downloadState.extracting;
                    const downloaded = live?.downloaded ?? downloadState.downloaded;
                    const total = live?.total ?? downloadState.total;
                    return (
                        <div className={classNames(styles.overlay, extracting ? styles.overlayExtracting : undefined)}>
                            {extracting ? (
                                <>
                                    <div className={styles.spinner} />
                                    <span className={styles.overlayTitle}>Installing…</span>
                                    <span className={styles.overlaySubtitle}>
                                        {isDepPhase
                                            ? `Extracting ${downloadState.dependencyTitle}`
                                            : 'Extracting files'}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className={styles.overlayTitle}>
                                        {isDepPhase
                                            ? (downloadState.dependencyTotal && downloadState.dependencyTotal > 1
                                                ? `Installing required package (${downloadState.dependencyIndex}/${downloadState.dependencyTotal})…`
                                                : 'Installing required package…')
                                            : 'Downloading…'}
                                    </span>
                                    {isDepPhase && (
                                        <span className={styles.overlaySubtitle}>{downloadState.dependencyTitle}</span>
                                    )}
                                    <span className={styles.overlayPercent}>{progress}%</span>
                                    <div className={styles.progressBar}>
                                        <div className={styles.progressFill} style={{ width: `${progress}%` }} />
                                    </div>
                                    {downloaded && total ? (
                                        <span className={styles.overlaySubtitle}>
                                            {formatBytes(downloaded)} / {formatBytes(total)}
                                        </span>
                                    ) : isDepPhase ? (
                                        <span className={styles.overlaySubtitle}>Livery will install next</span>
                                    ) : null}
                                </>
                            )}
                        </div>
                    );
                })()}

                {installedAny && <span className={styles.installedBadge}>INSTALLED</span>}

                {livery.preview ? (
                    <img className={styles.image} src={livery.preview} alt={`${livery.name} preview`} loading="lazy" />
                ) : (
                    <div className={styles.placeholder}>No preview available</div>
                )}
            </div>

            <div className={styles.content}>
                <div className={styles.titleRow}>
                    <div>
                        <h3 className={styles.title}>{livery.name}</h3>
                        <NavLink to={'/information/' + livery.id} className={styles.infoContainer}>
                            <p className={styles.infoButton}>More details</p>
                            <Info width={14} height={14} color={textColor}/>
                        </NavLink>
                    </div>
                    {livery.version && <span className={styles.badge}>v{livery.version}</span>}
                </div>

                <dl className={styles.meta}>
                    <div>
                        <dt className={styles.metaLabel}>Aircraft</dt>
                        <dd className={styles.metaValue}>{livery.aircraftProfileName}</dd>
                    </div>
                    <div>
                        <dt className={styles.metaLabel}>Developer</dt>
                        <dd className={styles.metaValue}>{livery.developerName}</dd>
                    </div>
                    {livery.engine && (
                        <div>
                            <dt className={styles.metaLabel}>Engine</dt>
                            <dd className={styles.metaValue}>{livery.engine}</dd>
                        </div>
                    )}
                </dl>
                <dl className={styles.metaSecond}>
                    <div>
                        <dt className={styles.metaLabel}>Year</dt>
                        <dd className={styles.metaValue}>{livery.year ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className={styles.metaLabel}>Category</dt>
                        <dd className={styles.metaValue}>{livery.categoryName ?? 'Uncategorized'}</dd>
                    </div>
                </dl>

                <div className={styles.downloadRow}>
                    {resolutionsToRender.map((variant) => {
                        const res = variant.resolution;
                        const sizeLabel = formatSize(variant.size || livery.size);
                        const isInstalledVariant = isInstalled(res, simulator);
                        const label = sizeLabel ? `${res} (${sizeLabel})` : res;
                        const resolutionConflictLocked =
                            !isInstalledVariant &&
                            installedHighResolution &&
                            installedHighResolution.resolution !== res &&
                            isHighResolution(res);
                        const nativeDisabled = disableDownload;
                        const ariaDisabled = nativeDisabled || resolutionConflictLocked;
                        
                        const isDownloadingThisResolution = downloadState && downloadState.resolution === res && downloadState.simulator === simulator;

                        if (isInstalledVariant) {
                            return (
                                <div key={res} className={styles.downloadChip}>
                                    <button
                                        type="button"
                                        className={styles.uninstallButton}
                                        disabled={busy}
                                        onClick={() => handleUninstall(res)}
                                    >
                                        <span className={styles.buttonIcon} aria-hidden>
                                            <UninstallIcon />
                                        </span>
                                        <span className={styles.btnLabelFull}>Uninstall {label}</span>
                                        <span className={styles.btnLabelShort}>{label}</span>
                                    </button>
                                </div>
                            );
                        }

                        if (isDownloadingThisResolution) {
                            const isInstallingDependency = Boolean(downloadState?.dependencyTitle);
                            if (isInstallingDependency) {
                                return (
                                    <div key={res} className={styles.downloadChip}>
                                        <button
                                            type="button"
                                            className={styles.downloadButton}
                                            disabled
                                            aria-disabled
                                            style={{ marginTop: 0, width: '100%', justifyContent: 'center' }}
                                        >
                                            <span className={styles.btnLabelFull}>Installing required package…</span>
                                            <span className={styles.btnLabelShort}>Installing…</span>
                                        </button>
                                    </div>
                                );
                            }
                            return (
                                <div key={res} className={styles.downloadChip}>
                                    <button
                                        type="button"
                                        className={styles.cancelDownloadButton}
                                        onClick={handleCancelDownload}
                                        style={{ marginTop: 0, width: '100%', justifyContent: 'center' }}
                                    >
                                        <span className={styles.btnLabelFull}>Cancel {label}</span>
                                        <span className={styles.btnLabelShort}>Cancel</span>
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <div key={res} className={styles.downloadChip}>
                                <button
                                    type="button"
                                    className={styles.downloadButton}
                                    disabled={nativeDisabled}
                                    aria-disabled={ariaDisabled || undefined}
                                    title={resolutionConflictLocked ? HIGH_RESOLUTION_CONFLICT_MESSAGE : undefined}
                                    onClick={() => handleDownload(res, { blocked: resolutionConflictLocked })}
                                >
                                    <span className={styles.buttonIcon} aria-hidden>
                                        <DownloadIcon />
                                    </span>
                                    <span className={styles.btnLabelFull}>Download {label}</span>
                                    <span className={styles.btnLabelShort}>{label}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </article>
    );
};
