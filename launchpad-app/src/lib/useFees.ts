import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import type { Address } from 'viem';
import { DEPLOYMENT } from './chain';
import { lockerAbi, poolAbi } from './abi';

export type PendingFees = {
  /** Both sides of the position, before the protocol share is taken out. */
  eth: bigint;
  tokens: bigint;
  /** Percent the platform keeps; the recipient gets the rest. */
  protocolShare: number;
};

/** The locker's own name for "this position has earned nothing yet". */
function isEmpty(e: unknown) {
  const err = e as { cause?: { data?: { errorName?: string }; cause?: { data?: { errorName?: string } } }; message?: string };
  const name = err.cause?.data?.errorName ?? err.cause?.cause?.data?.errorName;
  return name === 'NoFeesToCollect' || (err.message ?? '').includes('NoFeesToCollect');
}

/**
 * What a claim would pay out right now.
 *
 * The locker has no view function for this and the position's own tokensOwed
 * stays at zero until something touches it — measured against a pool with fees
 * waiting, it read 0 while a claim returned 0.00001 WETH. Simulating the claim
 * is the only honest number, since it is the very call the button will send.
 */
export function useFees(token?: Address, pool?: Address | null, caller?: Address) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['fees', token, caller],
    enabled: Boolean(client && token && pool && caller),
    retry: false,
    queryFn: async (): Promise<PendingFees | null> => {
      const [token0, protocolShare] = await Promise.all([
        client!.readContract({ address: pool!, abi: poolAbi, functionName: 'token0' }),
        client!.readContract({ address: DEPLOYMENT.locker, abi: lockerAbi, functionName: 'tokenProtocolFeeShares', args: [token!] }),
      ]);
      const wethIsToken0 = token0.toLowerCase() === DEPLOYMENT.uniswap.weth.toLowerCase();

      try {
        const { result } = await client!.simulateContract({
          address: DEPLOYMENT.locker, abi: lockerAbi, functionName: 'collectFees',
          args: [token!], account: caller!,
        });
        const [amount0, amount1] = result;
        return {
          eth: wethIsToken0 ? amount0 : amount1,
          tokens: wethIsToken0 ? amount1 : amount0,
          protocolShare: Number(protocolShare),
        };
      } catch (e) {
        if (isEmpty(e)) return null;
        throw e;
      }
    },
  });
}
