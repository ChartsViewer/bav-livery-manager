import { Link } from 'react-router-dom';
import { useNextFlightQuery } from '@/hooks/useNextFlightQuery';
import { useLiveryStore } from '@/store/liveryStore';
import styles from './NextFlightCard.module.css';

const RoutePlaneIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
    </svg>
);

interface NextFlightCardProps {
    seamless?: boolean;
}

export const NextFlightCard = ({ seamless }: NextFlightCardProps) => {
    const { data: flight } = useNextFlightQuery();
    const liveriesCount = useLiveryStore((state) => state.liveries.length);

    if (!flight || liveriesCount === 0) return null;

    const cardClass = `${styles.card} ${seamless ? styles.cardSeamless : ''}`.trim();

    return (
        <Link to="/next-flight" className={cardClass}>
            <div className={styles.header}>
                <span className={styles.headerLabel}>Next Flight</span>
                <span className={styles.flightCode}>{flight.flight_number}</span>
            </div>

            <div className={styles.route}>
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
                <div className={`${styles.airport} ${styles.airportRight}`}>
                    <span className={styles.airportCode}>{flight.arrival}</span>
                    <span className={styles.airportLabel}>Arrival</span>
                </div>
            </div>

            <div className={styles.flightLine}>
                <span className={styles.callsign}>{flight.callsign}</span>
                <span className={styles.aircraftLine}>
                    <span className={styles.aircraft}>{flight.aircraft}</span>
                    <span className={styles.dot} aria-hidden />
                    <span className={styles.registration}>{flight.registration}</span>
                </span>
            </div>
        </Link>
    );
};
