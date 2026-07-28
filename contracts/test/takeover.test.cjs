/* Community-takeover behaviour of VladhoodLaunchLocker.
 *
 * The point of these tests is not that the happy path works — it is that the
 * owner cannot reach the creator share of a token whose creator is still there,
 * and cannot shorten the window once a proposal is public. */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const DAY = 24 * 60 * 60;
const DORMANCY = 90 * DAY;
const DELAY = 7 * DAY;

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
  const locker = await Locker.deploy(owner.address, protocol.address, 10, DORMANCY, DELAY);

  await locker.connect(owner).initialize(await factory.getAddress());
  await pm.setOwner(await locker.getAddress());

  const token = await memeToken.getAddress();
  await factory.set(token, {
    token,
    deployer: creator.address,
    pairedToken: await weth.getAddress(),
    positionManager: await pm.getAddress(),
    positionId: 1n,
    dexId: 1n,
    launchConfigId: 1n,
    restrictionsEndBlock: 0n,
    supply: 1000n,
    isToken0: true,
    poolFee: 3000,
    exists: true,
    initialBuyAmount: 0n,
  });

  // lockPosition is onlyFactory, so route it through the mock factory
  const data = locker.interface.encodeFunctionData('lockPosition', [token]);
  await factory.call(await locker.getAddress(), data);

  return { owner, creator, community, protocol, automation, stranger, locker, factory, pm, token, memeToken, weth };
}

describe('VladhoodLaunchLocker — community takeover', function () {
  describe('the original guarantees still hold', function () {
    it('lets the deployer redirect their own payout', async function () {
      const { creator, community, locker, token } = await deploy();
      await expect(locker.connect(creator).setFeeRedirect(token, community.address))
        .to.emit(locker, 'FeeRedirectUpdated').withArgs(token, community.address);
      expect(await locker.feeRedirects(token)).to.equal(community.address);
    });

    it('refuses a redirect from anyone else, owner included', async function () {
      const { owner, stranger, community, locker, token } = await deploy();
      await expect(locker.connect(stranger).setFeeRedirect(token, community.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
      await expect(locker.connect(owner).setFeeRedirect(token, community.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
    });

    it('does not let the wallet a deployer pays redirect the fees onward', async function () {
      // the original allowed only the deployer; routing fees to a service must
      // not hand that service the right to route them somewhere else
      const { creator, community, stranger, locker, token } = await deploy();
      await locker.connect(creator).setFeeRedirect(token, community.address);
      await expect(locker.connect(community).setFeeRedirect(token, stranger.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
      expect(await locker.feeRecipientOf(token)).to.equal(community.address);

      // but that wallet can still defend the token against a takeover
      await expect(locker.connect(community).heartbeat(token)).to.not.be.reverted;
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

  describe('dormancy gate', function () {
    it('a fresh launch is not dormant', async function () {
      const { locker, token } = await deploy();
      expect(await locker.isDormant(token)).to.equal(false);
      expect(await locker.dormantIn(token)).to.be.greaterThan(0n);
    });

    it('blocks a proposal until the creator has been silent long enough', async function () {
      const { owner, community, locker, token } = await deploy();
      await time.increase(DORMANCY - 100);
      await expect(locker.connect(owner).proposeTakeover(token, community.address))
        .to.be.revertedWithCustomError(locker, 'CreatorStillActive');

      await time.increase(200);
      await expect(locker.connect(owner).proposeTakeover(token, community.address))
        .to.emit(locker, 'TakeoverProposed');
    });

    it('a creator fee claim resets the clock', async function () {
      const { owner, creator, community, locker, token, pm } = await deploy();
      await time.increase(DORMANCY - 100);
      await pm.accrue(1000n, 0n);
      await locker.connect(creator).collectFees(token);

      await time.increase(200);
      expect(await locker.isDormant(token)).to.equal(false);
      await expect(locker.connect(owner).proposeTakeover(token, community.address))
        .to.be.revertedWithCustomError(locker, 'CreatorStillActive');
    });

    it('a claim by the OWNER does not reset the clock', async function () {
      const { owner, community, locker, token, pm } = await deploy();
      await time.increase(DORMANCY + 10);
      await pm.accrue(1000n, 0n);
      await locker.connect(owner).collectFees(token);   // routes funds to the creator
      expect(await locker.isDormant(token)).to.equal(true);
    });

    it('a claim by an automation collector does not reset the clock', async function () {
      const { owner, automation, locker, token, pm } = await deploy();
      await locker.connect(owner).setFeeCollector(automation.address, true);
      await time.increase(DORMANCY + 10);
      await pm.accrue(1000n, 0n);
      await locker.connect(automation).collectFees(token);
      expect(await locker.isDormant(token)).to.equal(true);
    });

    it('never treats an unknown token as dormant', async function () {
      const { owner, community, locker, stranger } = await deploy();
      expect(await locker.isDormant(stranger.address)).to.equal(false);
      await expect(locker.connect(owner).proposeTakeover(stranger.address, community.address))
        .to.be.revertedWithCustomError(locker, 'TokenNotFound');
    });
  });

  describe('timelock', function () {
    it('will not execute before the deadline', async function () {
      const { owner, community, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);

      await time.increase(DELAY - 100);
      await expect(locker.connect(owner).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'TakeoverNotReady');
    });

    it('cannot be accelerated by shortening the delay afterwards', async function () {
      const { owner, community, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      const pendingBefore = await locker.pendingTakeovers(token);

      await locker.connect(owner).setTakeoverDelay(3 * DAY);           // the floor
      const pendingAfter = await locker.pendingTakeovers(token);
      expect(pendingAfter.executeAfter).to.equal(pendingBefore.executeAfter);

      await time.increase(3 * DAY + 10);
      await expect(locker.connect(owner).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'TakeoverNotReady');
    });

    it('refuses periods below the hard floors', async function () {
      const { owner, locker } = await deploy();
      await expect(locker.connect(owner).setTakeoverDelay(3 * DAY - 1))
        .to.be.revertedWithCustomError(locker, 'PeriodTooShort');
      await expect(locker.connect(owner).setDormancyPeriod(30 * DAY - 1))
        .to.be.revertedWithCustomError(locker, 'PeriodTooShort');
    });

    it('rejects a constructor below the floors', async function () {
      const [owner, , , protocol] = await ethers.getSigners();
      const Locker = await ethers.getContractFactory('VladhoodLaunchLocker');
      await expect(Locker.deploy(owner.address, protocol.address, 10, 29 * DAY, DELAY))
        .to.be.revertedWithCustomError(Locker, 'PeriodTooShort');
      await expect(Locker.deploy(owner.address, protocol.address, 10, DORMANCY, 2 * DAY))
        .to.be.revertedWithCustomError(Locker, 'PeriodTooShort');
    });
  });

  describe('the creator can always defend', function () {
    it('a heartbeat cancels the proposal and makes it unexecutable', async function () {
      const { owner, creator, community, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);

      await expect(locker.connect(creator).heartbeat(token))
        .to.emit(locker, 'TakeoverCancelled').withArgs(token, creator.address);

      await time.increase(DELAY + 10);
      await expect(locker.connect(owner).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'NoPendingTakeover');
    });

    it('a fee claim during the window blocks execution even without a cancel', async function () {
      const { owner, creator, community, locker, token, pm } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);

      await pm.accrue(1000n, 0n);
      await locker.connect(creator).collectFees(token);   // sign of life, no cancel sent

      await time.increase(DELAY + 10);
      await expect(locker.connect(owner).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'CreatorStillActive');
    });

    it('the creator can cancel outright', async function () {
      const { owner, creator, community, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await expect(locker.connect(creator).cancelTakeover(token))
        .to.emit(locker, 'TakeoverCancelled').withArgs(token, creator.address);
      expect((await locker.pendingTakeovers(token)).executeAfter).to.equal(0n);
    });

    it('the current fee recipient can cancel too', async function () {
      const { owner, creator, community, stranger, locker, token } = await deploy();
      await locker.connect(creator).setFeeRedirect(token, stranger.address);
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await expect(locker.connect(stranger).cancelTakeover(token))
        .to.emit(locker, 'TakeoverCancelled').withArgs(token, stranger.address);
    });

    it('refuses a heartbeat or cancel from an unrelated wallet', async function () {
      const { owner, community, stranger, locker, token } = await deploy();
      await expect(locker.connect(stranger).heartbeat(token))
        .to.be.revertedWithCustomError(locker, 'NotAuthorized');
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await expect(locker.connect(stranger).cancelTakeover(token))
        .to.be.revertedWithCustomError(locker, 'NotAuthorized');
    });
  });

  describe('executing a takeover', function () {
    it('hands the payout to the new wallet and pays it thereafter', async function () {
      const { owner, creator, community, locker, token, pm, memeToken } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await time.increase(DELAY + 10);

      await expect(locker.connect(owner).executeTakeover(token))
        .to.emit(locker, 'TakeoverExecuted').withArgs(token, community.address, creator.address);
      expect(await locker.feeRecipientOf(token)).to.equal(community.address);

      await pm.accrue(1000n, 0n);
      await locker.connect(community).collectFees(token);
      expect(await memeToken.balanceOf(community.address)).to.equal(900n);
      expect(await memeToken.balanceOf(creator.address)).to.equal(0n);
    });

    it('gives the new recipient a full dormancy window of their own', async function () {
      const { owner, community, locker, token, stranger } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await time.increase(DELAY + 10);
      await locker.connect(owner).executeTakeover(token);

      expect(await locker.isDormant(token)).to.equal(false);
      await expect(locker.connect(owner).proposeTakeover(token, stranger.address))
        .to.be.revertedWithCustomError(locker, 'CreatorStillActive');
    });

    it('clears the proposal, so it cannot be replayed', async function () {
      const { owner, community, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await time.increase(DELAY + 10);
      await locker.connect(owner).executeTakeover(token);
      await expect(locker.connect(owner).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'NoPendingTakeover');
    });

    it('locks the abandoning deployer out, so they cannot take the payout back', async function () {
      const { owner, creator, community, stranger, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await time.increase(DELAY + 10);
      await locker.connect(owner).executeTakeover(token);

      expect(await locker.takenOver(token)).to.equal(true);
      // the wallet that walked away cannot undo the handover
      await expect(locker.connect(creator).setFeeRedirect(token, creator.address))
        .to.be.revertedWithCustomError(locker, 'NotDeployer');
      await expect(locker.connect(creator).heartbeat(token))
        .to.be.revertedWithCustomError(locker, 'NotAuthorized');

      // the new steward controls it instead
      await expect(locker.connect(community).setFeeRedirect(token, stranger.address)).to.not.be.reverted;
      expect(await locker.feeRecipientOf(token)).to.equal(stranger.address);
    });

    it('a claim by the locked-out deployer no longer resets the dormancy clock', async function () {
      const { owner, creator, community, locker, token, pm } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);
      await time.increase(DELAY + 10);
      await locker.connect(owner).executeTakeover(token);

      await time.increase(DORMANCY + 10);
      await pm.accrue(1000n, 0n);
      // the old deployer is still an allowed *caller* of collectFees, but the
      // money goes to the community and the clock must not move
      await locker.connect(creator).collectFees(token);
      expect(await locker.isDormant(token)).to.equal(true);
    });
  });

  describe('recipient index bookkeeping survives a takeover', function () {
    // _setFeeRedirect keeps feeRecipientTokens as a swap-and-pop array with a
    // parallel index map. A takeover is a new call site for it, so the invariant
    // is asserted rather than assumed.
    it('keeps both arrays correct when a takeover moves one token of two', async function () {
      const { owner, creator, community, protocol, stranger, locker, factory, pm } = await deploy();

      const ERC20 = await ethers.getContractFactory('MockERC20');
      const second = await ERC20.deploy('Meme2', 'MEME2');
      const token2 = await second.getAddress();
      await factory.set(token2, {
        token: token2, deployer: creator.address, pairedToken: token2,
        positionManager: await pm.getAddress(), positionId: 2n, dexId: 1n, launchConfigId: 1n,
        restrictionsEndBlock: 0n, supply: 1000n, isToken0: true, poolFee: 3000,
        exists: true, initialBuyAmount: 0n,
      });
      await factory.call(await locker.getAddress(),
        locker.interface.encodeFunctionData('lockPosition', [token2]));

      const token1 = await locker.deployerTokens(creator.address, 0);
      // the creator parks both payouts on one wallet
      await locker.connect(creator).setFeeRedirect(token1, stranger.address);
      await locker.connect(creator).setFeeRedirect(token2, stranger.address);
      expect(await locker.feeRecipientTokenCount(stranger.address)).to.equal(2n);

      // one of them is taken over
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token1, community.address);
      await time.increase(DELAY + 10);
      await locker.connect(owner).executeTakeover(token1);

      expect(await locker.feeRecipientTokenCount(stranger.address)).to.equal(1n);
      expect(await locker.feeRecipientTokens(stranger.address, 0)).to.equal(token2);
      expect(await locker.feeRecipientTokenCount(community.address)).to.equal(1n);
      expect(await locker.feeRecipientTokens(community.address, 0)).to.equal(token1);
      expect(await locker.feeRecipientOf(token2)).to.equal(stranger.address);
    });
  });

  describe('nobody but the owner drives it', function () {
    it('rejects propose, execute and renounce from a stranger', async function () {
      const { community, stranger, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await expect(locker.connect(stranger).proposeTakeover(token, community.address))
        .to.be.revertedWithCustomError(locker, 'OwnableUnauthorizedAccount');
      await expect(locker.connect(stranger).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'OwnableUnauthorizedAccount');
      await expect(locker.connect(stranger).renounceTakeoverPower())
        .to.be.revertedWithCustomError(locker, 'OwnableUnauthorizedAccount');
    });

    it('rejects a zero destination', async function () {
      const { owner, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await expect(locker.connect(owner).proposeTakeover(token, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(locker, 'ZeroAddress');
    });
  });

  describe('renouncing the power', function () {
    it('kills future proposals and any pending one', async function () {
      const { owner, community, locker, token } = await deploy();
      await time.increase(DORMANCY + 10);
      await locker.connect(owner).proposeTakeover(token, community.address);

      await expect(locker.connect(owner).renounceTakeoverPower()).to.emit(locker, 'TakeoverPowerRenounced');
      expect(await locker.takeoverPowerRenounced()).to.equal(true);

      await time.increase(DELAY + 10);
      await expect(locker.connect(owner).executeTakeover(token))
        .to.be.revertedWithCustomError(locker, 'TakeoverDisabled');
      await expect(locker.connect(owner).proposeTakeover(token, community.address))
        .to.be.revertedWithCustomError(locker, 'TakeoverDisabled');
    });

    it('leaves the creator free to redirect as always', async function () {
      const { owner, creator, community, locker, token } = await deploy();
      await locker.connect(owner).renounceTakeoverPower();
      await expect(locker.connect(creator).setFeeRedirect(token, community.address)).to.not.be.reverted;
    });
  });
});
