import { formatEther, zeroAddress, type Address, type PublicClient } from 'viem';
import { DEPLOYMENT, LAUNCH } from './chain';
import { factoryAbi, tokenAbi, poolAbi, v3FactoryAbi, lockerAbi } from './abi';

export type LaunchedToken = {
  address: Address;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  socials: { twitter: string; telegram: string; discord: string; website: string; farcaster: string };
  deployer: Address;
  feeRecipient: Address | null;
  takenOver: boolean;
  pool: Address | null;
  totalSupply: bigint;
  priceInEth: number | null;
  marketCapEth: number | null;
  pooledEth: number;
  progressPct: number;
  launchedAt: number | null;
};

/** Price of one token in the paired asset, from a pool's sqrtPriceX96. */
export function priceFromSqrt(sqrtPriceX96: bigint, tokenIsToken0: boolean): number {
  const q96 = 2n ** 96n;
  const scaled = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) / (q96 * q96);
  const asFloat = Number(scaled) / 1e18;
  if (tokenIsToken0) return asFloat;
  return asFloat === 0 ? 0 : 1 / asFloat;
}

/**
 * A launched token has no picture until someone uploads one, so its board art is
 * derived from the address: same address, same face and colour, everywhere.
 */
const FACES = ['doge', 'shiba', 'pepe', 'coin', 'raccoon', 'cat', 'monk', 'ape', 'fox', 'owl'] as const;
const BGS = ['#f2d98a', '#cde8d8', '#e6dcc2', '#f2c4d8', '#cfe0cd', '#dcd2ea', '#efdfc4', '#d9dce6', '#f0cdb4', '#d8e8c0'];

export function faceFor(address: string) {
  let h = 0;
  const a = address.toLowerCase();
  for (let i = 2; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  return { kind: FACES[h % FACES.length], bg: BGS[(h >>> 8) % BGS.length] };
}

/** Every token this launchpad has created, newest first. */
export async function fetchLaunched(client: PublicClient) {
  const logs = await client.getContractEvents({
    address: DEPLOYMENT.factory,
    abi: factoryAbi,
    eventName: 'TokenLaunched',
    fromBlock: 0n,
    toBlock: 'latest',
  });
  return logs
    .map((l) => ({
      token: l.args.token as Address,
      deployer: l.args.deployer as Address,
      pool: l.args.pool as Address,
      blockNumber: l.blockNumber,
    }))
    .reverse();
}

export async function fetchToken(client: PublicClient, address: Address): Promise<LaunchedToken> {
  const [name, symbol, totalSupply, info, feeRecipient, takenOver] = await Promise.all([
    client.readContract({ address, abi: tokenAbi, functionName: 'name' }),
    client.readContract({ address, abi: tokenAbi, functionName: 'symbol' }),
    client.readContract({ address, abi: tokenAbi, functionName: 'totalSupply' }),
    client.readContract({ address, abi: tokenAbi, functionName: 'getTokenInfo' }),
    client.readContract({ address: DEPLOYMENT.locker, abi: lockerAbi, functionName: 'feeRecipientOf', args: [address] }).catch(() => null),
    client.readContract({ address: DEPLOYMENT.locker, abi: lockerAbi, functionName: 'takenOver', args: [address] }).catch(() => false),
  ]);

  const pool = await client
    .readContract({
      address: DEPLOYMENT.uniswap.factory, abi: v3FactoryAbi, functionName: 'getPool',
      args: [address, DEPLOYMENT.uniswap.weth, LAUNCH.poolFee],
    })
    .catch(() => zeroAddress);

  let priceInEth: number | null = null;
  let pooledEth = 0;
  if (pool && pool !== zeroAddress) {
    try {
      const [slot0, token0, weth] = await Promise.all([
        client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' }),
        client.readContract({ address: pool, abi: poolAbi, functionName: 'token0' }),
        client.readContract({ address: DEPLOYMENT.uniswap.weth, abi: tokenAbi, functionName: 'balanceOf', args: [pool] }),
      ]);
      priceInEth = priceFromSqrt(slot0[0], token0.toLowerCase() === address.toLowerCase());
      pooledEth = Number(formatEther(weth));
    } catch { /* a pool that will not read yet leaves the price unknown */ }
  }

  const supply = Number(formatEther(totalSupply));
  const graduation = Number(formatEther(LAUNCH.graduationThreshold));

  return {
    address,
    name, symbol,
    logo: info[1],
    description: info[2],
    socials: info[3],
    deployer: info[0],
    feeRecipient: feeRecipient as Address | null,
    takenOver: Boolean(takenOver),
    pool: pool === zeroAddress ? null : (pool as Address),
    totalSupply,
    priceInEth,
    marketCapEth: priceInEth === null ? null : priceInEth * supply,
    pooledEth,
    progressPct: graduation > 0 ? Math.min(100, (pooledEth / graduation) * 100) : 0,
    launchedAt: null,
  };
}
