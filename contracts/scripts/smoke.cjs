/* Launches a throwaway token on a deployed launchpad and trades it, to prove the
 * deployment is actually alive rather than merely present.
 *
 *   npx hardhat run scripts/smoke.cjs --network rhTestnet
 *
 * Costs the launch fee plus gas. Never run this against a network you would mind
 * having a junk token on.
 *
 * A launch burns around 7M gas — fine on Robinhood Chain, whose block limit is
 * effectively unbounded, but above the cap a local `hardhat node` enforces. If
 * this fails locally with "gas limit is greater than the cap", that is the local
 * node talking, not the contracts.
 */

const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
];
const WETH_ABI = [
  'function deposit() payable',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

/* On Robinhood Chain the height eth_blockNumber reports is NOT the value
   contracts see in block.number — they differ by tens of millions. Anything
   compared against an on-chain block number has to be read the way a contract
   would, so ask the EVM: NUMBER, PUSH0, MSTORE, PUSH1 32, PUSH0, RETURN. */
async function evmBlockNumber() {
  return BigInt(await ethers.provider.call({ data: '0x435f5260205ff3' }));
}

async function main() {
  const [signer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const file = path.join(__dirname, '..', 'deployments', `${chainId}.json`);
  if (!fs.existsSync(file)) throw new Error(`no deployments/${chainId}.json — deploy first`);
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));

  console.log(`network   ${network.name} (chainId ${chainId})`);
  console.log(`caller    ${signer.address}`);
  console.log(`factory   ${d.contracts.factory}\n`);

  const factory = await ethers.getContractAt('VladhoodLaunchFactory', d.contracts.factory);
  const locker = await ethers.getContractAt('VladhoodLaunchLocker', d.contracts.locker);

  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  const salt = ethers.id(`smoke-${chainId}-${stamp}`);

  console.log('launching...');
  const receipt = await (await factory.launchToken(
    {
      name: `Smoke ${stamp}`,
      symbol: `SMK${stamp}`,
      logo: '',
      description: 'Deployment smoke test.',
      socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' },
      feeWallet: signer.address,
    },
    Number(d.config.launchConfigId),
    Number(d.config.dexId),
    salt,
    { value: BigInt(d.config.launchFee) },
  )).wait();

  const token = receipt.logs
    .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
    .find((e) => e && e.name === 'TokenDeployed').args.token;
  console.log(`  token   ${token}`);

  const v3 = new ethers.Contract(d.uniswapV3.factory, ['function getPool(address,address,uint24) view returns (address)'], ethers.provider);
  const pool = await v3.getPool(token, d.uniswapV3.weth, Number(d.config.poolFee));
  console.log(`  pool    ${pool}`);
  if (pool === ethers.ZeroAddress) throw new Error('no pool was created');

  // A launched token blocks pool buys in its launch block outright and caps them
  // for restrictionBlocks afterwards — anti-snipe, and it applies to us too. The
  // pool reports any revert from the token as a bare "TF", so wait it out rather
  // than trip it.
  const t = new ethers.Contract(token, ['function restrictionEndBlock() view returns (uint256)'], ethers.provider);
  const until = await t.restrictionEndBlock();
  process.stdout.write(`\nwaiting past the anti-snipe window (until block ${until})`);
  let now = await evmBlockNumber();
  while (now <= until) {
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 2000));
    now = await evmBlockNumber();
  }
  console.log(` now at ${now}`);

  // trade a slice of what is left rather than a fixed amount: on a faucet-funded
  // testnet wallet a hardcoded figure is usually more than the balance
  const left = await ethers.provider.getBalance(signer.address);
  const amountIn = left / 5n;
  if (amountIn === 0n) throw new Error('nothing left to trade with');
  console.log(`\nbuying ${ethers.formatEther(amountIn)} worth through the router...`);

  const weth = new ethers.Contract(d.uniswapV3.weth, WETH_ABI, signer);
  await (await weth.deposit({ value: amountIn })).wait();
  await (await weth.approve(d.uniswapV3.swapRouter, ethers.MaxUint256)).wait();

  const router = new ethers.Contract(d.uniswapV3.swapRouter, ROUTER_ABI, signer);
  await (await router.exactInputSingle({
    tokenIn: d.uniswapV3.weth,
    tokenOut: token,
    fee: Number(d.config.poolFee),
    recipient: signer.address,
    amountIn,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0,
  })).wait();

  const erc20 = new ethers.Contract(token, ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'], ethers.provider);
  console.log(`  bought  ${ethers.formatUnits(await erc20.balanceOf(signer.address), 18)} ${await erc20.symbol()}`);

  console.log('\ncollecting the trading fee...');
  const before = await weth.balanceOf(signer.address);
  await (await locker.collectFees(token)).wait();
  const gained = (await weth.balanceOf(signer.address)) - before;
  console.log(`  creator share ${ethers.formatEther(gained)} WETH (the platform keeps ${d.config.protocolFeeShare}%)`);
  if (gained === 0n) throw new Error('collected nothing — the fee split is not working');

  console.log('\nlive.');
}

main().catch((e) => { console.error('\n' + (e.message || e)); process.exitCode = 1; });
