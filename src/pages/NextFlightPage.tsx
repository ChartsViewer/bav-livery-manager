import { useMemo, useState, useEffect } from 'react';
import { ReturnButton } from '@/components/ReturnButton';
import { LiveryCard } from '@/components/LiveryCard';
import { useNextFlightQuery } from '@/hooks/useNextFlightQuery';
import { useLiveryStore } from '@/store/liveryStore';
import type { Livery, Resolution, Simulator } from '@/types/livery';
import styles from './NextFlightPage.module.css';

const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

const RoutePlaneIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
);

const EmptyIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const normalize = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

const extractRegistration = (livery: Livery): string => {
    if (livery.registration && livery.registration.trim()) return livery.registration.trim();
    return (livery.name || '').trim().split(/\s+/)[0] ?? '';
};

const dedupeLiveriesForDisplay = (liveries: Livery[], preferredResolution: Resolution): Livery[] => {
    const map = new Map<string, Livery>();

    liveries.forEach((entry) => {
        const key = [
            normalize(entry.simulatorId),
            normalize(entry.developerId),
            normalize(entry.aircraftProfileId),
            normalize(entry.title ?? entry.name)
        ].join('|');

        const score = (candidate: Livery) => {
            const resScore = normalize(candidate.resolutionValue) === normalize(preferredResolution) ? 2 : 0;
            const previewScore = candidate.preview ? 1 : 0;
            return resScore + previewScore;
        };

        const existing = map.get(key);
        if (!existing || score(entry) > score(existing)) {
            map.set(key, entry);
        }
    });

    return Array.from(map.values());
};

const findLiveryVariant = (
    liveries: Livery[],
    reference: Livery,
    resolution: Resolution,
    simulator: Simulator
): Livery | null => {
    const referenceTitle = normalize(reference.title ?? reference.name);
    const targetResolution = normalize(resolution);
    const targetSimulator = normalize(simulator);
    return (
        liveries.find((entry) =>
            entry.developerId === reference.developerId &&
            entry.aircraftProfileId === reference.aircraftProfileId &&
            normalize(entry.title ?? entry.name) === referenceTitle &&
            normalize(entry.simulatorCode) === targetSimulator &&
            normalize(entry.resolutionValue) === targetResolution
        ) ?? null
    );
};

export const NextFlightPage = () => {
    const { data: flight } = useNextFlightQuery();

    const liveries = useLiveryStore((state) => state.liveries);
    const settings = useLiveryStore((state) => state.settings);
    const handleDownload = useLiveryStore((state) => state.handleDownload);
    const cancelDownload = useLiveryStore((state) => state.cancelDownload);
    const handleUninstall = useLiveryStore((state) => state.handleUninstall);
    const isVariantInstalled = useLiveryStore((state) => state.isVariantInstalled);

    const pathEnabledSimulators = useMemo<Simulator[]>(() => {
        const sims: Simulator[] = [];
        if (settings.msfs2020Path) sims.push('FS20');
        if (settings.msfs2024Path) sims.push('FS24');
        return sims;
    }, [settings.msfs2020Path, settings.msfs2024Path]);

    const [simulator, setSimulator] = useState<Simulator>(settings.defaultSimulator);

    useEffect(() => {
        if (pathEnabledSimulators.length > 0 && !pathEnabledSimulators.includes(simulator)) {
            setSimulator(pathEnabledSimulators[0]);
        }
    }, [pathEnabledSimulators, simulator]);

    const target = (flight?.registration ?? '').trim().toUpperCase();

    const matchingLiveries = useMemo(() => {
        if (!target) return [] as Livery[];
        return liveries.filter((livery) => {
            const reg = extractRegistration(livery).toUpperCase();
            return reg === target;
        });
    }, [liveries, target]);

    const simFilteredLiveries = useMemo(
        () => matchingLiveries.filter((livery) => (livery.simulatorCode || '').toUpperCase() === simulator),
        [matchingLiveries, simulator]
    );

    const dedupedLiveries = useMemo(
        () => dedupeLiveriesForDisplay(simFilteredLiveries, settings.defaultResolution)
            .sort((a, b) => a.name.localeCompare(b.name)),
        [simFilteredLiveries, settings.defaultResolution]
    );

    if (!flight) {
        return (
            <section className={styles.page}>
                <div className={styles.headerButtons}>
                    <ReturnButton />
                </div>
                <div className={styles.emptyState}>
                    <EmptyIcon />
                    <p>No upcoming flight booked.</p>
                </div>
            </section>
        );
    }

    const departureDisplay = `${flight.departure_date} · ${flight.departure_time}Z`;

    return (
        <section className={styles.page}>
            <div className={styles.headerButtons}>
                <ReturnButton />
                <div className={styles.simSwitch}>
                    {(['FS20', 'FS24'] as Simulator[]).map((sim) => {
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

            <div className={styles.heroCard}>
                <div className={styles.heroTopRow}>
                    <span className={styles.eyebrow}>
                        Next Flight
                    </span>
                    <span className={styles.flightBadge}>{flight.flight_number}</span>
                </div>

                <div className={styles.heroRoute}>
                    <div className={styles.airport}>
                        <span className={styles.airportCode}>{flight.departure}</span>
                        <span className={styles.airportLabel}>Departure</span>
                    </div>
                    <div className={styles.routeMiddle} aria-hidden>
                        <span className={styles.routeDash} />
                        <span className={styles.routePlane}>
                            <RoutePlaneIcon />
                        </span>
                        <span className={styles.routeDash} />
                    </div>
                    <div className={classNames(styles.airport, styles.airportRight)}>
                        <span className={styles.airportCode}>{flight.arrival}</span>
                        <span className={styles.airportLabel}>Arrival</span>
                    </div>
                </div>

                <dl className={styles.factsSheet}>
                    <div className={styles.factCell}>
                        <dt className={styles.metaLabel}>Callsign</dt>
                        <dd className={classNames(styles.metaValue, styles.metaValueMono)}>{flight.callsign}</dd>
                    </div>
                    <div className={styles.factCell}>
                        <dt className={styles.metaLabel}>Aircraft</dt>
                        <dd className={styles.metaValue}>{flight.aircraft}</dd>
                    </div>
                    <div className={styles.factCell}>
                        <dt className={styles.metaLabel}>Registration</dt>
                        <dd className={classNames(styles.metaValue, styles.metaValueMono)}>{flight.registration}</dd>
                    </div>
                    <div className={styles.factCell}>
                        <dt className={styles.metaLabel}>Departure</dt>
                        <dd className={styles.metaValue}>{departureDisplay}</dd>
                    </div>
                </dl>
            </div>

            <div className={styles.liveriesSection}>
                <p className={styles.resultCount}>
                    <strong>{dedupedLiveries.length}</strong>{' '}
                    {dedupedLiveries.length === 1 ? 'livery' : 'liveries'} available for{' '}
                    <span className={styles.registrationToken}>{flight.registration}</span>
                </p>

                <div className={styles.scrollContainer}>
                    {dedupedLiveries.length > 0 ? (
                        <div className={styles.grid}>
                            {dedupedLiveries.map((livery) => (
                                <LiveryCard
                                    key={livery.id ?? livery.name}
                                    livery={livery}
                                    allLiveries={liveries}
                                    defaultResolution={settings.defaultResolution}
                                    defaultSimulator={simulator}
                                    isInstalled={(resolution, sim) => isVariantInstalled(livery, resolution, sim)}
                                    onDownload={(resolution, sim) => {
                                        const variant = findLiveryVariant(liveries, livery, resolution, sim) ?? livery;
                                        return handleDownload(variant, resolution, sim);
                                    }}
                                    onCancelDownload={() => cancelDownload(livery.id, livery.name)}
                                    onUninstall={(resolution, sim) => handleUninstall(livery, resolution, sim)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <EmptyIcon />
                            <p>No liveries available for {flight.registration} on {simulator}.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};
