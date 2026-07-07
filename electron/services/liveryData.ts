import { REMOTE_LIVERY_LIST_URL } from '../../shared/constants';
import type { RemoteLiveryPayload } from '../types';
import { createRequestError } from '../utils/network';
import { getAuthManager } from './auth/authService';

export async function fetchRemoteLiveryList(): Promise<RemoteLiveryPayload> {
    const response = await getAuthManager().authorizedFetch(REMOTE_LIVERY_LIST_URL);
    if (!response.ok) {
        throw createRequestError(response, REMOTE_LIVERY_LIST_URL);
    }
    const body = (await response.json()) as { data?: RemoteLiveryPayload } & RemoteLiveryPayload;
    return body.data ?? body;
}
