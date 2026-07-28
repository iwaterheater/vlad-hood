# Vladhood Launchpad — contracts

A fork of the **pons** launchpad contracts, taken from the verified deployment on
Robinhood Chain and extended with a community-takeover path for the creator fee share.

## Provenance

Sources were pulled from the block explorer, not from a repository — pons publishes no
GitHub and no release. Every file keeps the SPDX header it was published with.

| File | Origin | Licence |
|---|---|---|
| `src/PonsLaunchFactory.sol` | `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB` | MIT |
| `src/PonsLaunchLocker.sol` | `0x736D76699C26D0d966744cAe304C000d471f7F35` | MIT |
| `src/PonsLauncherToken.sol` | verified with the factory | MIT |
| `src/interfaces/ILaunchpad.sol` | verified with the factory | MIT |
| `src/libraries/PonsLiquidityMath.sol` | verified with the factory | MIT |
| `src/libraries/PonsTickMath.sol` | verified with the factory | **GPL-2.0-or-later** |
| `src/VladhoodLaunchLocker.sol` | this fork, derived from the locker | MIT |

`PonsTickMath.sol` is a port of Uniswap V3 `TickMath` and is copyleft. A distributed work
that includes it inherits that obligation — so either publish the whole thing under
GPL-2.0-or-later, or replace that file before release. **Decide this before deploying.**

## The baseline is an exact reproduction

Compiled with solc 0.8.30, optimizer on at 300 runs, `viaIR`, `evmVersion: cancun`, the
build reproduces the deployed code:

* `PonsLaunchLocker` — deployed bytecode **byte-identical** (excluding the trailing
  metadata hash): 5373 bytes either way.
* `PonsLaunchFactory` — identical except at 23 offsets, all of which are the immutable
  `locker` address baked in at deploy time. Same length, 24300 bytes.

That is what makes the fork trustworthy as a starting point: the code being modified is
provably the code that is running.

## What the fork changes

Only `VladhoodLaunchLocker.sol`, and only around who may move the creator fee payout.
Custody, the fee split and the accounting are untouched. See the contract header for the
takeover rules; the short version is that the owner can reassign an **abandoned** payout
after a dormancy period and a public timelock, and cannot touch an active one.

## Commands

```
npm install
npx hardhat compile
npx hardhat test
```

## Why the gate is off-chain

An earlier draft put the whole judgement on-chain: a dormancy period the creator had to be
silent through, a timelock on every proposal, a veto. It was dropped. A dormancy long enough
to mean anything is far longer than the days a real takeover takes, so it blocked the honest
case while a determined operator would simply wait it out. It is also not what anyone does:
pump.fun grants the platform the same power outright and gates it on a review form, refusing
to act wherever ownership of the fees is genuinely disputed.

So the contract grants the power and records the move. The filter is the process around it.

Two things did survive from that draft, because they are defects either way:

* the deployer could take the payout straight back after a handover, which made the whole
  thing theatre — `takenOver[token]` now locks them out;
* a wallet the deployer merely *pays* could redirect the fees onward, which the original did
  not allow — `_redirectControllerOf` restores the original rule.

## Status

**Not audited. Not deployed.** 16 tests cover the reassignment path and the behaviour
inherited from the original. That is self-review, not a third-party audit, and it is not a
substitute for one on a contract that custodies liquidity.
