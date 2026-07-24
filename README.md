# Vladhood ($VLAD)

The outlaw of the Robinhood Chain — a community meme coin with a hand-drawn,
notebook-style landing page and an on-chain swap built directly on the LI.FI API.

**Live:** https://vlad-hood.xyz

## Features

- Hand-drawn "notebook" landing page (hero, legend, tokenomics, how-to-buy, community)
- Live market-cap badge with 24h price change
- On-chain swap widget — buy/sell ETH ⇄ $VLAD on the Robinhood Chain, built on the LI.FI Quote API
  - configurable slippage, computed price impact, minimum received
  - wallet connect / disconnect (EIP-1193 injected provider)
- Live "Latest swaps" feed of trades made through the site, each linking to its transaction
- Market stats: market cap, holders, 24h volume
- Standalone `/swap` page

## Tech

- Static site — plain HTML + Tailwind (CDN) + vanilla JS, no build step
- Swap logic lives in `swap.js` (LI.FI Quote API + injected wallet provider)
- Chain: Robinhood Chain (EVM, chain id `4663`)

## Addresses

- Token `$VLAD`: `0x92D176ccBeEffeCd8089e841D09ea17b6C22D969`
- Pool (Uniswap V3): `0xac870e97FC1FE981F4D887e5f453203745A15EF4`

## Disclaimer

$VLAD is a community meme coin for entertainment only. Not financial advice.
Crypto is risky — never invest more than you can afford to lose. DYOR.
