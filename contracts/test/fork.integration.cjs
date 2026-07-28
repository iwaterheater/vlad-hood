/* End-to-end launch against the real Uniswap V3 deployment on Robinhood Chain.
 *
 * Runs on a local fork, so it costs nothing and touches no live state, but every
 * contract the launchpad talks to — the V3 factory, the position manager, the
 * router — is the real one at its real address. Unit tests use mocks and prove
 * the rules; this proves the thing actually launches.
 *
 *   FORK=1 npx hardhat test test/fork.integration.cjs
 */

const { expect } = require('chai');
const { ethers, network } = require('hardhat');

// Robinhood Chain, chainId 4663
const V3_FACTORY = '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA';
const POSITION_MANAGER = '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3';
const SWAP_ROUTER = '0xCaf681a66D020601342297493863E78C959E5cb2';
const WETH = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';

// the settings the live launchpad on this chain actually runs
const POOL_FEE = 10000;                 // 1%
const TICK_SPACING = 200;
const INITIAL_TICK = -204200;
const SUPPLY = 10n ** 27n;              // 1,000,000,000 tokens, 18 decimals
const GRADUATION = ethers.parseEther('4.2');
const LAUNCH_FEE = ethers.parseEther('0.0005');
const PROTOCOL_SHARE = 30;              // 30% platform / 70% creator, as pons runs it

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
];
const WETH_ABI = [
  'function deposit() payable',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
const V3_FACTORY_ABI = ['function getPool(address,address,uint24) view returns (address)'];
const POOL_ABI = ['function liquidity() view returns (uint128)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'];
const POSITIONS_ABI = ['function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128 liquidity,uint256,uint256,uint128,uint128)'];

const forking = network.config.forking && network.config.forking.enabled;
const suite = forking ? describe : describe.skip;

suite('Vladhood launchpad — live launch on a fork of Robinhood Chain', function () {
  this.timeout(300000);

  let owner, creator, buyer, community, protocol;
  let locker, factory, token, pool;

  before(async function () {
    [owner, creator, buyer, community, protocol] = await ethers.getSigners();

    const Locker = await ethers.getContractFactory('VladhoodLaunchLocker');
    locker = await Locker.deploy(owner.address, protocol.address, PROTOCOL_SHARE);

    const Factory = await ethers.getContractFactory('VladhoodLaunchFactory');
    factory = await Factory.deploy(owner.address, await locker.getAddress(), LAUNCH_FEE);

    await locker.connect(owner).initialize(await factory.getAddress());

    await factory.connect(owner).addDexConfig({
      name: 'uniswap v3',
      factory: V3_FACTORY,
      positionManager: POSITION_MANAGER,
      swapRouter: SWAP_ROUTER,
      poolFee: POOL_FEE,
      tickSpacing: TICK_SPACING,
      enabled: true,
    });

    await factory.connect(owner).addLaunchConfig({
      pairToken: WETH,
      graduationThreshold: GRADUATION,
      initialTick: INITIAL_TICK,
      supply: SUPPLY,
      maxWalletBps: 500,
      maxTxBps: 550,
      restrictionBlocks: 2,
      reservedFee: 0,
      enabled: true,
      routerRequiresDeadline: false,
    });

    // launching is gated off until the owner opens it — the live deployment
    // has this on, so the fork run must turn it on too
    await factory.connect(owner).setLaunchEnabled(true);
  });

  it('confirms the chain really is Robinhood Chain with Uniswap V3 on it', async function () {
    expect((await ethers.provider.getNetwork()).chainId).to.equal(4663n);
    for (const [name, addr] of Object.entries({ V3_FACTORY, POSITION_MANAGER, SWAP_ROUTER, WETH })) {
      const code = await ethers.provider.getCode(addr);
      expect(code.length, `${name} has no code`).to.be.greaterThan(2);
    }
  });

  it('launches a token and puts real liquidity in a real V3 pool', async function () {
    const salt = ethers.id('vladhood-fork-test-1');
    const tx = await factory.connect(creator).launchToken(
      {
        name: 'Sherwood Test',
        symbol: 'SHTEST',
        logo: 'https://vlad-hood.xyz/photo_1_2026-07-21_06-14-24.jpg',
        description: 'Fork run, not a real launch.',
        socials: { twitter: '', telegram: '', discord: '', website: 'https://vlad-hood.xyz', farcaster: '' },
        feeWallet: creator.address,
      },
      0, 0, salt,
      { value: LAUNCH_FEE },
    );
    const receipt = await tx.wait();

    const deployed = receipt.logs
      .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === 'TokenDeployed');
    expect(deployed, 'no TokenDeployed event').to.not.equal(undefined);
    token = deployed.args.token;

    const v3 = new ethers.Contract(V3_FACTORY, V3_FACTORY_ABI, ethers.provider);
    pool = await v3.getPool(token, WETH, POOL_FEE);
    expect(pool).to.not.equal(ethers.ZeroAddress);

    const record = await locker.getLaunchedToken(token);

    // a launch mints a single-sided position, so the pool's *active* liquidity
    // is legitimately zero until the price moves into range — what matters is
    // that the position itself holds the supply
    const pm = new ethers.Contract(POSITION_MANAGER, POSITIONS_ABI, ethers.provider);
    const position = await pm.positions(record.positionId);
    expect(position.liquidity, 'position holds no liquidity').to.be.greaterThan(0n);

    const p = new ethers.Contract(pool, POOL_ABI, ethers.provider);
    const [, tick] = await p.slot0();
    // the factory flips the sign when the new token sorts as token1, so the
    // starting price is the configured one either way round
    expect(Number(tick)).to.equal(record.isToken0 ? INITIAL_TICK : -INITIAL_TICK);

    expect(record.exists).to.equal(true);
    expect(record.deployer).to.equal(creator.address);
    expect(await locker.feeRecipientOf(token)).to.equal(creator.address);
  });

  it('holds the position NFT in the locker, not with the creator', async function () {
    const pm = new ethers.Contract(POSITION_MANAGER, ['function ownerOf(uint256) view returns (address)'], ethers.provider);
    const record = await locker.getLaunchedToken(token);
    expect(await pm.ownerOf(record.positionId)).to.equal(await locker.getAddress());
  });

  it('lets someone actually buy the token through the real router', async function () {
    const weth = new ethers.Contract(WETH, WETH_ABI, buyer);
    await (await weth.deposit({ value: ethers.parseEther('2') })).wait();
    await (await weth.approve(SWAP_ROUTER, ethers.MaxUint256)).wait();

    const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, buyer);
    await (await router.exactInputSingle({
      tokenIn: WETH,
      tokenOut: token,
      fee: POOL_FEE,
      recipient: buyer.address,
      amountIn: ethers.parseEther('1'),
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0,
    })).wait();

    const erc20 = new ethers.Contract(token, ['function balanceOf(address) view returns (uint256)'], ethers.provider);
    expect(await erc20.balanceOf(buyer.address), 'buyer received nothing').to.be.greaterThan(0n);
  });

  it('pays the trading fee to the creator, minus the protocol share', async function () {
    const weth = new ethers.Contract(WETH, WETH_ABI, ethers.provider);
    const before = await weth.balanceOf(creator.address);
    const protoBefore = await weth.balanceOf(protocol.address);

    await (await locker.connect(creator).collectFees(token)).wait();

    const gained = (await weth.balanceOf(creator.address)) - before;
    const proto = (await weth.balanceOf(protocol.address)) - protoBefore;
    expect(gained, 'creator collected nothing').to.be.greaterThan(0n);
    expect(proto, 'protocol collected nothing').to.be.greaterThan(0n);

    // a 1% pool fee on a 1 WETH buy is ~0.01 WETH, split 70/30
    const total = gained + proto;
    const protoPct = Number((proto * 10000n) / total) / 100;
    expect(protoPct).to.be.closeTo(PROTOCOL_SHARE, 0.5);
    console.log(`        total ${ethers.formatEther(total)} WETH -> creator ${ethers.formatEther(gained)}, platform ${ethers.formatEther(proto)} (${protoPct}%)`);
  });

  it('hands the fee stream to the community and pays them from then on', async function () {
    await (await locker.connect(owner).reassignFeeRecipient(token, community.address)).wait();
    expect(await locker.feeRecipientOf(token)).to.equal(community.address);

    // trade again so there is something to collect
    const weth = new ethers.Contract(WETH, WETH_ABI, buyer);
    const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, buyer);
    await (await router.exactInputSingle({
      tokenIn: WETH, tokenOut: token, fee: POOL_FEE, recipient: buyer.address,
      amountIn: ethers.parseEther('0.5'), amountOutMinimum: 0, sqrtPriceLimitX96: 0,
    })).wait();

    const wethRead = new ethers.Contract(WETH, WETH_ABI, ethers.provider);
    const creatorBefore = await wethRead.balanceOf(creator.address);
    const communityBefore = await wethRead.balanceOf(community.address);

    await (await locker.connect(community).collectFees(token)).wait();

    expect((await wethRead.balanceOf(community.address)) - communityBefore).to.be.greaterThan(0n);
    expect((await wethRead.balanceOf(creator.address)) - creatorBefore).to.equal(0n);
  });

  it('leaves the liquidity locked — nobody can pull it', async function () {
    const pm = new ethers.Contract(POSITION_MANAGER, ['function ownerOf(uint256) view returns (address)'], ethers.provider);
    const record = await locker.getLaunchedToken(token);
    expect(await pm.ownerOf(record.positionId)).to.equal(await locker.getAddress());

    const pmRead = new ethers.Contract(POSITION_MANAGER, POSITIONS_ABI, ethers.provider);
    expect((await pmRead.positions(record.positionId)).liquidity).to.be.greaterThan(0n);
  });
});
