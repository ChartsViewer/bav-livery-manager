import { useQuery } from '@tanstack/react-query';
import { REMOTE_CATALOG_URL } from '@shared/constants';
import type { CatalogResponse } from '@/types/catalog';
import { panelFetch, createStatusError, unwrapData } from '@/api/panelClient';

export const useCatalogQuery = (token: string | null) => {
    return useQuery<CatalogResponse>({
        queryKey: ['catalog', token],
        enabled: Boolean(token),
        queryFn: async () => {
            if (!token) {
                throw new Error('Missing auth token');
            }
            const response = await panelFetch(REMOTE_CATALOG_URL);

            if (response.status === 401 || response.status === 403) {
                throw createStatusError(response.status, 'Unauthorized');
            }

            if (!response.ok) {
                throw new Error(`Catalog request failed with status ${response.status}`);
            }

            return unwrapData<CatalogResponse>(response.body);
        },
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1
    });
};
