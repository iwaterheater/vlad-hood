/* Proves the "put Uniswap on a bare chain" path works, on a bare chain.
 *
 * Runs on the default in-process network — no fork, nothing pre-deployed, which
 * is exactly the situation on Robinhood Chain's testnet. If this passes, the
 * same steps work there; if it fails, it fails for free. */

const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const INITCODE = require('../scripts/uniswap-initcode.json');
const abi = new ethers.AbiCoder();

function withArgs(creationCode, wordCount, types, values) {
  return creationCode.slice(0, creationCode.length - wordCount * 64) + abi.encode(types, values).slice(2);
}

async function deployRaw(signer, data) {
  const receipt = await (await signer.sendTransaction({ data })).wait();
  return receipt.contractAddress;
}

// skip when forking: the fork already has Uniswap, and this is about not having it
const bare = !(network.config.forking && network.config.forking.enabled);
const suite = bare ? describe : describe.skip;

suite('bootstrapping Uniswap V3 on a chain that has none', function () {
  this.timeout(300000);

  let deployer, creator, buyer, protocol;
  let weth, v3Factory, positionManager, swapRouter, quoter;
  let locker, factory, token;

  const POOL_FEE = 10000;

  before(async function () {
    [deployer, creator, buyer, protocol] = await ethers.getSigners();

    const WETH = await ethers.getContractFactory('WETH9');
    const w = await WETH.deploy();
    await w.waitForDeployment();
    weth = await w.getAddress();

    v3Factory = await deployRaw(deployer, INITCODE.v3Factory.creationCode);
    const descriptor = await deployRaw(deployer, withArgs(
      INITCODE.descriptorLib.creationCode, 2,
      ['address', 'bytes32'], [weth, ethers.encodeBytes32String('ETH')],
    ));
    positionManager = await deployRaw(deployer, withArgs(
      INITCODE.positionManager.creationCode, 3,
      ['address', 'address', 'address'], [v3Factory, weth, descriptor],
    ));
    swapRouter = await deployRaw(deployer, withArgs(
      INITCODE.swapRouter.creationCode, 4,
      ['address', 'address', 'address', 'address'],
      [ethers.ZeroAddress, v3Factory, positionManager, weth],
    ));
    quoter = await deployRaw(deployer, withArgs(
      INITCODE.quoter.creationCode, 2,
      ['address', 'address'], [v3Factory, weth],
    ));
  });

  it('deploys every piece with code at its address', async function () {
    for (const [name, addr] of Object.entries({ weth, v3Factory, positionManager, swapRouter, quoter })) {
      expect(await ethers.provider.getCode(addr), `${name} has no code`).to.not.equal('0x');
    }
  });

  it('wires the periphery to the factory and the wrapped token we just deployed', async function () {
    const pm = new ethers.Contract(positionManager, [
      'function factory() view returns (address)', 'function WETH9() view returns (address)',
    ], ethers.provider);
    expect(await pm.factory()).to.equal(v3Factory);
    expect(await pm.WETH9()).to.equal(weth);

    const sr = new ethers.Contract(swapRouter, [
      'function factory() view returns (address)', 'function WETH9() view returns (address)',
    ], ethers.provider);
    expect(await sr.factory()).to.equal(v3Factory);
    expect(await sr.WETH9()).to.equal(weth);
  });

  it('keeps the 1% fee tier the launchpad config depends on', async function () {
    const f = new ethers.Contract(v3Factory, ['function feeAmountTickSpacing(uint24) view returns (int24)'], ethers.provider);
    expect(await f.feeAmountTickSpacing(POOL_FEE)).to.equal(200n);
  });

  it('launches a token into it, end to end', async function () {
    const Locker = await ethers.getContractFactory('VladhoodLaunchLocker');
    locker = await Locker.deploy(deployer.address, protocol.address, 30);
    const Factory = await ethers.getContractFactory('VladhoodLaunchFactory');
    factory = await Factory.deploy(deployer.address, await locker.getAddress(), ethers.parseEther('0.0005'));
    await locker.initialize(await factory.getAddress());

    await factory.addDexConfig({
      name: 'uniswap v3', factory: v3Factory, positionManager, swapRouter,
      poolFee: POOL_FEE, tickSpacing: 200, enabled: true,
    });
    await factory.addLaunchConfig({
      pairToken: weth, graduationThreshold: ethers.parseEther('4.2'), initialTick: -204200,
      supply: 10n ** 27n, maxWalletBps: 500, maxTxBps: 550, restrictionBlocks: 2,
      reservedFee: 0, enabled: true, routerRequiresDeadline: false,
    });
    await factory.setLaunchEnabled(true);

    const receipt = await (await factory.connect(creator).launchToken(
      {
        name: 'Bare Chain Test', symbol: 'BARE', logo: '', description: '',
        socials: { twitter: '', telegram: '', discord: '', website: '', farcaster: '' },
        feeWallet: creator.address,
      },
      0, 0, ethers.id('bare-1'), { value: ethers.parseEther('0.0005') },
    )).wait();

    token = receipt.logs
      .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === 'TokenDeployed').args.token;

    const v3 = new ethers.Contract(v3Factory, ['function getPool(address,address,uint24) view returns (address)'], ethers.provider);
    expect(await v3.getPool(token, weth, POOL_FEE)).to.not.equal(ethers.ZeroAddress);
  });

  it('trades against the pool and pays the fee out 70/30', async function () {
    const w = new ethers.Contract(weth, [
      'function deposit() payable', 'function approve(address,uint256) returns (bool)',
      'function balanceOf(address) view returns (uint256)',
    ], buyer);
    await (await w.deposit({ value: ethers.parseEther('2') })).wait();
    await (await w.approve(swapRouter, ethers.MaxUint256)).wait();

    const router = new ethers.Contract(swapRouter, [
      'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
    ], buyer);
    await (await router.exactInputSingle({
      tokenIn: weth, tokenOut: token, fee: POOL_FEE, recipient: buyer.address,
      amountIn: ethers.parseEther('1'), amountOutMinimum: 0, sqrtPriceLimitX96: 0,
    })).wait();

    const read = new ethers.Contract(weth, ['function balanceOf(address) view returns (uint256)'], ethers.provider);
    const c0 = await read.balanceOf(creator.address);
    const p0 = await read.balanceOf(protocol.address);
    await (await locker.connect(creator).collectFees(token)).wait();
    const gained = (await read.balanceOf(creator.address)) - c0;
    const proto = (await read.balanceOf(protocol.address)) - p0;

    expect(gained).to.be.greaterThan(0n);
    const pct = Number((proto * 10000n) / (gained + proto)) / 100;
    expect(pct).to.be.closeTo(30, 0.5);
  });
});
