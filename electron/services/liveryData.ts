import { REMOTE_LIVERY_LIST_URL } from '../../shared/constants';
import type { RemoteLiveryPayload } from '../types';
import { fetchJson } from '../utils/network';

export async function fetchRemoteLiveryList(authToken?: string | null): Promise<RemoteLiveryPayload> {
    const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const body = await fetchJson<{ data?: RemoteLiveryPayload } & RemoteLiveryPayload>(REMOTE_LIVERY_LIST_URL, { headers });
    return body.data ?? body;
}
