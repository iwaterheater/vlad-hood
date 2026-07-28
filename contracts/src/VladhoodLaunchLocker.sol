// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721ReceiverLike, INonfungiblePositionManagerLike, IPonsLaunchFactory} from "./interfaces/ILaunchpad.sol";

/**
 * @title VladhoodLaunchLocker
 * @notice Permanently holds launch position NFTs and distributes accrued fees.
 * The contract intentionally exposes no position withdrawal or arbitrary-call
 * function, so registered launch liquidity cannot be removed by an administrator.
 *
 * @dev Derived from PonsLaunchLocker (MIT), taken from the verified deployment at
 * 0x736D76699C26D0d966744cAe304C000d471f7F35 on Robinhood Chain. The custody and
 * fee-splitting logic is unchanged; this fork adds the community-takeover path
 * described below.
 *
 * ---------------------------------------------------------------------------
 * COMMUNITY TAKEOVER
 * ---------------------------------------------------------------------------
 * In the original contract only `launched.deployer` could ever move the creator
 * fee payout. When a creator walks away, their share accrues to a wallet nobody
 * holds the keys to and the community that kept the token alive gets nothing.
 *
 * This fork lets the owner reassign that payout, but never quietly and never
 * quickly. The rules are enforced by the contract, not by policy:
 *
 *   1. DORMANCY  — a takeover may only be proposed once the creator side has
 *      shown no on-chain sign of life for `dormancyPeriod`. Collecting fees,
 *      setting a redirect or calling `heartbeat` all count as a sign of life.
 *   2. TIMELOCK  — a proposal names the new wallet up front, emits an event and
 *      cannot execute for `takeoverDelay`. The deadline is stamped at proposal
 *      time, so shortening the delay afterwards cannot accelerate anything
 *      already pending.
 *   3. VETO      — during the window the creator (or the current fee recipient)
 *      cancels with one transaction. A `heartbeat` alone is enough: execution
 *      re-checks dormancy, so any sign of life makes the proposal unexecutable.
 *   4. FLOOR     — `MIN_DORMANCY_PERIOD` and `MIN_TAKEOVER_DELAY` are constants.
 *      The owner can make the process slower, never faster.
 *   5. EXIT      — `renounceTakeoverPower` is irreversible and kills the whole
 *      mechanism for every token, forever.
 *
 * What the owner still cannot do, here or in the original: withdraw liquidity,
 * touch the position NFT, or take the creator share for a token whose creator
 * is still active.
 */
contract VladhoodLaunchLocker is Ownable2Step, ReentrancyGuard, IERC721ReceiverLike {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_PROTOCOL_FEE_SHARE = 50;

    /// @notice Hard floors on the takeover process. The owner cannot go below these.
    uint64 public constant MIN_DORMANCY_PERIOD = 30 days;
    uint64 public constant MIN_TAKEOVER_DELAY = 3 days;

    error NotFactory();
    error NotAuthorized();
    error NotDeployer();
    error TokenNotFound();
    error PositionNotHeld();
    error PositionAlreadyLocked();
    error NoFeesToCollect();
    error InvalidProtocolFee();
    error AlreadyInitialized();
    error ZeroAddress();
    error TakeoverDisabled();
    error CreatorStillActive();
    error NoPendingTakeover();
    error TakeoverNotReady();
    error PeriodTooShort();

    event FactoryUpdated(address indexed factory);
    event PositionLocked(
        address indexed token,
        address indexed deployer,
        uint256 indexed dexId,
        address pairToken,
        uint256 positionId,
        address positionManager
    );
    event FeesClaimed(
        address indexed token,
        address indexed caller,
        address token0,
        address token1,
        uint256 recipientAmount0,
        uint256 recipientAmount1,
        uint256 protocolAmount0,
        uint256 protocolAmount1
    );
    event FeeRedirectUpdated(address indexed token, address indexed newFeeWallet);
    event FeeCollectorUpdated(address indexed collector, bool enabled);
    event ProtocolFeeRecipientUpdated(address recipient);
    event ProtocolFeeUpdated(uint256 share);

    event CreatorSignal(address indexed token, address indexed signaller, uint64 at);
    event TakeoverProposed(
        address indexed token,
        address indexed newFeeWallet,
        address indexed currentRecipient,
        uint64 executeAfter,
        uint64 dormantSince
    );
    event TakeoverCancelled(address indexed token, address indexed cancelledBy);
    event TakeoverExecuted(address indexed token, address indexed newFeeWallet, address indexed previousRecipient);
    event DormancyPeriodUpdated(uint64 period);
    event TakeoverDelayUpdated(uint64 delay);
    event TakeoverPowerRenounced();

    address public factory;
    address public protocolFeeRecipient;
    uint256 public protocolFeeShare;

    mapping(address collector => bool enabled) public feeCollectors;
    mapping(address token => address recipient) public feeRedirects;
    mapping(address token => uint256 share) public tokenProtocolFeeShares;
    mapping(address deployer => address[] tokens) public deployerTokens;
    mapping(address recipient => address[] tokens) public feeRecipientTokens;
    mapping(address token => uint256 indexPlusOne) private _feeRecipientTokenIndexes;
    mapping(address token => bool locked) private _lockedTokens;

    struct PendingTakeover {
        address newFeeWallet;
        uint64 executeAfter;
    }

    /// @notice Last moment the creator side proved it is still there, per token.
    mapping(address token => uint64 at) public lastCreatorSignal;
    mapping(address token => PendingTakeover) public pendingTakeovers;
    /// @notice True once a takeover has moved a token's payout away from its deployer.
    mapping(address token => bool) public takenOver;

    uint64 public dormancyPeriod;
    uint64 public takeoverDelay;
    bool public takeoverPowerRenounced;

    /**
     * @param initialOwner Administrative owner for fee policy and collectors.
     * @param initialProtocolFeeRecipient Recipient of the protocol fee share.
     * @param initialProtocolFeeShare Percentage from 0 through 100.
     * @param initialDormancyPeriod Silence required before a takeover may be proposed.
     * @param initialTakeoverDelay Timelock between proposing and executing a takeover.
     */
    constructor(
        address initialOwner,
        address initialProtocolFeeRecipient,
        uint256 initialProtocolFeeShare,
        uint64 initialDormancyPeriod,
        uint64 initialTakeoverDelay
    ) Ownable(initialOwner) {
        if (initialProtocolFeeRecipient == address(0)) revert ZeroAddress();
        if (initialProtocolFeeShare > MAX_PROTOCOL_FEE_SHARE) revert InvalidProtocolFee();
        if (initialDormancyPeriod < MIN_DORMANCY_PERIOD || initialTakeoverDelay < MIN_TAKEOVER_DELAY) {
            revert PeriodTooShort();
        }
        protocolFeeRecipient = initialProtocolFeeRecipient;
        protocolFeeShare = initialProtocolFeeShare;
        dormancyPeriod = initialDormancyPeriod;
        takeoverDelay = initialTakeoverDelay;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    /**
     * @notice Binds the locker to one immutable launch factory.
     */
    function initialize(address factory_) external onlyOwner {
        if (factory != address(0)) revert AlreadyInitialized();
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactoryUpdated(factory_);
    }

    /**
     * @notice Accepts only launch NFTs transferred by the configured factory.
     */
    function onERC721Received(address operator, address from, uint256, bytes calldata) external view returns (bytes4) {
        if (operator != factory || from != factory) revert NotFactory();
        return IERC721ReceiverLike.onERC721Received.selector;
    }

    /**
     * @notice Registers and verifies permanent custody of a launched position.
     */
    function lockPosition(address token) external onlyFactory {
        if (_lockedTokens[token]) revert PositionAlreadyLocked();

        IPonsLaunchFactory.LaunchedToken memory launched = IPonsLaunchFactory(factory).getLaunchedToken(token);
        if (!launched.exists || launched.token != token) revert TokenNotFound();

        address nftOwner = INonfungiblePositionManagerLike(launched.positionManager).ownerOf(launched.positionId);
        if (nftOwner != address(this)) revert PositionNotHeld();

        _lockedTokens[token] = true;
        tokenProtocolFeeShares[token] = protocolFeeShare;
        deployerTokens[launched.deployer].push(token);
        // the dormancy clock starts at launch, not at zero
        _signal(token, launched.deployer);

        emit PositionLocked(
            token,
            launched.deployer,
            launched.dexId,
            launched.pairedToken,
            launched.positionId,
            launched.positionManager
        );
    }

    /**
     * @notice Collects V3 fees and splits both assets under the configured policy.
     */
    function collectFees(address token) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        IPonsLaunchFactory.LaunchedToken memory launched = getLaunchedToken(token);
        if (!launched.exists || !_lockedTokens[token]) revert TokenNotFound();

        address recipient = feeRedirects[token];
        if (recipient == address(0)) recipient = launched.deployer;
        if (
            msg.sender != owner() && msg.sender != launched.deployer && msg.sender != recipient
                && !feeCollectors[msg.sender]
        ) {
            revert NotAuthorized();
        }

        // Claiming your own fees proves you are still there. A claim made by the
        // owner or an automation collector does not: it says nothing about the
        // creator, and must not be able to reset someone else's dormancy clock.
        if (_isCreatorSide(token, launched.deployer, msg.sender)) _signal(token, msg.sender);

        INonfungiblePositionManagerLike manager = INonfungiblePositionManagerLike(launched.positionManager);
        address token0;
        address token1;
        (,, token0, token1,,,,,,,,) = manager.positions(launched.positionId);

        (amount0, amount1) = manager.collect(
            INonfungiblePositionManagerLike.CollectParams({
                tokenId: launched.positionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        if (amount0 == 0 && amount1 == 0) revert NoFeesToCollect();

        uint256 tokenProtocolFeeShare = tokenProtocolFeeShares[token];
        uint256 protocolAmount0 = (amount0 * tokenProtocolFeeShare) / 100;
        uint256 protocolAmount1 = (amount1 * tokenProtocolFeeShare) / 100;
        uint256 recipientAmount0 = amount0 - protocolAmount0;
        uint256 recipientAmount1 = amount1 - protocolAmount1;

        _transferIfPositive(token0, protocolFeeRecipient, protocolAmount0);
        _transferIfPositive(token1, protocolFeeRecipient, protocolAmount1);
        _transferIfPositive(token0, recipient, recipientAmount0);
        _transferIfPositive(token1, recipient, recipientAmount1);

        emit FeesClaimed(
            token, msg.sender, token0, token1, recipientAmount0, recipientAmount1, protocolAmount0, protocolAmount1
        );
    }

    /**
     * @notice Returns the factory record for a launch token.
     */
    function getLaunchedToken(address token) public view returns (IPonsLaunchFactory.LaunchedToken memory) {
        if (factory == address(0)) revert TokenNotFound();
        return IPonsLaunchFactory(factory).getLaunchedToken(token);
    }

    /**
     * @notice Redirects the creator share for one token.
     * @dev Callable by the launch deployer or the factory during launch setup.
     */
    function setFeeRedirect(address token, address newFeeWallet) external {
        IPonsLaunchFactory.LaunchedToken memory launched = getLaunchedToken(token);
        if (!launched.exists) revert TokenNotFound();
        if (msg.sender != factory && msg.sender != _redirectControllerOf(token, launched.deployer)) {
            revert NotDeployer();
        }
        // moving your own payout is a sign of life; the factory wiring up a
        // launch is not, and lockPosition stamps that separately
        if (msg.sender != factory) {
            _signal(token, msg.sender);
            _clearPending(token, msg.sender);
        }
        _setFeeRedirect(token, newFeeWallet);
    }

    // ---------------------------------------------------------------------
    // community takeover
    // ---------------------------------------------------------------------

    /**
     * @notice Proves the creator side is still there and resets the dormancy clock.
     * @dev Callable by the launch deployer or the wallet currently receiving the
     * creator share. Free of any other side effect, and it cancels a pending
     * takeover outright, so one cheap transaction is a complete defence.
     */
    function heartbeat(address token) external {
        IPonsLaunchFactory.LaunchedToken memory launched = getLaunchedToken(token);
        if (!launched.exists || !_lockedTokens[token]) revert TokenNotFound();
        if (!_isCreatorSide(token, launched.deployer, msg.sender)) revert NotAuthorized();
        _signal(token, msg.sender);
        _clearPending(token, msg.sender);
    }

    /**
     * @notice Opens a timelocked proposal to hand the creator share to a new wallet.
     * @dev Only for tokens whose creator side has been silent for `dormancyPeriod`.
     * The wallet is named now and cannot be swapped later without restarting the
     * clock, and the deadline is stamped now so a shorter delay cannot be applied
     * retroactively.
     */
    function proposeTakeover(address token, address newFeeWallet) external onlyOwner {
        if (takeoverPowerRenounced) revert TakeoverDisabled();
        if (newFeeWallet == address(0)) revert ZeroAddress();

        IPonsLaunchFactory.LaunchedToken memory launched = getLaunchedToken(token);
        if (!launched.exists || !_lockedTokens[token]) revert TokenNotFound();
        if (!_isDormant(token)) revert CreatorStillActive();

        uint64 executeAfter = uint64(block.timestamp) + takeoverDelay;
        pendingTakeovers[token] = PendingTakeover({newFeeWallet: newFeeWallet, executeAfter: executeAfter});

        emit TakeoverProposed(
            token, newFeeWallet, _recipientOf(token, launched.deployer), executeAfter, lastCreatorSignal[token]
        );
    }

    /**
     * @notice Withdraws a pending takeover.
     * @dev The creator, the current fee recipient and the owner can all cancel.
     */
    function cancelTakeover(address token) external {
        if (pendingTakeovers[token].executeAfter == 0) revert NoPendingTakeover();

        IPonsLaunchFactory.LaunchedToken memory launched = getLaunchedToken(token);
        if (msg.sender != owner() && !_isCreatorSide(token, launched.deployer, msg.sender)) {
            revert NotAuthorized();
        }
        // cancelling by the creator side also proves they are there
        if (msg.sender != owner()) _signal(token, msg.sender);
        _clearPending(token, msg.sender);
    }

    /**
     * @notice Applies a takeover once its timelock has run out.
     * @dev Dormancy is re-checked here, so any sign of life during the window —
     * a heartbeat, a fee claim, a redirect — makes the proposal unexecutable
     * without the creator having to send a cancel transaction.
     */
    function executeTakeover(address token) external onlyOwner {
        if (takeoverPowerRenounced) revert TakeoverDisabled();

        PendingTakeover memory pending = pendingTakeovers[token];
        if (pending.executeAfter == 0) revert NoPendingTakeover();
        if (block.timestamp < pending.executeAfter) revert TakeoverNotReady();
        if (!_isDormant(token)) revert CreatorStillActive();

        IPonsLaunchFactory.LaunchedToken memory launched = getLaunchedToken(token);
        address previous = _recipientOf(token, launched.deployer);

        delete pendingTakeovers[token];
        // from here the deployer loses the unilateral redirect: without this the
        // wallet that abandoned the token could simply take the payout straight
        // back, and the whole process would be theatre
        takenOver[token] = true;
        _setFeeRedirect(token, pending.newFeeWallet);
        // the new recipient starts with a full dormancy window of their own
        _signal(token, pending.newFeeWallet);

        emit TakeoverExecuted(token, pending.newFeeWallet, previous);
    }

    /**
     * @notice Gives up the takeover power for every token, permanently.
     * @dev There is no way back. Pending proposals become unexecutable.
     */
    function renounceTakeoverPower() external onlyOwner {
        takeoverPowerRenounced = true;
        emit TakeoverPowerRenounced();
    }

    /**
     * @notice Lengthens or shortens the silence required before a proposal.
     * @dev Floored at `MIN_DORMANCY_PERIOD`. Applies to future proposals only.
     */
    function setDormancyPeriod(uint64 period) external onlyOwner {
        if (period < MIN_DORMANCY_PERIOD) revert PeriodTooShort();
        dormancyPeriod = period;
        emit DormancyPeriodUpdated(period);
    }

    /**
     * @notice Changes the timelock applied to future proposals.
     * @dev Floored at `MIN_TAKEOVER_DELAY`. Deadlines already stamped on pending
     * proposals are untouched, so this cannot speed up a takeover in flight.
     */
    function setTakeoverDelay(uint64 delay) external onlyOwner {
        if (delay < MIN_TAKEOVER_DELAY) revert PeriodTooShort();
        takeoverDelay = delay;
        emit TakeoverDelayUpdated(delay);
    }

    /**
     * @notice True once the creator side has been silent for `dormancyPeriod`.
     */
    function isDormant(address token) external view returns (bool) {
        return _isDormant(token);
    }

    /**
     * @notice Seconds until a takeover may be proposed, or zero if it may be now.
     */
    function dormantIn(address token) external view returns (uint64) {
        uint64 last = lastCreatorSignal[token];
        if (last == 0) return type(uint64).max;
        uint64 ready = last + dormancyPeriod;
        return block.timestamp >= ready ? 0 : ready - uint64(block.timestamp);
    }

    /**
     * @notice The wallet that currently receives the creator share.
     */
    function feeRecipientOf(address token) external view returns (address) {
        return _recipientOf(token, getLaunchedToken(token).deployer);
    }

    /**
     * @notice Grants or revokes fee collection permission.
     */
    function setFeeCollector(address collector, bool enabled) external onlyOwner {
        if (collector == address(0)) revert ZeroAddress();
        feeCollectors[collector] = enabled;
        emit FeeCollectorUpdated(collector, enabled);
    }

    /**
     * @notice Changes the protocol fee recipient.
     */
    function setProtocolFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        protocolFeeRecipient = recipient;
        emit ProtocolFeeRecipientUpdated(recipient);
    }

    /**
     * @notice Changes the fee share snapshotted by future token launches.
     */
    function setProtocolFeeShare(uint256 share) external onlyOwner {
        if (share > MAX_PROTOCOL_FEE_SHARE) revert InvalidProtocolFee();
        protocolFeeShare = share;
        emit ProtocolFeeUpdated(share);
    }

    /**
     * @notice Returns the number of tokens indexed for one deployer.
     */
    function deployerTokenCount(address deployer_) external view returns (uint256) {
        return deployerTokens[deployer_].length;
    }

    /**
     * @notice Returns the number of tokens indexed for one fee recipient.
     */
    function feeRecipientTokenCount(address recipient_) external view returns (uint256) {
        return feeRecipientTokens[recipient_].length;
    }

    function _isDormant(address token) private view returns (bool) {
        uint64 last = lastCreatorSignal[token];
        if (last == 0) return false; // never locked here — nothing to take over
        return block.timestamp >= uint256(last) + dormancyPeriod;
    }

    /**
     * @notice Who may move the payout of one token.
     * @dev Before a takeover this is the deployer and nobody else, exactly as in
     * the original contract: a deployer who routes fees to a service or a
     * multisig must not thereby hand that party the right to route them onward.
     * After a takeover the deployer is out and the new recipient takes over the
     * right, otherwise the abandoning wallet could undo the handover.
     */
    function _redirectControllerOf(address token, address deployer_) private view returns (address) {
        return takenOver[token] ? _recipientOf(token, deployer_) : deployer_;
    }

    /**
     * @notice Who is allowed to speak for the creator share of one token.
     * @dev Used for proof of life and for cancelling a takeover, never for moving
     * the payout. Before a takeover both the deployer and the wallet they pay can
     * defend the token; afterwards only the new recipient can, so the abandoning
     * wallet cannot keep the token out of reach forever.
     */
    function _isCreatorSide(address token, address deployer_, address who) private view returns (bool) {
        if (who == _recipientOf(token, deployer_)) return true;
        return !takenOver[token] && who == deployer_;
    }

    function _recipientOf(address token, address deployer_) private view returns (address) {
        address recipient = feeRedirects[token];
        return recipient == address(0) ? deployer_ : recipient;
    }

    function _signal(address token, address who) private {
        uint64 at = uint64(block.timestamp);
        lastCreatorSignal[token] = at;
        emit CreatorSignal(token, who, at);
    }

    function _clearPending(address token, address who) private {
        if (pendingTakeovers[token].executeAfter == 0) return;
        delete pendingTakeovers[token];
        emit TakeoverCancelled(token, who);
    }

    /**
     * @notice Stores a creator-fee redirect and indexes the recipient for Profile reads.
     */
    function _setFeeRedirect(address token, address newFeeWallet) private {
        address previousFeeWallet = feeRedirects[token];
        if (previousFeeWallet == newFeeWallet) return;

        uint256 previousIndexPlusOne = _feeRecipientTokenIndexes[token];
        if (previousFeeWallet != address(0) && previousIndexPlusOne != 0) {
            address[] storage previousTokens = feeRecipientTokens[previousFeeWallet];
            uint256 previousIndex = previousIndexPlusOne - 1;
            uint256 lastIndex = previousTokens.length - 1;
            if (previousIndex != lastIndex) {
                address movedToken = previousTokens[lastIndex];
                previousTokens[previousIndex] = movedToken;
                _feeRecipientTokenIndexes[movedToken] = previousIndex + 1;
            }
            previousTokens.pop();
            delete _feeRecipientTokenIndexes[token];
        }

        feeRedirects[token] = newFeeWallet;
        if (newFeeWallet != address(0)) {
            feeRecipientTokens[newFeeWallet].push(token);
            _feeRecipientTokenIndexes[token] = feeRecipientTokens[newFeeWallet].length;
        }
        emit FeeRedirectUpdated(token, newFeeWallet);
    }

    function _transferIfPositive(address token, address recipient, uint256 amount) private {
        if (amount != 0) IERC20(token).safeTransfer(recipient, amount);
    }
}
