import { useLiveryStore } from "@/store/liveryStore";
import { useAuthStore } from "@/store/authStore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ReturnButton } from "@/components/ReturnButton";
import { PANEL_BASE_URL } from "@shared/constants";
import type { Livery, Resolution, Simulator } from "@/types/livery";
import styles from "@/pages/InformationPage.module.css"

interface ChangelogEntry {
    version: string;
    changelog: string | null;
    createdAt: string;
}

interface AircraftRoute {
    dep: string;
    arr: string;
    count: number;
}

interface AircraftInfo {
    aircraft?: {
        icao?: string;
        reg?: string;
        selcal?: string;
        code?: string;
        maxpax?: number;
        mtow?: number;
        ac_config?: string;
    };
    stats?: {
        flights: number;
        hours: string;
    };
    routes?: AircraftRoute[];
}

const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

const formatDate = (iso: string) => {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return iso;
    }
};

const formatNumber = (value: number | undefined | null, unit?: string) => {
    if (value == null) return "—";
    const formatted = value.toLocaleString();
    return unit ? `${formatted} ${unit}` : formatted;
};

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

export function InformationPage() {
    const { liveryId } = useParams();

    const liveries = useLiveryStore((state) => state.liveries);
    const settings = useLiveryStore((state) => state.settings);
    const downloadStates = useLiveryStore((state) => state.downloadStates);
    const handleDownload = useLiveryStore((state) => state.handleDownload);
    const cancelDownload = useLiveryStore((state) => state.cancelDownload);
    const handleUninstall = useLiveryStore((state) => state.handleUninstall);
    const isVariantInstalled = useLiveryStore((state) => state.isVariantInstalled);
    const token = useAuthStore((state) => state.token);

    const selectedLivery = useMemo(() => {
        return liveries.find(livery => livery.id === liveryId)
    }, [liveries, liveryId]);

    const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
    const [changelogError, setChangelogError] = useState<string | null>(null);
    const [aircraftInfo, setAircraftInfo] = useState<AircraftInfo | null>(null);
    const [aircraftError, setAircraftError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const liveryRegistration = selectedLivery?.name.split(" ")[0] ?? "";

    const pathEnabledSimulators = useMemo<Simulator[]>(() => {
        const sims: Simulator[] = [];
        if (settings.msfs2020Path) sims.push('FS20');
        if (settings.msfs2024Path) sims.push('FS24');
        return sims;
    }, [settings.msfs2020Path, settings.msfs2024Path]);

    const initialSimulator = useMemo<Simulator>(() => {
        const code = (selectedLivery?.simulatorCode ?? '').toUpperCase();
        return code === 'FS24' ? 'FS24' : 'FS20';
    }, [selectedLivery?.simulatorCode]);

    const [simulator, setSimulator] = useState<Simulator>(initialSimulator);

    useEffect(() => {
        setSimulator(initialSimulator);
    }, [initialSimulator]);

    const peerLiveries = useMemo(() => {
        if (!selectedLivery) return [] as Livery[];
        const title = (selectedLivery.title || selectedLivery.name || '').trim().toLowerCase();
        return liveries.filter((entry) => {
            const entryTitle = (entry.title || entry.name || '').trim().toLowerCase();
            return (
                entry.developerId === selectedLivery.developerId &&
                entry.aircraftProfileId === selectedLivery.aircraftProfileId &&
                entryTitle === title
            );
        });
    }, [liveries, selectedLivery]);

    const availableSimulators = useMemo<Simulator[]>(() => {
        const set = new Set<Simulator>();
        peerLiveries.forEach((entry) => {
            const code = (entry.simulatorCode || '').toUpperCase();
            if (code === 'FS20' || code === 'FS24') set.add(code);
        });
        const order: Simulator[] = ['FS20', 'FS24'];
        return order.filter((s) => set.has(s));
    }, [peerLiveries]);

    const peerResolutions = useMemo(() => {
        const map = new Map<Resolution, { resolution: Resolution; size?: string | number | null; livery: Livery }>();
        peerLiveries.forEach((entry) => {
            const simCode = (entry.simulatorCode || '').toUpperCase();
            if (simCode !== simulator) return;
            const res = entry.resolutionValue as Resolution;
            if (!res) return;
            if (!map.has(res)) {
                map.set(res, { resolution: res, size: entry.size, livery: entry });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.resolution.localeCompare(b.resolution));
    }, [peerLiveries, simulator]);

    const showConflictToast = useCallback(() => {
        useLiveryStore.setState({ error: HIGH_RESOLUTION_CONFLICT_MESSAGE });
    }, []);

    const installedHighResolution = useMemo(() => {
        return peerResolutions.find((variant) =>
            isHighResolution(variant.resolution) && isVariantInstalled(variant.livery, variant.resolution, simulator)
        );
    }, [peerResolutions, simulator, isVariantInstalled]);

    useEffect(() => {
        if (!liveryId || !token) return;
        let aborted = false;
        setChangelogError(null);
        fetch(`${PANEL_BASE_URL}/api/v2/liveries/${liveryId}/changelog`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`Status ${res.status}`);
                return res.json();
            })
            .then((body: { data?: { versions?: ChangelogEntry[] } } | ChangelogEntry[]) => {
                if (aborted) return;
                const versions = Array.isArray(body)
                    ? body
                    : body?.data?.versions ?? [];
                setChangelog(versions);
            })
            .catch((err) => {
                if (!aborted) setChangelogError(err instanceof Error ? err.message : "Failed to load changelog");
            });
        return () => {
            aborted = true;
        };
    }, [liveryId, token]);

    useEffect(() => {
        if (!liveryRegistration) return;
        let aborted = false;
        setAircraftError(null);
        fetch(`https://api.bavirtual.co.uk/livery/registration/${liveryRegistration}?range=90`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`Status ${res.status}`);
                return res.json();
            })
            .then((data: AircraftInfo) => {
                if (!aborted) setAircraftInfo(data);
            })
            .catch((err) => {
                if (!aborted) setAircraftError(err instanceof Error ? err.message : "Failed to load aircraft info");
            });
        return () => {
            aborted = true;
        };
    }, [liveryRegistration]);

    if (!selectedLivery) {
        return (
            <div className={styles.emptyPage}>
                <p className={styles.infoMessage}>Livery not found.</p>
            </div>
        )
    }

    const logoSrc = `${selectedLivery.developerName}.png`;
    const currentVersion = changelog[0]?.version ?? selectedLivery.version ?? null;

    const flightRadarUrl = `https://www.flightradar24.com/data/aircraft/${liveryRegistration}`;
    const airNavRadarUrl = `https://www.airnavradar.com/data/registration/${liveryRegistration}`;
    const planeSpottersUrl = `https://www.planespotters.net/photos/reg/${liveryRegistration}`;

    const openWebsite = (url: string) => {
        const api = window.electronAPI;
        if (!api?.openPanelAuth || url === "") {
            return;
        }
        api.openPanelAuth(url);
    };

    const airframeFields: Array<{ label: string; value: string }> = [
        { label: "Registration", value: liveryRegistration || "—" },
        { label: "Type (ICAO)", value: aircraftInfo?.aircraft?.icao ?? "—" },
        { label: "SELCAL", value: aircraftInfo?.aircraft?.selcal ?? "—" },
        { label: "Mode-S", value: aircraftInfo?.aircraft?.code ?? "—" },
        { label: "Engines", value: selectedLivery.engine ?? "—" },
        { label: "Year Built", value: selectedLivery.year != null ? String(selectedLivery.year) : "—" },
        { label: "Seats", value: aircraftInfo?.aircraft?.maxpax != null ? String(aircraftInfo.aircraft.maxpax) : "—" },
        { label: "MTOW", value: formatNumber(aircraftInfo?.aircraft?.mtow, "kg") },
    ];

    const topRoutes = (aircraftInfo?.routes ?? []).slice(0, 200);
    const maxRouteCount = topRoutes.reduce((max, r) => Math.max(max, r.count), 0);

    const onDownload = async (livery: Livery, res: Resolution, { blocked }: { blocked?: boolean } = {}) => {
        if (blocked) {
            showConflictToast();
            return;
        }
        setBusy(true);
        try {
            await handleDownload(livery, res, simulator);
        } finally {
            setBusy(false);
        }
    };

    const onUninstall = async (livery: Livery, res: Resolution) => {
        setBusy(true);
        try {
            await handleUninstall(livery, res, simulator);
        } finally {
            setBusy(false);
        }
    };

    const sims: Simulator[] = availableSimulators.length > 0 ? availableSimulators : ['FS20', 'FS24'];

    return (
        <div className={styles.informationPage}>
            <div className={styles.headerButtons}>
                <ReturnButton />
                <div className={styles.simSwitch}>
                    {sims.map((sim) => {
                        const disabled = !pathEnabledSimulators.includes(sim);
                        const active = simulator === sim;
                        return (
                            <button
                                key={sim}
                                type="button"
                                className={classNames(styles.simChip, active && styles.simChipActive)}
                                disabled={disabled}
                                onClick={() => !disabled && setSimulator(sim)}
                                title={disabled ? `${sim} path is not configured in Settings` : undefined}
                            >
                                {sim}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className={styles.headerSection}>
                <div className={styles.headerLeft}>
                    <img className={styles.devLogo} src={logoSrc} alt={`${selectedLivery.developerName} logo`} />
                    <div className={styles.headerText}>
                        <div className={styles.titleRow}>
                            <h1 className={styles.title}>{selectedLivery.name}</h1>
                            {currentVersion && <span className={styles.versionBadge}>v{currentVersion}</span>}
                        </div>
                        <p className={styles.subtitle}>
                            {[selectedLivery.aircraftProfileName, selectedLivery.engine, selectedLivery.categoryName]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.downloadRow}>
                        {peerResolutions.length === 0 && (
                            <span className={styles.infoMessage}>No variants available</span>
                        )}
                        {peerResolutions.map((variant) => {
                            const res = variant.resolution;
                            const variantLivery = variant.livery;
                            const sizeLabel = formatSize(variant.size);
                            const installedVariant = isVariantInstalled(variantLivery, res, simulator);
                            const label = sizeLabel ? `${res} · ${sizeLabel}` : res;
                            const conflictLocked =
                                !installedVariant &&
                                installedHighResolution &&
                                installedHighResolution.resolution !== res &&
                                isHighResolution(res);
                            const dlState = downloadStates[variantLivery.name];
                            const isDownloadingThis = dlState && dlState.resolution === res && dlState.simulator === simulator;
                            const nativeDisabled = busy || Boolean(dlState);

                            if (installedVariant) {
                                return (
                                    <button
                                        key={res}
                                        type="button"
                                        className={styles.uninstallButton}
                                        disabled={busy}
                                        onClick={() => onUninstall(variantLivery, res)}
                                    >
                                        <span className={styles.buttonIcon} aria-hidden><UninstallIcon /></span>
                                        <span>Uninstall {label}</span>
                                    </button>
                                );
                            }

                            if (isDownloadingThis) {
                                return (
                                    <button
                                        key={res}
                                        type="button"
                                        className={styles.cancelDownloadButton}
                                        onClick={() => cancelDownload(variantLivery.id, variantLivery.name)}
                                    >
                                        <span>Cancel {res} · {dlState?.progress ?? 0}%</span>
                                    </button>
                                );
                            }

                            return (
                                <button
                                    key={res}
                                    type="button"
                                    className={styles.downloadButton}
                                    disabled={nativeDisabled}
                                    aria-disabled={nativeDisabled || conflictLocked || undefined}
                                    title={conflictLocked ? HIGH_RESOLUTION_CONFLICT_MESSAGE : undefined}
                                    onClick={() => onDownload(variantLivery, res, { blocked: conflictLocked })}
                                >
                                    <span className={styles.buttonIcon} aria-hidden><DownloadIcon /></span>
                                    <span>Download {label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className={styles.mainBody}>
                <div className={styles.informationContainer}>
                    <p className={styles.sectionTitle}>Airframe details</p>
                    <dl className={styles.factsSheet}>
                        {airframeFields.map((field) => (
                            <div key={field.label} className={styles.factCell}>
                                <dt className={styles.metaLabel}>{field.label}</dt>
                                <dd className={styles.metaValue}>{field.value}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className={styles.radarRow}>
                        <button className={styles.radarButton} onClick={() => openWebsite(flightRadarUrl)}>
                            <img className={styles.radarIcon} src="flightradar24.webp" alt="" />
                            <span>FlightRadar24</span>
                        </button>
                        <button className={styles.radarButton} onClick={() => openWebsite(airNavRadarUrl)}>
                            <img className={styles.radarIcon} src="airnavradar.webp" alt="" />
                            <span>AirNavRadar</span>
                        </button>
                        <button className={styles.radarButton} onClick={() => openWebsite(planeSpottersUrl)}>
                            <img className={styles.radarIcon} src="planespotters.webp" alt="" />
                            <span>PlaneSpotters</span>
                        </button>
                    </div>
                </div>

                <div className={styles.liveryBox}>
                    <div className={styles.liveryBoxName}>
                        <p>Preview:</p>
                        <p>{selectedLivery.developerName} {selectedLivery.aircraftProfileName} {selectedLivery.name}</p>
                    </div>
                    {selectedLivery.preview ? (
                        <img className={styles.liveryPreview} src={selectedLivery.preview} alt={`${selectedLivery.name} preview`} loading="lazy" />
                    ) : (
                        <div className={styles.liveryPlaceholder}>No preview available</div>
                    )}
                </div>
            </div>

            <div className={styles.secondaryBody}>
                <div className={styles.informationContainer}>
                    <p className={styles.sectionTitle}>Livery Changelog</p>
                    <div className={styles.changelog}>
                        {changelogError && <p className={styles.errorMessage}>Failed to load changelog: {changelogError}</p>}
                        {!changelogError && changelog.length === 0 && <p className={styles.infoMessage}>No changelog entries yet.</p>}
                        {changelog.map((entry, index) => (
                            <div key={entry.version} className={styles.changelogEntry}>
                                <div className={styles.changelogHead}>
                                    <span className={styles.versionTag}>v{entry.version}</span>
                                    {index === 0 && <span className={styles.currentPill}>Current</span>}
                                    <span className={styles.changelogDate}>{formatDate(entry.createdAt)}</span>
                                </div>
                                {entry.changelog ? (
                                    <ul className={styles.changelogList}>
                                        {entry.changelog
                                            .split("\n")
                                            .map((line) => line.replace(/^\s*-\s*/, "").trim())
                                            .filter(Boolean)
                                            .map((line, i) => (
                                                <li key={i}>{line}</li>
                                            ))}
                                    </ul>
                                ) : (
                                    <p className={styles.infoMessage}>No notes provided.</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.informationContainer}>
                    <div className={styles.flightLogHeader}>
                        <p className={styles.sectionTitle}>Flight Log</p>
                        <span className={styles.flightLogRange}>Last 90 days</span>
                    </div>
                    {aircraftError && <p className={styles.errorMessage}>Failed to load flight log: {aircraftError}</p>}
                    {!aircraftError && !aircraftInfo && <p className={styles.infoMessage}>Loading flight log…</p>}
                    {aircraftInfo && (
                        <div className={styles.flightLog}>
                            <div className={styles.flightStats}>
                                <div className={styles.flightStat}>
                                    <span className={styles.metaLabel}>Flights</span>
                                    <span className={styles.flightStatValue}>{aircraftInfo.stats?.flights ?? 0}</span>
                                </div>
                                <div className={styles.flightStat}>
                                    <span className={styles.metaLabel}>Hours</span>
                                    <span className={styles.flightStatValue}>{aircraftInfo.stats?.hours ?? "0:00"}</span>
                                </div>
                                <div className={styles.flightStat}>
                                    <span className={styles.metaLabel}>Routes</span>
                                    <span className={styles.flightStatValue}>{aircraftInfo.routes?.length ?? 0}</span>
                                </div>
                            </div>

                            <div className={styles.routesSectionTitle}>
                                <span>Top routes</span>
                                <span className={styles.routesHint}>{topRoutes.length ? `${topRoutes.length} shown` : ''}</span>
                            </div>

                            <div className={styles.routesList}>
                                {topRoutes.length === 0 && (
                                    <p className={styles.infoMessage}>No routes flown in this period.</p>
                                )}
                                {topRoutes.map((route, i) => {
                                    const width = maxRouteCount > 0 ? (route.count / maxRouteCount) * 100 : 0;
                                    return (
                                        <div key={`${route.dep}-${route.arr}-${i}`} className={styles.routeRow}>
                                            <div className={styles.routeTop}>
                                                <span className={styles.routePair}>
                                                    <strong>{route.dep}</strong>
                                                    <span className={styles.routeArrow}>→</span>
                                                    <strong>{route.arr}</strong>
                                                </span>
                                                <span className={styles.routeCount}>{route.count}</span>
                                            </div>
                                            <div className={styles.routeBar}>
                                                <div className={styles.routeBarFill} style={{ width: `${width}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
