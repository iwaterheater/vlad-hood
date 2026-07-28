/* Puts a working Uniswap V3 on a chain that has none.
 *
 * The contracts are not recompiled from source — the creation bytecode is taken
 * verbatim from the transactions that deployed Uniswap on Robinhood Chain
 * mainnet (see fetch-uniswap-initcode.cjs). That matters: the V3 factory embeds
 * the hash of the pool creation code, and the periphery embeds the same hash to
 * compute pool addresses. Recompiling with a different compiler would change it,
 * the two halves would disagree, and every pool lookup would point at nothing.
 * Redeploying identical bytes keeps them in agreement.
 *
 * Only the constructor arguments are rewritten, to point at the contracts we are
 * deploying now instead of the mainnet ones.
 *
 *   npx hardhat run scripts/deploy-uniswap.cjs --network rhTestnet
 *
 * Writes deployments/uniswap-<chainId>.json.
 */

const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

const INITCODE = require('./uniswap-initcode.json');
const abi = new ethers.AbiCoder();

/* The last N 32-byte words of the creation code are the ABI-encoded constructor
   arguments. Chop them off and append our own. */
function withArgs(creationCode, wordCount, types, values) {
  const body = creationCode.slice(0, creationCode.length - wordCount * 64);
  return body + abi.encode(types, values).slice(2);
}

async function deployRaw(signer, label, data) {
  const tx = await signer.sendTransaction({ data });
  const receipt = await tx.wait();
  if (!receipt.contractAddress) throw new Error(`${label}: deployment produced no address`);
  const code = await ethers.provider.getCode(receipt.contractAddress);
  if (code === '0x') throw new Error(`${label}: deployed but has no code`);
  console.log(`  ${label.padEnd(18)} ${receipt.contractAddress}  ${(code.length - 2) / 2} bytes`);
  return receipt.contractAddress;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`network   ${network.name} (chainId ${chainId})`);
  console.log(`deployer  ${deployer.address}`);
  console.log(`balance   ${ethers.formatEther(balance)} ETH\n`);
  if (balance === 0n) throw new Error('deployer has no balance on this network');

  if (chainId === 4663) {
    throw new Error('Robinhood Chain mainnet already has Uniswap V3 — refusing to deploy a second one');
  }

  console.log('deploying:');

  // WETH9 is compiled from source: mainnet's was created through a deployer
  // contract, so its creation code is not recoverable from the transaction.
  const WETH = await ethers.getContractFactory('WETH9');
  const weth = await WETH.deploy();
  await weth.waitForDeployment();
  const wethAddress = await weth.getAddress();
  console.log(`  ${'WETH9'.padEnd(18)} ${wethAddress}`);

  // no constructor arguments
  const v3Factory = await deployRaw(deployer, 'UniswapV3Factory', INITCODE.v3Factory.creationCode);

  // NonfungibleTokenPositionDescriptor(address WETH9, bytes32 nativeCurrencyLabel).
  // Its tokenURI path calls a linked NFTDescriptor library that only exists on
  // mainnet, so tokenURI will revert here. Nothing else touches it: minting,
  // collecting and burning positions all work.
  const descriptor = await deployRaw(deployer, 'PositionDescriptor', withArgs(
    INITCODE.descriptorLib.creationCode, 2,
    ['address', 'bytes32'],
    [wethAddress, ethers.encodeBytes32String('ETH')],
  ));

  // NonfungiblePositionManager(address factory, address WETH9, address tokenDescriptor)
  const positionManager = await deployRaw(deployer, 'PositionManager', withArgs(
    INITCODE.positionManager.creationCode, 3,
    ['address', 'address', 'address'],
    [v3Factory, wethAddress, descriptor],
  ));

  // SwapRouter02(address factoryV2, address factoryV3, address positionManager, address WETH9).
  // There is no Uniswap V2 here, so factoryV2 is the zero address; only the V2
  // code paths use it and the launchpad never takes them.
  const swapRouter = await deployRaw(deployer, 'SwapRouter02', withArgs(
    INITCODE.swapRouter.creationCode, 4,
    ['address', 'address', 'address', 'address'],
    [ethers.ZeroAddress, v3Factory, positionManager, wethAddress],
  ));

  // QuoterV2(address factory, address WETH9)
  const quoter = await deployRaw(deployer, 'QuoterV2', withArgs(
    INITCODE.quoter.creationCode, 2,
    ['address', 'address'],
    [v3Factory, wethAddress],
  ));

  console.log('\nchecking the pieces agree with each other:');
  const checks = [
    ['positionManager.factory()', positionManager, 'function factory() view returns (address)', v3Factory],
    ['positionManager.WETH9()', positionManager, 'function WETH9() view returns (address)', wethAddress],
    ['swapRouter.factory()', swapRouter, 'function factory() view returns (address)', v3Factory],
    ['swapRouter.WETH9()', swapRouter, 'function WETH9() view returns (address)', wethAddress],
    ['quoter.factory()', quoter, 'function factory() view returns (address)', v3Factory],
  ];
  for (const [label, addr, sig, expected] of checks) {
    const got = await new ethers.Contract(addr, [sig], ethers.provider)[sig.match(/function (\w+)/)[1]]();
    const ok = got.toLowerCase() === expected.toLowerCase();
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(28)} ${got}`);
    if (!ok) throw new Error(`${label} points at ${got}, expected ${expected}`);
  }

  // the fee tiers a fresh V3 factory enables by default
  const f = new ethers.Contract(v3Factory, ['function feeAmountTickSpacing(uint24) view returns (int24)'], ethers.provider);
  const tiers = {};
  for (const fee of [500, 3000, 10000]) tiers[fee] = Number(await f.feeAmountTickSpacing(fee));
  console.log(`  ok   fee tiers                  ${JSON.stringify(tiers)}`);
  if (tiers[10000] !== 200) throw new Error('the 1% fee tier is missing — the launchpad config expects it');

  const out = {
    chainId,
    network: network.name,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    note: 'Uniswap V3 redeployed from the mainnet creation bytecode; tokenURI on positions is not functional here.',
    contracts: {
      weth: wethAddress,
      factory: v3Factory,
      positionDescriptor: descriptor,
      positionManager,
      swapRouter,
      quoter,
    },
  };
  const dir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `uniswap-${chainId}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote deployments/uniswap-${chainId}.json`);
}

main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
