import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { poolAbi } from './abi';
import { priceFromSqrt } from './tokens';

export type Swap = { t: number; price: number; side: 'buy' | 'sell'; eth: number; tokens: number; tx: string; from: string };

/**
 * A Uniswap V3 swap records the price it left the pool at, so the pool's event
 * log is the price history — no indexer needed. Block times are fetched once per
 * block rather than per swap, since a busy pool puts several in one block.
 */
export function useSwaps(pool?: Address | null, token?: Address) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['swaps', pool],
    enabled: Boolean(client && pool && token),
    queryFn: async (): Promise<Swap[]> => {
      const [logs, token0] = await Promise.all([
        client!.getContractEvents({ address: pool!, abi: poolAbi, eventName: 'Swap', fromBlock: 0n, toBlock: 'latest' }),
        client!.readContract({ address: pool!, abi: poolAbi, functionName: 'token0' }),
      ]);
      const isToken0 = token0.toLowerCase() === token!.toLowerCase();

      const blockNumbers = [...new Set(logs.map((l) => l.blockNumber))];
      const blocks = new Map<bigint, number>();
      await Promise.all(
        blockNumbers.map(async (n) => {
          const b = await client!.getBlock({ blockNumber: n }).catch(() => null);
          if (b) blocks.set(n, Number(b.timestamp) * 1000);
        }),
      );

      /* Who traded has to come from the transaction, not the event: the pool
         records the router as sender, and a sell now routes its proceeds back
         through the router too, so neither address in the log is the trader. */
      const senders = new Map<string, string>();
      await Promise.all(
        [...new Set(logs.map((l) => l.transactionHash))].map(async (h) => {
          const tx = await client!.getTransaction({ hash: h }).catch(() => null);
          if (tx) senders.set(h, tx.from.toLowerCase());
        }),
      );

      return logs
        .map((l) => {
          const a0 = l.args.amount0 as bigint;
          const a1 = l.args.amount1 as bigint;
          const paired = isToken0 ? a1 : a0;
          const mine = isToken0 ? a0 : a1;
          return {
            t: blocks.get(l.blockNumber) ?? 0,
            price: priceFromSqrt(l.args.sqrtPriceX96 as bigint, isToken0),
            /* the pool took the paired asset in, so this bought our token */
            side: (paired > 0n ? 'buy' : 'sell') as 'buy' | 'sell',
            eth: Number(paired < 0n ? -paired : paired) / 1e18,
            tokens: Number(mine < 0n ? -mine : mine) / 1e18,
            tx: l.transactionHash,
            from: senders.get(l.transactionHash) ?? '',
          };
        })
        .filter((d) => d.t > 0 && isFinite(d.price) && d.price > 0)
        .sort((a, b) => a.t - b.t);
    },
  });
}
