import { useQuery } from '@tanstack/react-query';
import { REMOTE_CATALOG_URL } from '@shared/constants';
import type { CatalogResponse } from '@/types/catalog';

export const useCatalogQuery = (token: string | null) => {
    return useQuery<CatalogResponse>({
        queryKey: ['catalog', token],
        enabled: Boolean(token),
        queryFn: async () => {
            if (!token) {
                throw new Error('Missing auth token');
            }
            const response = await fetch(REMOTE_CATALOG_URL, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });

            if (response.status === 401 || response.status === 403) {
                const error: Error & { status?: number } = new Error('Unauthorized');
                error.status = response.status;
                throw error;
            }

            if (!response.ok) {
                throw new Error(`Catalog request failed with status ${response.status}`);
            }

            const body = (await response.json()) as { data?: CatalogResponse } | CatalogResponse;
            return ('data' in (body as object) ? (body as { data: CatalogResponse }).data : body) as CatalogResponse;
        },
        staleTime: 15 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1
    });
};
