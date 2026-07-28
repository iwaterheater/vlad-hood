import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { fetchLaunched, fetchToken } from './tokens';

export function useTokens() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['tokens'],
    enabled: Boolean(client),
    queryFn: async () => {
      const launched = await fetchLaunched(client!);
      /* Each token is several reads, so they go out together rather than in a
         chain — a board of twenty otherwise waits for twenty round trips. */
      const detailed = await Promise.all(
        launched.map(async (l) => {
          try {
            const t = await fetchToken(client!, l.token);
            const block = await client!.getBlock({ blockNumber: l.blockNumber }).catch(() => null);
            return { ...t, launchedAt: block ? Number(block.timestamp) * 1000 : null };
          } catch {
            return null;
          }
        }),
      );
      return detailed.filter(Boolean) as NonNullable<(typeof detailed)[number]>[];
    },
  });
}

export function useToken(address?: Address) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['token', address],
    enabled: Boolean(client && address),
    queryFn: () => fetchToken(client!, address!),
  });
}
