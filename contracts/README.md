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

`test/uniswap-bootstrap.test.cjs` runs the other direction — it puts Uniswap on a bare
in-process chain and launches into it, which is the rehearsal for deploying to a chain that
has none. It runs as part of the normal suite.

## Deploying

The launchpad needs a Uniswap V3 to launch into. Robinhood Chain mainnet has one; its
testnet does not — the address that deployed Uniswap on mainnet has nonce 0 there.

**Local fork** — real V3 contracts with real state, costs nothing:

```
FORK=1 npx hardhat node
npx hardhat run scripts/deploy.cjs --network localhost
```

**A chain with no Uniswap** — put one there first:

```
npx hardhat run scripts/deploy-uniswap.cjs --network rhTestnet
npx hardhat run scripts/deploy.cjs        --network rhTestnet
npx hardhat run scripts/smoke.cjs         --network rhTestnet
```

`deploy-uniswap.cjs` does not compile Uniswap from source. It replays the creation bytecode
of the mainnet deployment, rewriting only the constructor arguments. That is deliberate: the
V3 factory embeds the hash of the pool creation code and the periphery embeds the same hash
to derive pool addresses, so a recompile with a different compiler would leave the two halves
disagreeing and every pool lookup pointing at nothing. `scripts/fetch-uniswap-initcode.cjs`
is what pulls that bytecode; it is read-only.

One thing does not survive the copy: the position descriptor links a library that only exists
on mainnet, so `tokenURI` on a position NFT reverts. Minting, collecting and burning are
unaffected.

### Robinhood Chain reports two different block heights

`eth_blockNumber` and the `block.number` a contract sees are **not the same value** on this
chain — measured on the testnet, 94,248,962 against 11,367,095. Anything compared against an
on-chain block number has to be read the way a contract reads it, or the comparison is
meaningless. `scripts/smoke.cjs` has a one-line helper (`evmBlockNumber`) that asks the EVM
directly through `eth_call`.

This matters for the launch tokens: they block pool buys in the launch block outright and cap
them for `restrictionBlocks` afterwards, and the pool reports any revert from the token as a
bare `TF`. A front end that counts down that window from `eth_blockNumber` will be wrong by
tens of millions of blocks.

Deploys need a key. Put it in `.env` as `PRIVATE_KEY` — the file is gitignored and nothing
reads the key but Hardhat.

Addresses land in `deployments/<chainId>.json` and `deployments/uniswap-<chainId>.json`.

## Status

**Not audited. Not deployed.** 16 tests cover the reassignment path and the surrounding
custody and fee-split behaviour. That is self-review, not a third-party audit, and it is no
substitute for one on a contract that custodies liquidity.
