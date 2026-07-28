/* Community-takeover behaviour of VladhoodLaunchLocker.
 *
 * The fork adds one power — the owner can hand a token's creator fee payout to
 * another wallet — and these tests pin down its edges: that it reaches the fee
 * stream and nothing else, that a handover cannot be quietly undone by the
 * wallet that walked away, and that everything the original guaranteed is
 * still guaranteed. */

const { expect } = require('chai');
const { ethers } = require('hardhat');

async function deploy() {
  const [owner, creator, community, protocol, automation, stranger] = await ethers.getSigners();

  const ERC20 = await ethers.getContractFactory('MockERC20');
  const memeToken = await ERC20.deploy('Meme', 'MEME');
  const weth = await ERC20.deploy('Wrapped Ether', 'WETH');

  const Factory = await ethers.getContractFactory('MockFactory');
  const factory = await Factory.deploy();

  const PM = await ethers.getContractFactory('MockPositionManager');
  const pm = await PM.deploy(await memeToken.getAddress(), await weth.getAddress(), ethers.ZeroAddress);

  const Locker = await ethers.getContractFactory('VladhoodLaunchLocker');
  const locker = await Locker.deploy(owner.address, protocol.address, 10);

  await locker.connect(owner).initialize(await factory.getAddress());
  await pm.setOwner(await locker.getAddress());

  const token = await memeToken.getAddress();
  await register(factory, token, creator.address, pm, 1n, await weth.getAddress());
  await lock(factory, locker, token);

  return { owner, creator, community, protocol, automation, stranger, locker, factory, pm, token, memeToken, weth };
}

async function register(factory, token, deployer, pm, positionId, paired) {
  await factory.set(token, {
    token,
    deployer,
    pairedToken: paired,
    positionManager: await pm.getAddress(),
    positionId,
    dexId: 1n,
    launchConfigId: 1n,
    restrictionsEndBlock: 0n,
    supply: 1000n,
    isToken0: true,
    poolFee: 3000,
    exists: true,
    initialBuyAmount: 0n,
  });
}

// lockPosition carries onlyFactory, so route it through the mock factory
async function lock(factory, locker, token) {
  await factory.call(await locker.getAddress(), locker.interface.encodeFunctionData('lockPosition', [token]));
}

describe('VladhoodLaunchLocker — community takeover', function () {
  describe('the original guarantees still hold', function () {
    it('lets the deployer redirect their own payout', async function () {
      const { creator, community, locker, token } = await deploy();
      await expect(locker.connect(creator).setFeeRedirect(token, community.address))
        .to.emit(locker, 'FeeRedirectUpdated').withArgs(token, community.address);
      expect(await locker.feeRedirects(token)).to.equal(community.address);
    });

    it('refuses a plain redirect from anyone else, owner included', async function () {
      const { owner, stranger, community, locker, token } = await deploy();
      await expect(locker.connect(stranger).setFeeRedirect(token, community.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
      // the owner has reassignFeeRecipient for this; setFeeRedirect stays the
      // deployer's own function, exactly as in the original
      await expect(locker.connect(owner).setFeeRedirect(token, community.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
    });

    it('does not let the wallet a deployer pays redirect the fees onward', async function () {
      // routing fees to a service must not hand that service the right to route
      // them somewhere else — the original allowed only the deployer
      const { creator, community, stranger, locker, token } = await deploy();
      await locker.connect(creator).setFeeRedirect(token, community.address);
      await expect(locker.connect(community).setFeeRedirect(token, stranger.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
      expect(await locker.feeRecipientOf(token)).to.equal(community.address);
    });

    it('still splits collected fees between recipient and protocol', async function () {
      const { creator, protocol, locker, token, pm, memeToken, weth } = await deploy();
      await pm.accrue(1000n, 500n);
      await locker.connect(creator).collectFees(token);
      expect(await memeToken.balanceOf(creator.address)).to.equal(900n); // 10% protocol share
      expect(await memeToken.balanceOf(protocol.address)).to.equal(100n);
      expect(await weth.balanceOf(creator.address)).to.equal(450n);
      expect(await weth.balanceOf(protocol.address)).to.equal(50n);
    });
  });

  describe('reassigning the payout', function () {
    it('hands the fee stream to the new wallet and pays it thereafter', async function () {
      const { owner, creator, community, locker, token, pm, memeToken } = await deploy();
      await expect(locker.connect(owner).reassignFeeRecipient(token, community.address))
        .to.emit(locker, 'FeeRecipientReassigned').withArgs(token, community.address, creator.address);
      expect(await locker.feeRecipientOf(token)).to.equal(community.address);

      await pm.accrue(1000n, 0n);
      await locker.connect(community).collectFees(token);
      expect(await memeToken.balanceOf(community.address)).to.equal(900n);
      expect(await memeToken.balanceOf(creator.address)).to.equal(0n);
    });

    it('names the wallet it displaced, even when the deployer had redirected', async function () {
      const { owner, creator, community, stranger, locker, token } = await deploy();
      await locker.connect(creator).setFeeRedirect(token, stranger.address);
      await expect(locker.connect(owner).reassignFeeRecipient(token, community.address))
        .to.emit(locker, 'FeeRecipientReassigned').withArgs(token, community.address, stranger.address);
    });

    it('locks the abandoning deployer out, so they cannot take the payout back', async function () {
      const { owner, creator, community, stranger, locker, token } = await deploy();
      await locker.connect(owner).reassignFeeRecipient(token, community.address);

      expect(await locker.takenOver(token)).to.equal(true);
      await expect(locker.connect(creator).setFeeRedirect(token, creator.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');

      // the new steward controls it instead
      await expect(locker.connect(community).setFeeRedirect(token, stranger.address)).to.not.be.reverted;
      expect(await locker.feeRecipientOf(token)).to.equal(stranger.address);
    });

    it('can be applied again if the new steward also walks away', async function () {
      const { owner, community, stranger, locker, token } = await deploy();
      await locker.connect(owner).reassignFeeRecipient(token, community.address);
      await expect(locker.connect(owner).reassignFeeRecipient(token, stranger.address))
        .to.emit(locker, 'FeeRecipientReassigned').withArgs(token, stranger.address, community.address);
      expect(await locker.feeRecipientOf(token)).to.equal(stranger.address);
    });

    it('rejects a stranger and a zero destination', async function () {
      const { owner, stranger, community, locker, token } = await deploy();
      await expect(locker.connect(stranger).reassignFeeRecipient(token, community.address))
        .to.be.revertedWithCustomError(locker, 'OwnableUnauthorizedAccount');
      await expect(locker.connect(owner).reassignFeeRecipient(token, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(locker, 'ZeroAddress');
    });

    it('rejects a token this locker never locked', async function () {
      const { owner, community, stranger, locker } = await deploy();
      await expect(locker.connect(owner).reassignFeeRecipient(stranger.address, community.address))
        .to.be.revertedWithCustomError(locker, 'TokenNotFound');
    });
  });

  describe('what the power does not reach', function () {
    it('exposes no way to move the position NFT or pull liquidity', async function () {
      const { locker, pm } = await deploy();
      const names = locker.interface.fragments
        .filter((f) => f.type === 'function')
        .map((f) => f.name.toLowerCase());
      for (const forbidden of ['withdraw', 'transferposition', 'execute', 'call', 'decreaseliquidity', 'sweep']) {
        expect(names.some((n) => n.includes(forbidden)), `unexpected ${forbidden} entrypoint`).to.equal(false);
      }
      // and the NFT is still held by the locker after a reassignment
      expect(await pm.ownerOf(1n)).to.equal(await locker.getAddress());
    });

    it('does not touch the protocol share owed on the next claim', async function () {
      const { owner, community, protocol, locker, token, pm, memeToken } = await deploy();
      await locker.connect(owner).reassignFeeRecipient(token, community.address);
      await pm.accrue(1000n, 0n);
      await locker.connect(community).collectFees(token);
      expect(await memeToken.balanceOf(protocol.address)).to.equal(100n);
      expect(await memeToken.balanceOf(community.address)).to.equal(900n);
    });
  });

  describe('renouncing the power', function () {
    it('kills every future reassignment', async function () {
      const { owner, community, locker, token } = await deploy();
      await expect(locker.connect(owner).renounceReassignment()).to.emit(locker, 'ReassignmentRenouncedForever');
      expect(await locker.reassignmentRenounced()).to.equal(true);

      await expect(locker.connect(owner).reassignFeeRecipient(token, community.address))
        .to.be.revertedWithCustomError(locker, 'ReassignmentRenounced');
    });

    it('leaves the deployer free to redirect as always', async function () {
      const { owner, creator, community, locker, token } = await deploy();
      await locker.connect(owner).renounceReassignment();
      await expect(locker.connect(creator).setFeeRedirect(token, community.address)).to.not.be.reverted;
    });

    it('cannot be undone, and a stranger cannot trigger it', async function () {
      const { owner, stranger, locker } = await deploy();
      await expect(locker.connect(stranger).renounceReassignment())
        .to.be.revertedWithCustomError(locker, 'OwnableUnauthorizedAccount');
      await locker.connect(owner).renounceReassignment();
      await locker.connect(owner).renounceReassignment();      // idempotent, no way back
      expect(await locker.reassignmentRenounced()).to.equal(true);
    });
  });

  describe('recipient index bookkeeping survives a reassignment', function () {
    // _setFeeRedirect keeps feeRecipientTokens as a swap-and-pop array with a
    // parallel index map. Reassignment is a new call site for it, so the
    // invariant is asserted rather than assumed.
    it('keeps both arrays correct when one token of two moves', async function () {
      const { owner, creator, community, stranger, locker, factory, pm } = await deploy();

      const ERC20 = await ethers.getContractFactory('MockERC20');
      const second = await ERC20.deploy('Meme2', 'MEME2');
      const token2 = await second.getAddress();
      await register(factory, token2, creator.address, pm, 2n, token2);
      await lock(factory, locker, token2);

      const token1 = await locker.deployerTokens(creator.address, 0);
      await locker.connect(creator).setFeeRedirect(token1, stranger.address);
      await locker.connect(creator).setFeeRedirect(token2, stranger.address);
      expect(await locker.feeRecipientTokenCount(stranger.address)).to.equal(2n);

      await locker.connect(owner).reassignFeeRecipient(token1, community.address);

      expect(await locker.feeRecipientTokenCount(stranger.address)).to.equal(1n);
      expect(await locker.feeRecipientTokens(stranger.address, 0)).to.equal(token2);
      expect(await locker.feeRecipientTokenCount(community.address)).to.equal(1n);
      expect(await locker.feeRecipientTokens(community.address, 0)).to.equal(token1);
      expect(await locker.feeRecipientOf(token2)).to.equal(stranger.address);
    });
  });
});
