import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';

export interface BookedFlight {
    id: number;
    flight_number: string;
    callsign: string;
    departure: string;
    arrival: string;
    departure_date: string;
    departure_time: string;
    aircraft: string;
    registration: string;
}

const BOOKINGS_URL = 'https://api.bavirtual.co.uk/livery/bookings';
const REFRESH_INTERVAL_MS = 60_000;

const pickLatestFlight = (flights: BookedFlight[]): BookedFlight | null => {
    if (flights.length === 0) return null;
    return flights.reduce((latest, current) => {
        const latestStamp = `${latest.departure_date}T${latest.departure_time}`;
        const currentStamp = `${current.departure_date}T${current.departure_time}`;
        if (currentStamp > latestStamp) return current;
        if (currentStamp === latestStamp && current.id > latest.id) return current;
        return latest;
    });
};

export const useNextFlightQuery = () => {
    const pilotId = useAuthStore((state) => state.pilotId);

    return useQuery({
        queryKey: ['next-flight', pilotId],
        enabled: Boolean(pilotId),
        queryFn: async (): Promise<BookedFlight[]> => {
            const response = await fetch(`${BOOKINGS_URL}?pilot_id=${encodeURIComponent(pilotId ?? '')}`, {
                cache: 'no-store'
            });
            if (!response.ok) {
                throw new Error(`Bookings request failed with status ${response.status}`);
            }
            const body = await response.json();
            if (Array.isArray(body)) return body as BookedFlight[];
            if (Array.isArray(body?.data)) return body.data as BookedFlight[];
            return [];
        },
        select: pickLatestFlight,
        refetchInterval: REFRESH_INTERVAL_MS,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
        staleTime: REFRESH_INTERVAL_MS,
        retry: 1
    });
};
