import { defineChain } from 'viem';

/**
 * Robinhood Chain testnet.
 *
 * Note for anything comparing against an on-chain block number: the height
 * eth_blockNumber reports here is NOT the value a contract reads from
 * block.number — measured 94,248,962 against 11,367,095. Launch tokens gate
 * pool buys on their own block number, so use evmBlockNumber() from ./blocks.
 */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  testnet: true,
});

/** Deployed by contracts/scripts/deploy.cjs — see contracts/deployments/46630.json */
export const DEPLOYMENT = {
  factory: '0x1a12745727fdc70046ac2a242A449b37403aeAb3',
  locker: '0x0C4AF79921aE71911e28ED2247DfE899c7AA9b6b',
  uniswap: {
    factory: '0x2237B2e256B957c478773C7213BEA489867F7C47',
    positionManager: '0x2C03bee99EA556333B06D9f7208D0C488EC183C8',
    swapRouter: '0x6e3d348166b9dDE078B6Ae4714A2669Cb209C825',
    quoter: '0x0530404DcE91A97f68e21211EC53437492f45AB1',
    weth: '0xa94f9cC9617bc6aa03ad7A835D168BcD15125a40',
  },
} as const;

/**
 * Where a pool can be looked at outside this site.
 *
 * Both indexers carry Robinhood Chain under the slug `robinhood`, and both
 * index the mainnet — a testnet pool asked for by address answers 404 there.
 * The links are the right shape regardless, so they start working the day this
 * launchpad points at mainnet; until then they lead to a not-found page.
 */
export const EXPLORERS = {
  slug: 'robinhood',
  dexScreenerPool: (pool: string) => `https://dexscreener.com/${EXPLORERS.slug}/${pool}`,
  geckoTerminalPool: (pool: string) => `https://www.geckoterminal.com/${EXPLORERS.slug}/pools/${pool}`,
} as const;

export const LAUNCH = {
  fee: 500000000000000n,          // 0.0005 ETH
  dexId: 0n,
  configId: 0n,
  poolFee: 10000,                 // 1%
  tickSpacing: 200,
  initialTick: -204200,           // every pool opens here, so a launch buy can be quoted
  supply: 10n ** 27n,
  graduationThreshold: 4200000000000000000n,
  protocolFeeShare: 30,           // percent; the creator keeps the rest
} as const;
