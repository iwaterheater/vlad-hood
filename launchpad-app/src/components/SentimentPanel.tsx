import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { useVotes, useCastVote } from '../lib/useVotes';
import Icon from './Icon';

/**
 * Community sentiment — one vote per wallet, and the wallet has to sign for it.
 *
 * A wallet costs nothing to make, so this counts wallets rather than people; it
 * is a mood, not a poll. What it does rule out is voting twice from the same
 * wallet, or voting as somebody else.
 */
export default function SentimentPanel({ token }: { token: Address }) {
  const { isConnected } = useAccount();
  const { data, isLoading, error } = useVotes(token);
  const cast = useCastVote(token);

  const up = data?.up ?? 0;
  const down = data?.down ?? 0;
  const total = up + down;
  const upPct = total ? Math.round((up / total) * 100) : 0;
  const mine = data?.mine ?? 0;

  const button = (vote: 1 | -1) => {
    const chosen = mine === vote;
    const colour = vote === 1 ? 'var(--forest2)' : 'var(--crayred)';
    return (
      <button
        className="sketch-2" onClick={() => cast.mutate(vote)}
        disabled={!isConnected || cast.isPending}
        aria-pressed={chosen}
        title={isConnected ? (vote === 1 ? 'Like this token' : 'Dislike this token') : 'Connect a wallet to vote'}
        style={{
          flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '.4rem',
          padding: '.35rem .5rem', border: '2px solid var(--ink)', fontSize: '1rem',
          background: chosen ? colour : 'var(--paper)',
          color: chosen ? 'var(--paper)' : colour,
          cursor: !isConnected || cast.isPending ? 'default' : 'pointer',
          opacity: !isConnected || cast.isPending ? .55 : 1,
        }}
      >
        <Icon name={vote === 1 ? 'thumbUp' : 'thumbDown'} />
        <span className="num">{vote === 1 ? up : down}</span>
      </button>
    );
  };

  return (
    <section className="sketch shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '1rem' }}>
      <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.2rem', margin: 0 }}>Community Sentiment</h2>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '.6rem', fontSize: '1.05rem' }}>
        <span className="num" style={{ color: 'var(--forest2)', display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
          <Icon name="thumbUp" /> {total ? `${upPct}%` : '—'}
        </span>
        <span className="num" style={{ color: 'var(--crayred)', display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}>
          {total ? `${100 - upPct}%` : '—'} <Icon name="thumbDown" />
        </span>
      </div>

      <div className="bar-track" style={{ height: 16, marginTop: '.5rem' }}
           role="img" aria-label={total ? `${upPct}% of ${total} votes are positive` : 'no votes yet'}>
        <div className="bar-fill" style={{ width: `${upPct}%`, background: 'var(--forest2)' }} />
      </div>

      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.6rem' }}>
        {button(1)}
        {button(-1)}
      </div>

      <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.1rem', margin: '.5rem 0 0', lineHeight: 1.2 }}>
        {isLoading ? 'counting…'
          : error ? 'votes are unavailable right now'
          : cast.isPending ? 'sign in your wallet…'
          : total === 0 ? 'no votes yet — be first'
          : `${total} vote${total === 1 ? '' : 's'}${mine !== 0 ? ' · yours counted' : ''}`}
      </p>

      {cast.error && (
        <p style={{ color: 'var(--crayred)', fontSize: '.85rem', margin: '.35rem 0 0' }}>
          {(cast.error as Error).message}
        </p>
      )}

      {!isConnected && (
        <p style={{ fontSize: '.78rem', color: 'rgba(43,38,32,.55)', margin: '.35rem 0 0', lineHeight: 1.35 }}>
          Connect a wallet to vote. One vote per wallet — your wallet signs it, nothing is spent.
        </p>
      )}
    </section>
  );
}
