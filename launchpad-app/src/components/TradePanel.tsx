import { useState } from 'react';
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { parseEther, formatEther, maxUint256, type Address } from 'viem';
import { DEPLOYMENT, LAUNCH } from '../lib/chain';
import { routerAbi, tokenAbi } from '../lib/abi';

/**
 * Buys with native ETH — SwapRouter02 wraps what it is sent when tokenIn is
 * WETH, so there is no deposit step and no allowance. Selling spends an ERC20,
 * which needs an allowance first, granted once and reused.
 */
export default function TradePanel({ token, symbol }: { token: Address; symbol: string }) {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const { data: ethBalance } = useBalance({ address });
  const { data: tokenBalance } = useReadContract({
    address: token, abi: tokenAbi, functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });

  const busy = isPending || isMining;
  const held = side === 'buy'
    ? (ethBalance ? Number(formatEther(ethBalance.value)) : 0)
    : (tokenBalance ? Number(formatEther(tokenBalance)) : 0);

  async function trade() {
    setNote(null);
    const value = (() => { try { return parseEther(amount || '0'); } catch { return 0n; } })();
    if (value <= 0n) { setNote('Enter an amount first.'); return; }

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
      const h = await writeContractAsync({
        address: DEPLOYMENT.uniswap.swapRouter,
        abi: routerAbi,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: side === 'buy' ? DEPLOYMENT.uniswap.weth : token,
          tokenOut: side === 'buy' ? token : DEPLOYMENT.uniswap.weth,
          fee: LAUNCH.poolFee,
          recipient: address!,
          amountIn: value,
          /* These pools hold thousandths of an ETH; any slippage floor worth
             setting rejects more honest trades than it prevents bad ones.
             Revisit once they are deep enough for the number to mean something. */
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        }],
        value: side === 'buy' ? value : 0n,
      });
      setHash(h);
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setNote(err.shortMessage ?? err.message ?? 'The swap failed.');
    }
  }

  const pill = (on: boolean) => ({
    flex: 1, padding: '.5rem', cursor: 'pointer',
    background: on ? 'var(--forest)' : 'var(--paper)',
    color: on ? 'var(--paper)' : 'var(--ink)',
    border: '2px solid var(--ink)', borderRadius: '10px',
    fontFamily: "'Permanent Marker', cursive", fontSize: '.95rem',
  });

  return (
    <aside className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
      <h3 className="marker" style={{ color: 'var(--forest)', margin: 0, fontSize: '1.2rem' }}>Trade ${symbol}</h3>

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
        <button style={pill(side === 'buy')} onClick={() => setSide('buy')}>Buy</button>
        <button style={pill(side === 'sell')} onClick={() => setSide('sell')}>Sell</button>
      </div>

      <label style={{ display: 'block', marginTop: '.9rem', fontSize: '.9rem', color: 'var(--brown)' }}>
        You pay ({side === 'buy' ? 'ETH' : symbol})
      </label>
      <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.5rem .7rem', marginTop: '.3rem', display: 'flex', gap: '.5rem' }}>
        <input
          className="num" inputMode="decimal" value={amount} placeholder="0.0"
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          style={{ flex: 1, border: 0, background: 'transparent', font: 'inherit', fontSize: '1.3rem', outline: 'none', minWidth: 0 }}
        />
        <button
          className="num" onClick={() => setAmount(String(side === 'buy' ? Math.max(0, held - 0.0002) : held))}
          style={{ border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--paper2)', cursor: 'pointer', padding: '0 .6rem' }}
        >max</button>
      </div>
      <p className="num" style={{ fontSize: '.8rem', color: 'rgba(43,38,32,.6)', margin: '.35rem 0 0' }}>
        balance {held.toFixed(side === 'buy' ? 5 : 2)} {side === 'buy' ? 'ETH' : symbol}
      </p>

      <div style={{ marginTop: '1rem' }}>
        {isConnected ? (
          <button
            className="marker sketch-2 shadow-rough-sm" onClick={trade} disabled={busy}
            style={{ width: '100%', padding: '.7rem', fontSize: '1.05rem', cursor: busy ? 'default' : 'pointer',
                     background: busy ? 'var(--paper)' : 'var(--mustard)', opacity: busy ? .6 : 1 }}
          >
            {busy ? 'Confirming…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`}
          </button>
        ) : (
          <ConnectButton label="Connect wallet to trade" />
        )}
      </div>

      {note && <p style={{ marginTop: '.6rem', color: 'var(--crayred)', fontSize: '.9rem' }}>{note}</p>}
      {isSuccess && hash && (
        <p className="num" style={{ marginTop: '.6rem', color: 'var(--forest)', fontSize: '.8rem', wordBreak: 'break-all' }}>
          Done — {hash}
        </p>
      )}

      <p style={{ marginTop: '.9rem', fontSize: '.78rem', color: 'rgba(43,38,32,.55)', lineHeight: 1.4 }}>
        A trade pays the pool's 1% fee, split {LAUNCH.protocolFeeShare === 30 ? '70/30' : ''} between the token's
        creator and the platform.
      </p>
    </aside>
  );
}
