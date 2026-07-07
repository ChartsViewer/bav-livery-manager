import { useQuery } from '@tanstack/react-query';
import { REMOTE_PACKAGES_LIST_URL } from '@shared/constants';
import { useAuthStore } from '@/store/authStore';
import type { Package, RemotePackagesPayload } from '@/types/package';
import { panelFetch, createStatusError, unwrapData } from '@/api/panelClient';

export const usePackagesQuery = () => {
    const token = useAuthStore((state) => state.token);

    return useQuery({
        queryKey: ['packages', token],
        enabled: Boolean(token),
        queryFn: async (): Promise<RemotePackagesPayload> => {
            if (!token) throw new Error('Missing auth token');

            const response = await panelFetch(REMOTE_PACKAGES_LIST_URL);

            if (response.status === 401 || response.status === 403) {
                throw createStatusError(response.status, 'Unauthorized');
            }

            if (!response.ok) {
                throw createStatusError(response.status, `Packages request failed with status ${response.status}`);
            }

            return unwrapData<RemotePackagesPayload>(response.body);
        },
        select: (data): Package[] => data.packages ?? [],
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000
    });
};
