/* Deploys the launchpad and wires it to a Uniswap V3 deployment.
 *
 * Local fork (what you want for clicking around):
 *   npx hardhat node --fork https://rpc.mainnet.chain.robinhood.com
 *   npx hardhat run scripts/deploy.cjs --network localhost
 *
 * Any other network: add it to hardhat.config.cjs, put its private key in
 * .env as PRIVATE_KEY, and point the V3 addresses below at that chain.
 *
 * Writes deployments/<chainId>.json, which the website reads.
 */

const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

// Uniswap V3 on Robinhood Chain (4663)
const V3 = {
  factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
  positionManager: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
  swapRouter: '0xCaf681a66D020601342297493863E78C959E5cb2',
  quoter: '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7',
  weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
};

// mirrors the settings a live launchpad on this chain runs
const DEX = { name: 'uniswap v3', poolFee: 10000, tickSpacing: 200 };
const LAUNCH = {
  graduationThreshold: ethers.parseEther('4.2'),
  initialTick: -204200,
  supply: 10n ** 27n, // 1,000,000,000 tokens
  maxWalletBps: 500,
  maxTxBps: 550,
  restrictionBlocks: 2,
  reservedFee: 0,
  routerRequiresDeadline: false,
};
const LAUNCH_FEE = ethers.parseEther('0.0005');
const PROTOCOL_FEE_SHARE = 30; // percent of the trading fee kept by the platform; creator gets the rest

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`network   ${network.name} (chainId ${chainId})`);
  console.log(`deployer  ${deployer.address}`);
  console.log(`balance   ${ethers.formatEther(balance)} ETH\n`);

  if (balance === 0n) throw new Error('deployer has no balance on this network');
  for (const [name, addr] of Object.entries(V3)) {
    if ((await ethers.provider.getCode(addr)) === '0x') {
      throw new Error(`no contract at the ${name} address ${addr} on chainId ${chainId} — ` +
        'this chain has no Uniswap V3 deployment, or it lives at different addresses');
    }
  }

  const protocolFeeRecipient = process.env.PROTOCOL_FEE_RECIPIENT || deployer.address;

  const Locker = await ethers.getContractFactory('VladhoodLaunchLocker');
  const locker = await Locker.deploy(deployer.address, protocolFeeRecipient, PROTOCOL_FEE_SHARE);
  await locker.waitForDeployment();
  console.log(`locker    ${await locker.getAddress()}`);

  const Factory = await ethers.getContractFactory('VladhoodLaunchFactory');
  const factory = await Factory.deploy(deployer.address, await locker.getAddress(), LAUNCH_FEE);
  await factory.waitForDeployment();
  console.log(`factory   ${await factory.getAddress()}`);

  // the locker binds to one factory, once and for good
  await (await locker.initialize(await factory.getAddress())).wait();

  await (await factory.addDexConfig({
    name: DEX.name,
    factory: V3.factory,
    positionManager: V3.positionManager,
    swapRouter: V3.swapRouter,
    poolFee: DEX.poolFee,
    tickSpacing: DEX.tickSpacing,
    enabled: true,
  })).wait();

  await (await factory.addLaunchConfig({
    pairToken: V3.weth,
    graduationThreshold: LAUNCH.graduationThreshold,
    initialTick: LAUNCH.initialTick,
    supply: LAUNCH.supply,
    maxWalletBps: LAUNCH.maxWalletBps,
    maxTxBps: LAUNCH.maxTxBps,
    restrictionBlocks: LAUNCH.restrictionBlocks,
    reservedFee: LAUNCH.reservedFee,
    enabled: true,
    routerRequiresDeadline: LAUNCH.routerRequiresDeadline,
  })).wait();

  // without this only whitelisted addresses can launch
  await (await factory.setLaunchEnabled(true)).wait();

  const out = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      factory: await factory.getAddress(),
      locker: await locker.getAddress(),
    },
    uniswapV3: V3,
    config: {
      launchFee: LAUNCH_FEE.toString(),
      protocolFeeShare: PROTOCOL_FEE_SHARE,
      protocolFeeRecipient,
      dexId: 0,
      launchConfigId: 0,
      poolFee: DEX.poolFee,
      tickSpacing: DEX.tickSpacing,
      initialTick: LAUNCH.initialTick,
      supply: LAUNCH.supply.toString(),
      graduationThreshold: LAUNCH.graduationThreshold.toString(),
    },
  };

  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${chainId}.json`), JSON.stringify(out, null, 2) + '\n');

  console.log(`\nlaunch fee        ${ethers.formatEther(LAUNCH_FEE)} ETH`);
  console.log(`protocol share    ${PROTOCOL_FEE_SHARE}% of trading fees -> ${protocolFeeRecipient}`);
  console.log(`launching open    ${await factory.launchEnabled()}`);
  console.log(`\nwrote deployments/${chainId}.json`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
