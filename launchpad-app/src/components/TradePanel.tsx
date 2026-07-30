import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther, formatEther, maxUint256, encodeFunctionData, type Address } from 'viem';
import { DEPLOYMENT, LAUNCH } from '../lib/chain';
import { routerAbi, tokenAbi } from '../lib/abi';
import { useQuote, minOut } from '../lib/useQuote';
import { usd } from '../lib/format';
import WalletButton from './WalletButton';
import Icon from './Icon';

const SLIPPAGES = [0.5, 1, 2];
const GAS_CUSHION = parseEther('0.0002');
/** SwapRouter02's Constants.ADDRESS_THIS — "pay this router, not a wallet". */
const ADDRESS_THIS = '0x0000000000000000000000000000000000000002' as Address;

/* Token amounts run to the millions and ETH amounts to the thousandths, and the
   same box shows both, so the precision follows the size rather than the unit. */
const compact = (v: number, digits = 5) =>
  v === 0 ? '0'
    : v < 0.00001 ? v.toExponential(2)
    : v.toLocaleString('en-US', { maximumFractionDigits: v < 1 ? 8 : digits });

/**
 * The launch window's own refusals, in words.
 *
 * A newly launched token holds buyers to a share of supply for a stretch of
 * blocks and bars buying in the launch block outright. Raw, those arrive as a
 * custom error the wallet renders as an unexplained revert.
 */
function explain(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const text = `${err.shortMessage ?? ''} ${err.message ?? ''}`;
  if (text.includes('MaxWalletExceeded')) {
    return 'Too much for one wallet while the launch window is open — this token caps how much any single holder can take. Try a smaller amount.';
  }
  if (text.includes('MaxTxExceeded')) {
    return 'Bigger than the launch window allows in one trade. Try a smaller amount.';
  }
  if (text.includes('LaunchBlockBuyBlocked')) {
    return 'Buying is blocked in the block a token launches in. Wait for the next one.';
  }
  if (text.includes('STF')) {
    return 'The token transfer was refused — the amount is above what this wallet holds.';
  }
  if (text.includes('Too little received') || text.includes('amountOutMinimum')) {
    return 'The price moved past your slippage limit. Raise it or try again.';
  }
  return err.shortMessage ?? err.message ?? 'The swap failed.';
}

/**
 * Buys with native ETH — SwapRouter02 wraps what it is sent when tokenIn is
 * WETH, so there is no deposit step and no allowance. Selling spends an ERC20,
 * which needs an allowance first, granted once and reused.
 */
export default function TradePanel({ token, symbol, priceEth, rate }: {
  token: Address; symbol: string; priceEth: number | null; rate: number | null;
}) {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1);
  const [note, setNote] = useState<string | null>(null);

  const { data: ethBalance } = useBalance({ address });
  const { data: tokenBalance } = useReadContract({
    address: token, abi: tokenAbi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: quoted, isFetching: quoting, error: quoteError } = useQuote(token, side, amount);

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  /* A swap moves the price, the balances, the pool and the trade log all at
     once. Nothing on the page watches the chain, so without this the reader is
     left looking at the state from before their own trade until they reload. */
  const queryClient = useQueryClient();
  useEffect(() => { if (isSuccess) queryClient.invalidateQueries(); }, [isSuccess, queryClient]);

  const busy = isPending || isMining;

  /* Balances stay bigint everywhere they are compared or spent. A launch supply
     runs to 24 significant digits and a float64 holds 15, so rounding a balance
     through Number rounds it UP — MAX then asks to sell 85 million wei more than
     the wallet owns, the transfer reverts with STF, and the wallet reports it as
     "insufficient funds" for a gas limit it invented after the estimate failed. */
  const heldWei = side === 'buy' ? (ethBalance?.value ?? 0n) : ((tokenBalance as bigint | undefined) ?? 0n);
  const held = Number(formatEther(heldWei));
  const parsed = (() => { try { return parseEther(amount || '0'); } catch { return 0n; } })();
  const overspending = parsed > heldWei;

  /* Buying spends the same coin the gas comes out of, so MAX leaves a little. */
  const maxAmount = () => formatEther(
    side === 'buy' ? (heldWei > GAS_CUSHION ? heldWei - GAS_CUSHION : 0n) : heldWei,
  );

  /* Both sides deal in the plain coin: a buy is sent native ETH and the router
     wraps it, a sell unwraps on the way out. */
  const payUnit = side === 'buy' ? 'ETH' : symbol;
  const getUnit = side === 'buy' ? symbol : 'ETH';
  const received = quoted ? Number(formatEther(quoted)) : null;
  const floor = minOut(quoted, slippage);
  const paid = Number(amount) || 0;

  /* One unit of what you pay, in what you get — read off this very quote, so it
     already includes the fee and the trade's own price impact. */
  const rateText = received && paid > 0
    ? `1 ${payUnit} ≈ ${compact(received / paid, 4)} ${getUnit}`
    : '—';
  const receivedUsd = received === null || priceEth === null
    ? null
    : usd(side === 'buy' ? received * priceEth : received, rate);

  /* The number in the box means one asset on each side, so it cannot survive a
     switch. Picking a side outright clears it; the flip button carries the trade
     over instead — you get to sell back exactly what this trade would return. */
  function pickSide(next: 'buy' | 'sell') {
    if (next === side) return;
    setSide(next);
    setAmount('');
    setNote(null);
  }

  function flip() {
    setSide(side === 'buy' ? 'sell' : 'buy');
    setAmount(quoted ? formatEther(quoted) : '');
    setNote(null);
  }

  async function trade() {
    setNote(null);
    const value = parsed;
    if (value <= 0n) { setNote('Enter an amount first.'); return; }
    /* Caught here the wallet never opens; left to the chain it comes back as
       "insufficient funds for gas * price + value" with two raw wei figures. */
    if (overspending) { setNote(`You only have ${compact(held, side === 'buy' ? 5 : 2)} ${payUnit}.`); return; }
    if (!quoted) { setNote('No quote for that size yet.'); return; }

    try {
      if (side === 'sell') {
        const allowance = await client!.readContract({
          address: token, abi: tokenAbi, functionName: 'allowance',
          args: [address!, DEPLOYMENT.uniswap.swapRouter],
        });
        if (allowance < value) {
          setNote('Approve the token in your wallet…');
          const approveHash = await writeContractAsync({
            address: token, abi: tokenAbi, functionName: 'approve',
            args: [DEPLOYMENT.uniswap.swapRouter, maxUint256],
          });
          await client!.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      setNote(null);
      /* The floor the quote above was taken at, less the chosen tolerance. These
         pools are thin enough that the number bites, which is the point:
         without it a trade accepts whatever the pool has left. */
      const swap = {
        tokenIn: side === 'buy' ? DEPLOYMENT.uniswap.weth : token,
        tokenOut: side === 'buy' ? token : DEPLOYMENT.uniswap.weth,
        fee: LAUNCH.poolFee,
        /* A buy ends with the tokens, which go straight to the buyer. A sell
           ends with WETH, which the router has to keep hold of so the unwrap
           below can turn it into the plain coin. */
        recipient: side === 'buy' ? address! : ADDRESS_THIS,
        amountIn: value,
        amountOutMinimum: floor,
        sqrtPriceLimitX96: 0n,
      } as const;

      const h = side === 'buy'
        ? await writeContractAsync({
            address: DEPLOYMENT.uniswap.swapRouter, abi: routerAbi,
            functionName: 'exactInputSingle', args: [swap], value,
          })
        : await writeContractAsync({
            address: DEPLOYMENT.uniswap.swapRouter, abi: routerAbi, functionName: 'multicall',
            args: [[
              encodeFunctionData({ abi: routerAbi, functionName: 'exactInputSingle', args: [swap] }),
              encodeFunctionData({ abi: routerAbi, functionName: 'unwrapWETH9', args: [floor, address!] }),
            ]],
          });
      setHash(h);
    } catch (e: unknown) {
      setNote(explain(e));
    }
  }

  const sideBtn = (on: boolean) => ({
    padding: '.4rem', cursor: 'pointer',
    background: on ? 'var(--forest)' : 'var(--paper)',
    color: on ? 'var(--paper)' : 'var(--ink)',
    border: '2px solid var(--ink)', borderRadius: '10px',
    fontFamily: "'Permanent Marker', cursive", fontSize: '1.05rem',
  });

  return (
    <aside className="sketch shadow-rough" style={{ position: 'relative', background: 'var(--paper2)', padding: '1rem' }}>
      <span className="pin" />
      <h2 className="marker" style={{ color: 'var(--forest)', margin: '.25rem 0 0', fontSize: '1.2rem' }}>Trade ${symbol}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '.75rem' }}>
        <button style={sideBtn(side === 'buy')} onClick={() => pickSide('buy')} aria-pressed={side === 'buy'}>Buy</button>
        <button style={sideBtn(side === 'sell')} onClick={() => pickSide('sell')} aria-pressed={side === 'sell'}>Sell</button>
      </div>

      <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.6rem .7rem', marginTop: '.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
          <span className="caveat" style={{ color: 'var(--brown)', fontSize: '1.1rem' }}>You Pay</span>
          <button className="num sketch-2" onClick={() => setAmount(maxAmount())}
                  style={{ background: 'var(--paper2)', cursor: 'pointer', padding: '.05rem .4rem', fontSize: '.7rem', border: '2px solid var(--ink)' }}>
            MAX
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.35rem' }}>
          <input
            className="num" inputMode="decimal" value={amount} placeholder="0.0"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="amount you pay"
            style={{ flex: 1, border: 0, background: 'transparent', font: 'inherit', fontSize: '1.5rem', outline: 'none', minWidth: 0 }}
          />
          <span className="marker sketch-2" style={{ background: 'var(--paper2)', padding: '.15rem .5rem', fontSize: '.8rem', flex: 'none' }}>{payUnit}</span>
        </div>
        <p className="num" style={{ fontSize: '.78rem', margin: '.3rem 0 0',
                                    color: overspending ? 'var(--crayred)' : 'rgba(43,38,32,.6)' }}>
          balance {compact(held, side === 'buy' ? 5 : 2)} {payUnit}{overspending ? ' — not enough' : ''}
        </p>
      </div>

      {/* the direction switch sits on the seam between the two boxes */}
      <div style={{ position: 'relative', height: 0 }}>
        <button onClick={flip} title="switch direction" aria-label="switch direction"
                style={{ position: 'absolute', left: '50%', top: 0, transform: 'translate(-50%,-50%)',
                         width: 34, height: 34, borderRadius: '50%', border: '2.4px solid var(--ink)',
                         background: 'var(--mustard)', cursor: 'pointer', zIndex: 2,
                         display: 'flex', alignItems: 'center', justifyContent: 'center',
                         boxShadow: '3px 4px 0 rgba(43,38,32,.8)', fontSize: '1.1rem' }}>
          <Icon name="swap" strokeWidth={2.2} />
        </button>
      </div>

      <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.6rem .7rem', marginTop: '.75rem' }}>
        <span className="caveat" style={{ color: 'var(--brown)', fontSize: '1.1rem' }}>You Receive</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.35rem' }}>
          <span className="num" style={{ flex: 1, fontSize: '1.5rem', minWidth: 0, overflowWrap: 'break-word',
                                         color: received === null ? 'rgba(43,38,32,.45)' : 'var(--ink)' }}>
            {quoting ? '…' : received === null ? '0.0' : compact(received, 4)}
          </span>
          <span className="marker sketch-2" style={{ background: 'var(--paper2)', padding: '.15rem .5rem', fontSize: '.8rem', flex: 'none' }}>{getUnit}</span>
        </div>
        <p className="num" style={{ fontSize: '.78rem', color: 'rgba(43,38,32,.55)', margin: '.2rem 0 0', minHeight: '1em' }}>
          {quoteError ? 'no quote for that size' : receivedUsd ?? ''}
        </p>
      </div>

      <div style={{ marginTop: '1rem' }}>
        {isConnected ? (
          <button
            className="marker sketch shadow-rough-sm" onClick={trade} disabled={busy}
            style={{ width: '100%', padding: '.65rem', fontSize: '1.15rem', cursor: busy ? 'default' : 'pointer',
                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
                     background: busy ? 'var(--paper)' : 'var(--mustard)', opacity: busy ? .6 : 1 }}
          >
            {busy ? 'Confirming…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
          </button>
        ) : (
          <WalletButton label="Connect wallet to trade" full />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginTop: '.8rem' }}>
        <span style={{ color: 'rgba(43,38,32,.7)', display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
          <Icon name="slippage" /> Slippage
        </span>
        <span style={{ display: 'flex', gap: '.25rem' }}>
          {SLIPPAGES.map((s) => (
            <button key={s} className="num sketch-2" onClick={() => setSlippage(s)} aria-pressed={slippage === s}
                    style={{ padding: '.05rem .4rem', fontSize: '.78rem', cursor: 'pointer', border: '2px solid var(--ink)',
                             background: slippage === s ? 'var(--ink)' : 'var(--paper)',
                             color: slippage === s ? 'var(--paper)' : 'var(--ink)' }}>
              {s}%
            </button>
          ))}
        </span>
      </div>
      <div className="kv" style={{ fontSize: '.85rem', color: 'rgba(43,38,32,.6)', padding: '.15rem 0' }}>
        <span className="k" style={{ color: 'inherit' }}>Min received</span>
        <span className="dots" />
        <span className="v num">{floor > 0n ? `${compact(Number(formatEther(floor)), 4)} ${getUnit}` : '—'}</span>
      </div>
      <div className="kv" style={{ fontSize: '.85rem', color: 'rgba(43,38,32,.6)', padding: '.15rem 0' }}>
        <span className="k" style={{ color: 'inherit' }}>Rate</span>
        <span className="dots" />
        <span className="v num">{rateText}</span>
      </div>

      {note && <p style={{ marginTop: '.6rem', color: 'var(--crayred)', fontSize: '.9rem' }}>{note}</p>}
      {isSuccess && hash && (
        <p className="num" style={{ marginTop: '.6rem', color: 'var(--forest)', fontSize: '.8rem', wordBreak: 'break-all' }}>
          Done — {hash}
        </p>
      )}

      <p style={{ marginTop: '.7rem', fontSize: '.78rem', color: 'rgba(43,38,32,.55)', lineHeight: 1.4 }}>
        A trade pays the pool's 1% fee, split {LAUNCH.protocolFeeShare === 30 ? '70/30' : ''} between the token's
        creator and the platform.
      </p>
    </aside>
  );
}
