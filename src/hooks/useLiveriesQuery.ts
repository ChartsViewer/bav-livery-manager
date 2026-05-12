import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { REMOTE_LIVERY_LIST_URL } from '@shared/constants';
import { useAuthStore } from '@/store/authStore';
import { useLiveryStore } from '@/store/liveryStore';
import { normalizeRemoteLivery } from '@/utils/livery';

interface RemoteLiveryPayload {
    liveries?: Array<Record<string, unknown>>;
}

const createStatusError = (status: number, message: string) => {
    const error: Error & { status?: number } = new Error(message);
    error.status = status;
    return error;
};

export const useLiveriesQuery = () => {
    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);

    const query = useQuery({
        queryKey: ['liveries', token],
        enabled: Boolean(token),
        queryFn: async (): Promise<RemoteLiveryPayload> => {
            if (!token) {
                throw new Error('Missing auth token');
            }

            const response = await fetch(REMOTE_LIVERY_LIST_URL, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });

            if (response.status === 401 || response.status === 403) {
                throw createStatusError(response.status, 'Unauthorized');
            }

            if (!response.ok) {
                throw createStatusError(response.status, `Remote list request failed with status ${response.status}`);
            }

            const body = (await response.json()) as { data?: RemoteLiveryPayload } | RemoteLiveryPayload;
            return ('data' in (body as object) ? (body as { data: RemoteLiveryPayload }).data : body) as RemoteLiveryPayload;
        },
        select: (data) => (data.liveries ?? []).map((entry) => normalizeRemoteLivery(entry as Record<string, unknown>)),
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000
    });

    useEffect(() => {
        useLiveryStore.setState({ loading: query.isFetching });
    }, [query.isFetching]);

    useEffect(() => {
        if (!query.data) return;
        useLiveryStore.setState({ liveries: query.data, error: null });
    }, [query.data]);

    useEffect(() => {
        if (!query.error) return;
        const status = (query.error as Error & { status?: number }).status;
        if (status === 401 || status === 403) {
            console.warn('Livery fetch unauthorized; clearing session.');
            logout();
            useLiveryStore.setState({ liveries: [], error: 'Session expired. Please sign in again.' });
            return;
        }
        console.error('Failed to load liveries', query.error);
        useLiveryStore.setState({ liveries: [], error: 'Unable to load liveries. Please check your connection.' });
    }, [logout, query.error]);

    return query;
};
