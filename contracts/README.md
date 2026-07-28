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

## Review so far

An adversarial pass put 23 claimed exploits against the takeover claim — *the owner cannot
take the creator share of a token whose creator is still active, and cannot accelerate a
takeover already proposed*. Each was re-tested against the compiled contract and all 23 were
refuted with executable proof. Two real issues did come out of the process and are fixed:

* the deployer could take the payout straight back after a handover, which made the whole
  mechanism theatre — `takenOver[token]` now locks them out;
* a wallet the deployer merely *pays* could redirect the fees onward, which the original
  contract did not allow — `_redirectControllerOf` restores the original rule.

## Status

**Not audited. Not deployed.** The pass above was self-review, not a third-party audit, and
it is not a substitute for one on a contract that custodies liquidity. 29 tests cover the
takeover rules and the behaviour inherited from the original.
