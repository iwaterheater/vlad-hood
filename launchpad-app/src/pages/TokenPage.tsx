import { formatEther, isAddress, type Address } from 'viem';
import { useToken } from '../lib/useTokens';
import { useSwaps } from '../lib/useSwaps';
import { useEthUsd } from '../lib/useEthUsd';
import { usd, shortAddress, ago } from '../lib/format';
import TokenArt from '../components/TokenArt';
import PriceChart from '../components/PriceChart';
import TradePanel from '../components/TradePanel';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', padding: '.3rem 0' }}>
      <span style={{ color: 'rgba(43,38,32,.7)', flex: 'none' }}>{label}</span>
      <span style={{ flex: 1, borderBottom: '1px dotted rgba(43,38,32,.3)' }} />
      <span className="num" style={{ flex: 'none' }}>{children}</span>
    </div>
  );
}

export default function TokenPage() {
  const id = new URLSearchParams(window.location.search).get('id');
  const address = id && isAddress(id) ? (id as Address) : undefined;
  const { data: token, isLoading, error } = useToken(address);
  const { data: swaps } = useSwaps(token?.pool, address);
  const rate = useEthUsd();

  if (!address) {
    return <p className="caveat" style={{ fontSize: '1.35rem', color: 'var(--brown)', marginTop: '2rem' }}>
      No token address in the link.
    </p>;
  }
  if (isLoading) {
    return <p className="caveat" style={{ fontSize: '1.35rem', color: 'var(--brown)', marginTop: '2rem' }}>Reading the chain…</p>;
  }
  if (error || !token) {
    return (
      <div className="sketch shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '1.5rem', marginTop: '1.5rem' }}>
        <p className="marker" style={{ color: 'var(--crayred)', margin: 0 }}>No token at that address</p>
        <p style={{ marginTop: '.5rem' }}>{address} was not launched by this launchpad, or the chain is unreachable.</p>
        <a href="/launchpad/" className="marker">← Back to the board</a>
      </div>
    );
  }

  const socials = [
    ['Website', token.socials.website],
    ['Telegram', token.socials.telegram],
    ['X', token.socials.twitter],
  ].filter(([, v]) => v) as [string, string][];

  const last = swaps?.length ? swaps[swaps.length - 1].price : token.priceInEth;
  const first = swaps?.length ? swaps[0].price : null;
  const change = first && last ? ((last - first) / first) * 100 : null;

  return (
    <>
      <a href="/launchpad/" className="marker" style={{ display: 'inline-block', marginTop: '1.25rem', textDecoration: 'none' }}>← Back to the board</a>

      <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(0,1fr)', marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="sketch" style={{ width: 96, height: 96, overflow: 'hidden', flex: 'none' }}>
            <TokenArt address={token.address} logo={token.logo} name={token.name} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="marker" style={{ color: 'var(--forest)', fontSize: '2rem', margin: 0, wordBreak: 'break-word' }}>{token.name}</h1>
            <p className="num" style={{ color: 'var(--brown)', margin: '.2rem 0 0', fontSize: '1.1rem' }}>${token.symbol}</p>
            {token.description && <p style={{ margin: '.4rem 0 0', maxWidth: '46ch' }}>{token.description}</p>}
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p className="num" style={{ fontSize: '1.6rem', margin: 0 }}>{usd(token.marketCapEth, rate)}</p>
            <p style={{ margin: 0, color: 'var(--brown)', fontSize: '.85rem' }}>market cap</p>
            {change !== null && (
              <p className="num" style={{ margin: '.2rem 0 0', color: change >= 0 ? 'var(--forest2)' : 'var(--crayred)' }}>
                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
              </p>
            )}
          </div>
        </div>

        {socials.length > 0 && (
          <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
            {socials.map(([label, href]) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                 className="sketch-2 shadow-rough-sm"
                 style={{ background: 'var(--paper)', padding: '.25rem .7rem', textDecoration: 'none', fontSize: '.9rem' }}>
                {label}
              </a>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'minmax(0,1fr) minmax(0,20rem)', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <section className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
              <h2 className="marker" style={{ color: 'var(--forest)', margin: 0, fontSize: '1.1rem' }}>Price</h2>
              <p className="caveat" style={{ color: 'var(--brown)', margin: '.1rem 0 .5rem' }}>built from this pool's own swaps</p>
              <PriceChart swaps={swaps ?? []} />
            </section>

            <section className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
              <h2 className="marker" style={{ color: 'var(--forest)', margin: '0 0 .5rem', fontSize: '1.1rem' }}>Token</h2>
              <Row label="Total supply">{Number(formatEther(token.totalSupply)).toLocaleString('en-US')} {token.symbol}</Row>
              <Row label="Price">{last ? `${last.toExponential(3)} ETH` : '—'}</Row>
              <Row label="Pooled">{token.pooledEth.toFixed(4)} ETH</Row>
              <Row label="To graduation">{token.progressPct.toFixed(1)}%</Row>
              <Row label="Liquidity">locked permanently</Row>
              <Row label="Contract">{shortAddress(token.address)}</Row>
              <Row label="Pool">{shortAddress(token.pool)}</Row>
              <Row label="Creator">{shortAddress(token.deployer)}</Row>
              <Row label="Fees to">{shortAddress(token.feeRecipient)}{token.takenOver ? ' (taken over)' : ''}</Row>
            </section>

            <section className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
              <h2 className="marker" style={{ color: 'var(--forest)', margin: '0 0 .5rem', fontSize: '1.1rem' }}>Trades</h2>
              {!swaps?.length && <p style={{ color: 'rgba(43,38,32,.6)' }}>No trades yet.</p>}
              {swaps && swaps.length > 0 && (
                <div style={{ display: 'grid', gap: '.35rem' }}>
                  {[...swaps].reverse().slice(0, 20).map((s, i) => (
                    <div key={s.tx + i} className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', fontSize: '.85rem' }}>
                      <span style={{ color: s.side === 'buy' ? 'var(--forest2)' : 'var(--crayred)', width: '3rem' }}>{s.side}</span>
                      <span>{s.eth.toFixed(5)} ETH</span>
                      <span style={{ color: 'rgba(43,38,32,.6)' }}>{ago(s.t)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ marginTop: '.7rem', fontSize: '.78rem', color: 'rgba(43,38,32,.55)' }}>
                Holder counts need every Transfer since launch indexed, which nothing does on this chain yet.
              </p>
            </section>
          </div>

          <TradePanel token={token.address} symbol={token.symbol} />
        </div>
      </div>
    </>
  );
}
