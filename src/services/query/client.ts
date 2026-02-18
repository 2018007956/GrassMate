import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const ONE_HOUR_MS = 60 * 60 * 1000;
export const QUERY_CACHE_KEY = 'grassmate.reactQueryCache.v1';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: ONE_HOUR_MS,
      gcTime: ONE_HOUR_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

let persistenceSetup = false;

export function setupQueryPersistence(): void {
  if (persistenceSetup || typeof window === 'undefined') return;

  const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: QUERY_CACHE_KEY,
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: ONE_HOUR_MS,
  });

  persistenceSetup = true;
}
