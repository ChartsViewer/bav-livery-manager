import { useQuery } from '@tanstack/react-query';
import { REMOTE_PACKAGES_LIST_URL } from '@shared/constants';
import { useAuthStore } from '@/store/authStore';
import type { Package, RemotePackagesPayload } from '@/types/package';

const createStatusError = (status: number, message: string) => {
    const error: Error & { status?: number } = new Error(message);
    error.status = status;
    return error;
};

export const usePackagesQuery = () => {
    const token = useAuthStore((state) => state.token);

    return useQuery({
        queryKey: ['packages', token],
        enabled: Boolean(token),
        queryFn: async (): Promise<RemotePackagesPayload> => {
            if (!token) throw new Error('Missing auth token');

            const response = await fetch(REMOTE_PACKAGES_LIST_URL, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store'
            });

            if (response.status === 401 || response.status === 403) {
                throw createStatusError(response.status, 'Unauthorized');
            }

            if (!response.ok) {
                throw createStatusError(response.status, `Packages request failed with status ${response.status}`);
            }

            const body = (await response.json()) as { data?: RemotePackagesPayload } | RemotePackagesPayload;
            return ('data' in (body as object)
                ? (body as { data: RemotePackagesPayload }).data
                : body) as RemotePackagesPayload;
        },
        select: (data): Package[] => data.packages ?? [],
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5 * 60 * 1000,
        gcTime: 15 * 60 * 1000
    });
};
