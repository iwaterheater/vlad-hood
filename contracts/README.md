# Vladhood Launchpad — contracts

Launch factory, permanent liquidity locker and launch token for the Vladhood launchpad,
plus the community-takeover path for the creator fee share.

| File | Licence |
|---|---|
| `src/VladhoodLaunchFactory.sol` | MIT |
| `src/VladhoodLaunchLocker.sol` | MIT |
| `src/VladhoodLauncherToken.sol` | MIT |
| `src/interfaces/ILaunchpad.sol` | MIT |
| `src/libraries/VladhoodLiquidityMath.sol` | MIT |
| `src/libraries/VladhoodTickMath.sol` | **GPL-2.0-or-later** |

`VladhoodTickMath.sol` is a port of the Uniswap V3 tick maths and is copyleft. A distributed
work that includes it inherits that obligation, so either publish the whole thing under
GPL-2.0-or-later or replace that file before release. The twenty constants in it must stay
bit-exact — the Uniswap pool contract uses the same ones, and a one-wei disagreement means
the launch price does not match the tick it claims. **Decide this before deploying.**

## Community takeover

`reassignFeeRecipient(token, wallet)` hands the creator fee stream of one token to another
wallet. Only the owner can call it, it emits an event naming both the new wallet and the one
it displaced, and it reaches the fee stream and nothing else — liquidity stays locked, the
position NFT stays put, the token is untouched.

Who deserves the fees is decided off-chain, before the call. An earlier draft encoded that
judgement in the contract — a dormancy period, a timelock, a veto — and it was dropped: any
dormancy long enough to mean anything is far longer than the days a real takeover takes, so
it blocked the honest case while a determined operator would simply wait it out.

Two rules did survive, because they are defects under any design:

* `takenOver[token]` stops the deployer taking the payout straight back after a handover,
  which would otherwise undo it in one transaction;
* `_redirectControllerOf` keeps `setFeeRedirect` to the deployer alone — a wallet the
  deployer merely *pays* must not inherit the right to route the fees onward.

`renounceReassignment()` gives the power up permanently, with no way back.

## Build

Solc 0.8.30, optimizer on at 300 runs, `viaIR`, `evmVersion: cancun`.

```
npm install
npx hardhat compile
npx hardhat test
```

## Status

**Not audited. Not deployed.** 16 tests cover the reassignment path and the surrounding
custody and fee-split behaviour. That is self-review, not a third-party audit, and it is no
substitute for one on a contract that custodies liquidity.
