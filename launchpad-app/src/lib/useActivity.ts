import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { DEPLOYMENT } from './chain';
import { poolAbi } from './abi';

export type Activity = { volumeEth: number; lastBuy: number };

/**
 * Traded volume and the last buy, per token, straight from the pools.
 *
 * The static board sorted by these too, but both were derived from its demo
 * trade lists — "Recent buys" was launch time wearing a different name. Here
 * they are the pool's own Swap log, so the pills mean what they say.
 */
export function useActivity(tokens?: { address: Address; pool: Address | null }[]) {
  const client = usePublicClient();
  const pools = (tokens ?? []).filter((t) => t.pool);

  return useQuery({
    queryKey: ['activity', pools.map((t) => t.pool).join(',')],
    enabled: Boolean(client && pools.length),
    queryFn: async () => {
      const out = new Map<string, Activity>();

      await Promise.all(
        pools.map(async (t) => {
          const logs = await client!
            .getContractEvents({ address: t.pool!, abi: poolAbi, eventName: 'Swap', fromBlock: 0n, toBlock: 'latest' })
            .catch(() => []);
          if (!logs.length) return;

          /* A V3 pair is ordered by address, so which side holds WETH follows
             from the two addresses alone — no round trip per pool. */
          const wethIsToken0 = DEPLOYMENT.uniswap.weth.toLowerCase() < t.address.toLowerCase();

          let volumeEth = 0;
          let lastBuyBlock = 0n;
          for (const l of logs) {
            const paired = (wethIsToken0 ? l.args.amount0 : l.args.amount1) as bigint;
            volumeEth += Number(paired < 0n ? -paired : paired) / 1e18;
            /* WETH went into the pool, so this swap bought the token */
            if (paired > 0n && l.blockNumber > lastBuyBlock) lastBuyBlock = l.blockNumber;
          }

          let lastBuy = 0;
          if (lastBuyBlock > 0n) {
            const block = await client!.getBlock({ blockNumber: lastBuyBlock }).catch(() => null);
            if (block) lastBuy = Number(block.timestamp) * 1000;
          }
          out.set(t.address.toLowerCase(), { volumeEth, lastBuy });
        }),
      );

      return out;
    },
  });
}
