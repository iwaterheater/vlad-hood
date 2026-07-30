import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { parseEther, type Address } from 'viem';
import { DEPLOYMENT, LAUNCH } from './chain';
import { quoterAbi } from './abi';

/**
 * What the router would actually return for a trade of this size.
 *
 * Priced through the QuoterV2 rather than off the pool's spot price, so the
 * figure already carries the fee and whatever the trade does to the price —
 * which is what a slippage floor has to be computed from to mean anything.
 */
export function useQuote(token: Address, side: 'buy' | 'sell', amount: string) {
  const client = usePublicClient();
  const parsed = (() => { try { return parseEther(amount || '0'); } catch { return 0n; } })();

  return useQuery({
    queryKey: ['quote', token, side, parsed.toString()],
    enabled: Boolean(client) && parsed > 0n,
    retry: false,
    /* A quote goes stale as soon as anyone else trades the pool. */
    staleTime: 10_000,
    queryFn: async (): Promise<bigint> => {
      const { result } = await client!.simulateContract({
        address: DEPLOYMENT.uniswap.quoter, abi: quoterAbi, functionName: 'quoteExactInputSingle',
        args: [{
          tokenIn: side === 'buy' ? DEPLOYMENT.uniswap.weth : token,
          tokenOut: side === 'buy' ? token : DEPLOYMENT.uniswap.weth,
          amountIn: parsed,
          fee: LAUNCH.poolFee,
          sqrtPriceLimitX96: 0n,
        }],
      });
      return result[0];
    },
  });
}

/** The floor a trade will accept, given a slippage tolerance in percent. */
export function minOut(quoted: bigint | undefined, slippagePct: number): bigint {
  if (!quoted) return 0n;
  const bps = BigInt(Math.round((100 - slippagePct) * 100));
  return (quoted * bps) / 10000n;
}
