import { useQuery } from '@tanstack/react-query';

/** One rate per session. A board of twenty tokens must not be twenty lookups,
 *  and a rate stale by minutes is not what makes a testnet market cap notional. */
export function useEthUsd() {
  const { data } = useQuery({
    queryKey: ['eth-usd'],
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      const j = await r.json();
      return (j?.ethereum?.usd as number) ?? null;
    },
  });
  return data ?? null;
}
