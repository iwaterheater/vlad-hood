import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { zeroAddress, type Address } from 'viem';
import { tokenAbi } from './abi';

export type Holder = { address: Address; balance: bigint; share: number; label?: string };
export type HolderData = { holders: Holder[]; transfers: number };

/**
 * Holders, replayed from the token's own Transfer log.
 *
 * This is what an indexer would do; it is affordable here because a launched
 * token starts at its launch block with an empty log. It walks every transfer
 * and nets the balances, so it stays exact rather than sampling. A token with
 * tens of thousands of transfers would want a real indexer instead.
 */
export function useHolders(token?: Address, pool?: Address | null, totalSupply?: bigint) {
  const client = usePublicClient();
  return useQuery({
    /* pool and supply are in the key on purpose: they arrive a render after the
       address does, and a key without them caches the first result — computed
       before either was known — and never recomputes. */
    queryKey: ['holders', token, pool, totalSupply?.toString()],
    enabled: Boolean(client && token && totalSupply),
    staleTime: 60_000,
    queryFn: async (): Promise<HolderData> => {
      const logs = await client!.getContractEvents({
        address: token!, abi: tokenAbi, eventName: 'Transfer', fromBlock: 0n, toBlock: 'latest',
      });

      const balances = new Map<string, bigint>();
      for (const l of logs) {
        const from = (l.args.from as Address).toLowerCase();
        const to = (l.args.to as Address).toLowerCase();
        const v = l.args.value as bigint;
        if (from !== zeroAddress) balances.set(from, (balances.get(from) ?? 0n) - v);
        if (to !== zeroAddress) balances.set(to, (balances.get(to) ?? 0n) + v);
      }

      const supply = totalSupply ?? 0n;
      const holders = [...balances.entries()]
        .filter(([, b]) => b > 0n)
        .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
        .map(([address, balance]) => ({
          address: address as Address,
          balance,
          share: supply > 0n ? Number((balance * 10000n) / supply) / 100 : 0,
          /* the pool holds the unsold supply — naming it stops it reading as a whale */
          label: pool && address === pool.toLowerCase() ? 'liquidity pool' : undefined,
        }));

      return { holders, transfers: logs.length };
    },
  });
}
