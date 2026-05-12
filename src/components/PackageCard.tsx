import { useState } from 'react';
import type { Package, PackageDownloadState } from '@/types/package';
import type { Livery, Simulator } from '@/types/livery';
import styles from './LiveryCard.module.css';

interface PackageCardProps {
    pkg: Package;
    pathEnabledSimulators: Simulator[];
    downloadState: PackageDownloadState | undefined;
    isInstalled: (simulator: Simulator) => boolean;
    findDependentLiveries: (simulator: Simulator) => Livery[];
    onDownload: (simulator: Simulator) => Promise<boolean>;
    onCancelDownload: () => void;
    onUninstall: (simulator: Simulator) => Promise<boolean>;
}

const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

const ALL_SIMULATORS: Simulator[] = ['FS20', 'FS24'];

const formatBytes = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

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

export const PackageCard = ({
    pkg,
    pathEnabledSimulators,
    downloadState,
    isInstalled,
    findDependentLiveries,
    onDownload,
    onCancelDownload,
    onUninstall
}: PackageCardProps) => {
    const [busy, setBusy] = useState(false);

    const sizeLabel = formatBytes(pkg.sizeBytes);
    const isExtracting = Boolean(downloadState?.extracting);
    const downloadingSim = downloadState?.simulator;

    const supportedSimulators: Simulator[] = pkg.simulatorCode
        ? ALL_SIMULATORS.filter((sim) => sim === pkg.simulatorCode)
        : ALL_SIMULATORS;

    const handleDownloadClick = async (sim: Simulator) => {
        if (busy || downloadState) return;
        setBusy(true);
        try {
            await onDownload(sim);
        } finally {
            setBusy(false);
        }
    };

    const handleUninstallClick = async (sim: Simulator) => {
        const dependents = findDependentLiveries(sim);
        if (dependents.length > 0) {
            const names = dependents.map((l) => l.name).join('\n  • ');
            const confirmed = window.confirm(
                `If you delete "${pkg.title}", the following installed livery${dependents.length > 1 ? 'ies' : ''} won’t work properly:\n\n  • ${names}\n\nDo you want to continue?`
            );
            if (!confirmed) return;
        }
        setBusy(true);
        try {
            await onUninstall(sim);
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className={styles.card} aria-label={`${pkg.title} package`}>
            <div className={styles.imageContainer}>
                {downloadState && (
                    <div className={classNames(styles.overlay, isExtracting ? styles.overlayExtracting : undefined)}>
                        {isExtracting ? (
                            <>
                                <div className={styles.spinner} />
                                <span className={styles.overlayTitle}>Installing…</span>
                                <span className={styles.overlaySubtitle}>Extracting files</span>
                            </>
                        ) : (
                            <>
                                <span className={styles.overlayTitle}>Downloading…</span>
                                <span className={styles.overlayPercent}>{downloadState.progress}%</span>
                                <div className={styles.progressBar}>
                                    <div className={styles.progressFill} style={{ width: `${downloadState.progress}%` }} />
                                </div>
                                {downloadState.downloaded && downloadState.total ? (
                                    <span className={styles.overlaySubtitle}>
                                        {formatBytes(downloadState.downloaded)} / {formatBytes(downloadState.total)}
                                    </span>
                                ) : null}
                            </>
                        )}
                    </div>
                )}

                {supportedSimulators.some((sim) => isInstalled(sim)) && (
                    <span className={styles.installedBadge}>INSTALLED</span>
                )}

                {pkg.previewUrl ? (
                    <img className={styles.image} src={pkg.previewUrl} alt={`${pkg.title} preview`} loading="lazy" />
                ) : (
                    <div className={styles.placeholder}>No preview available</div>
                )}
            </div>

            <div className={styles.content}>
                <div className={styles.titleRow}>
                    <div>
                        <h3 className={styles.title}>{pkg.title}</h3>
                        {pkg.description && (
                            <p className={styles.infoContainer} style={{ marginTop: 4 }}>
                                <span className={styles.infoButton}>{pkg.description}</span>
                            </p>
                        )}
                    </div>
                    {pkg.version && <span className={styles.badge}>v{pkg.version}</span>}
                </div>

                <dl className={styles.meta}>
                    {pkg.aircraftProfileName && (
                        <div>
                            <dt className={styles.metaLabel}>Aircraft</dt>
                            <dd className={styles.metaValue}>{pkg.aircraftProfileName}</dd>
                        </div>
                    )}
                    <div>
                        <dt className={styles.metaLabel}>Category</dt>
                        <dd className={styles.metaValue}>{pkg.category ?? 'Uncategorized'}</dd>
                    </div>
                    {pkg.simulatorCode && (
                        <div>
                            <dt className={styles.metaLabel}>Simulator</dt>
                            <dd className={styles.metaValue}>{pkg.simulatorCode}</dd>
                        </div>
                    )}
                </dl>

                <div className={styles.downloadRow}>
                    {supportedSimulators.map((sim) => {
                        const hasPath = pathEnabledSimulators.includes(sim);
                        const installed = isInstalled(sim);
                        const isThisDownloading = downloadingSim === sim;
                        const label = sizeLabel ? `${sim} (${sizeLabel})` : sim;
                        const buttonDisabled = !hasPath || busy || (Boolean(downloadState) && !isThisDownloading);
                        const title = !hasPath ? `Configure ${sim} path in Settings to download` : undefined;

                        if (isThisDownloading && !isExtracting) {
                            return (
                                <div key={sim} className={styles.downloadChip}>
                                    <button
                                        type="button"
                                        className={styles.cancelDownloadButton}
                                        onClick={onCancelDownload}
                                        style={{ marginTop: 0, width: '100%', justifyContent: 'center' }}
                                    >
                                        <span className={styles.btnLabelFull}>Cancel {sim}</span>
                                        <span className={styles.btnLabelShort}>Cancel</span>
                                    </button>
                                </div>
                            );
                        }

                        if (installed) {
                            return (
                                <div key={sim} className={styles.downloadChip}>
                                    <button
                                        type="button"
                                        className={styles.uninstallButton}
                                        disabled={busy}
                                        onClick={() => handleUninstallClick(sim)}
                                    >
                                        <span className={styles.buttonIcon} aria-hidden>
                                            <UninstallIcon />
                                        </span>
                                        <span className={styles.btnLabelFull}>Uninstall {sim}</span>
                                        <span className={styles.btnLabelShort}>{sim}</span>
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <div key={sim} className={styles.downloadChip}>
                                <button
                                    type="button"
                                    className={styles.downloadButton}
                                    disabled={buttonDisabled}
                                    title={title}
                                    onClick={() => handleDownloadClick(sim)}
                                >
                                    <span className={styles.buttonIcon} aria-hidden>
                                        <DownloadIcon />
                                    </span>
                                    <span className={styles.btnLabelFull}>Download {label}</span>
                                    <span className={styles.btnLabelShort}>{sim}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </article>
    );
};
