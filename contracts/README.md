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

## Fees

A trade pays the pool's 1% fee. The locker splits it **70% to the creator, 30% to the
platform** — `protocolFeeShare` on the locker, capped at 50% by the contract. The share is
snapshotted per token when its position is locked, so changing it later never re-prices a
launch that already happened.

Launching costs a flat 0.0005 ETH.

## Build and test

Solc 0.8.30, optimizer on at 300 runs, `viaIR`, `evmVersion: cancun`.

```
npm install
npx hardhat compile
npx hardhat test
```

The unit tests run against mocks. The integration test runs a real launch against the real
Uniswap V3 deployment, on a local fork, and is skipped unless asked for:

```
FORK=1 npx hardhat test test/fork.integration.cjs
```

## Running it locally

Robinhood Chain's testnet has no Uniswap V3 on it, so a testnet deploy would mean deploying
all of Uniswap first. A local fork is both easier and a better test — the V3 contracts are
the real ones, with real state.

```
FORK=1 npx hardhat node
npx hardhat run scripts/deploy.cjs --network localhost
```

The addresses land in `deployments/4663.json`. Point a wallet at `http://127.0.0.1:8545`,
chain id 4663, and the launchpad is live locally.

## Status

**Not audited. Not deployed.** 16 tests cover the reassignment path and the surrounding
custody and fee-split behaviour. That is self-review, not a third-party audit, and it is no
substitute for one on a contract that custodies liquidity.
