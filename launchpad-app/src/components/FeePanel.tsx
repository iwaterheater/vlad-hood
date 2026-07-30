import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther, isAddress, type Address } from 'viem';
import { DEPLOYMENT } from '../lib/chain';
import { lockerAbi } from '../lib/abi';
import { useFees } from '../lib/useFees';
import { shortAddress } from '../lib/format';
import type { LaunchedToken } from '../lib/tokens';

const same = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/**
 * The creator's side of a launch: what the pool's 1% has earned them and the
 * button that moves it. The locker pays the recipient, but lets the deployer
 * trigger the claim too, so both see this panel — and after a takeover the
 * deployer sees plainly that the payout no longer lands with them.
 */
export default function FeePanel({ token }: { token: LaunchedToken }) {
  const { address } = useAccount();
  const recipient = token.feeRecipient ?? token.deployer;
  const isDeployer = same(address, token.deployer);
  const isRecipient = same(address, recipient);

  const mayClaim = Boolean(address) && (isDeployer || isRecipient);
  const { data: fees, isLoading, error, refetch } = useFees(
    mayClaim ? token.address : undefined,
    token.pool,
    address,
  );

  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [note, setNote] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState('');

  /* A claim empties the position and pays the recipient, so both the figures
     above the button and the balances elsewhere on the page are wrong the moment
     it lands. */
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSuccess) return;
    refetch();
    queryClient.invalidateQueries();
  }, [isSuccess, refetch, queryClient]);

  if (!mayClaim) return null;

  const busy = isPending || isMining;

  async function send(action: 'collect' | 'redirect') {
    setNote(null);
    try {
      if (action === 'redirect' && !isAddress(redirectTo)) {
        setNote('That is not a valid address.');
        return;
      }
      const h = await writeContractAsync(
        action === 'collect'
          ? { address: DEPLOYMENT.locker, abi: lockerAbi, functionName: 'collectFees', args: [token.address] }
          : { address: DEPLOYMENT.locker, abi: lockerAbi, functionName: 'setFeeRedirect', args: [token.address, redirectTo as Address] },
      );
      setHash(h);
      if (action === 'redirect') setRedirectTo('');
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      const text = `${err.shortMessage ?? ''} ${err.message ?? ''}`;
      /* Claiming an untraded pool is the ordinary answer "there is nothing
         there", not a fault, and it should not read like one. */
      if (text.includes('NoFeesToCollect')) {
        setNote('Nothing had built up yet — the pool has not been traded since the last claim.');
        return;
      }
      if (text.includes('NotAuthorized')) {
        setNote('This wallet is not the creator or the fee recipient for this token.');
        return;
      }
      setNote(err.shortMessage ?? err.message ?? 'The call failed.');
    }
  }

  /* The locker splits both assets on the way out, so what the recipient sees is
     never the gross figure. */
  const keep = (v: bigint) => (fees ? v - (v * BigInt(fees.protocolShare)) / 100n : 0n);
  const eth = fees ? Number(formatEther(keep(fees.eth))) : 0;
  const tokens = fees ? Number(formatEther(keep(fees.tokens))) : 0;
  const hasSomething = Boolean(fees && (fees.eth > 0n || fees.tokens > 0n));

  return (
    <aside className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
      <h3 className="marker" style={{ color: 'var(--forest)', margin: 0, fontSize: '1.2rem' }}>Creator fees</h3>
      <p className="caveat" style={{ color: 'var(--brown)', margin: '.1rem 0 .6rem' }}>
        {isRecipient ? 'yours to collect' : 'you can collect these — they pay out elsewhere'}
      </p>

      {isLoading && <p style={{ color: 'rgba(43,38,32,.6)', margin: 0 }}>Checking the position…</p>}

      {error && (
        <p style={{ color: 'var(--crayred)', margin: 0, fontSize: '.9rem' }}>
          {(error as { shortMessage?: string; message: string }).shortMessage ?? (error as Error).message}
        </p>
      )}

      {/* The figures and the button stay put whether or not there is anything to
          take. Hidden until a balance appeared, the panel read as a form for
          handing fees away, and the one control it exists for was invisible. */}
      {!isLoading && !error && (
        <>
          <div className="kv">
            <span className="k">You get</span>
            <span className="dots" />
            <span className="v num">{eth.toFixed(6)} WETH</span>
          </div>
          <div className="kv">
            <span className="k">and</span>
            <span className="dots" />
            <span className="v num">
              {tokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} {token.symbol}
            </span>
          </div>
          {/* Always pressable. An empty claim costs nothing and simply comes back
              empty, which is a clearer answer than a button that cannot be
              pressed and does not say why. */}
          <button
            className="cta marker sketch-2 shadow-rough-sm" onClick={() => send('collect')} disabled={busy}
            title="Move the collected fees to the recipient"
            style={{ width: '100%', marginTop: '.9rem', padding: '.7rem', fontSize: '1.05rem',
                     background: 'var(--mustard)', cursor: busy ? 'default' : 'pointer' }}
          >
            {busy ? 'Confirming…' : 'Collect fees'}
          </button>

          {!hasSomething && (
            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.4rem 0 0', lineHeight: 1.2 }}>
              fees build up as the pool is traded
            </p>
          )}
        </>
      )}

      <p style={{ marginTop: '.8rem', fontSize: '.78rem', color: 'rgba(43,38,32,.55)', lineHeight: 1.4 }}>
        Paid to {isRecipient ? 'you' : shortAddress(recipient)} as WETH, not as ETH — unwrap it if you want the
        plain coin.{token.takenOver ? ' This token has been handed to a new steward.' : ''}
      </p>

      {isDeployer && !token.takenOver && (
        <div style={{ marginTop: '.9rem', borderTop: '2px solid rgba(43,38,32,.15)', paddingTop: '.9rem' }}>
          <label style={{ display: 'block', fontSize: '.9rem', color: 'var(--brown)' }}>Pay future fees to</label>
          <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.5rem .7rem', marginTop: '.3rem', display: 'flex', gap: '.5rem' }}>
            <input
              className="num" value={redirectTo} maxLength={42} placeholder="0x…"
              onChange={(e) => setRedirectTo(e.target.value.trim())}
              style={{ flex: 1, border: 0, background: 'transparent', font: 'inherit', outline: 'none', minWidth: 0 }}
            />
            <button
              className="num" onClick={() => send('redirect')} disabled={busy || !redirectTo}
              style={{ border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--paper2)', padding: '0 .6rem',
                       cursor: busy || !redirectTo ? 'default' : 'pointer', opacity: busy || !redirectTo ? .5 : 1 }}
            >set</button>
          </div>
          <small style={{ color: 'rgba(43,38,32,.6)' }}>
            Currently {shortAddress(recipient)}. Only you can change this, and only until a takeover.
          </small>
        </div>
      )}

      {note && <p style={{ marginTop: '.6rem', color: 'var(--crayred)', fontSize: '.9rem' }}>{note}</p>}
      {isSuccess && hash && (
        <p className="num" style={{ marginTop: '.6rem', color: 'var(--forest)', fontSize: '.8rem', wordBreak: 'break-all' }}>
          Done — {hash}
        </p>
      )}
    </aside>
  );
}
