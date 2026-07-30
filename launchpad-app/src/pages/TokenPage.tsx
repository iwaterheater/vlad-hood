import { useState } from 'react';
import { formatEther, isAddress, type Address } from 'viem';
import { useReadContract } from 'wagmi';
import { useToken } from '../lib/useTokens';
import { useSwaps, type Swap } from '../lib/useSwaps';
import { useEthUsd } from '../lib/useEthUsd';
import { useHolders } from '../lib/useHolders';
import { usd, shortAddress, ago, pct, compactNum } from '../lib/format';
import { LAUNCH, EXPLORERS } from '../lib/chain';
import { tokenAbi } from '../lib/abi';
import TokenArt from '../components/TokenArt';
import TokenTabs from '../components/TokenTabs';
import SentimentPanel from '../components/SentimentPanel';
import TradesTable from '../components/TradesTable';
import TradePanel from '../components/TradePanel';
import FeePanel from '../components/FeePanel';
import Icon, { type IconName } from '../components/Icon';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span className="dots" />
      <span className="v num">{children}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sketch shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '1rem' }}>
      <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.2rem', margin: 0 }}>{title}</h2>
      <div style={{ marginTop: '.5rem' }}>{children}</div>
    </section>
  );
}

/** A chip that copies an address — this chain publishes no block explorer to
 *  link to, and a chip that opened nothing would be worse than one that copies. */
function CopyChip({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="chip sketch-2 shadow-rough-sm" title={value}
            onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}>
      <Icon name="copy" /> {done ? 'copied' : label}
    </button>
  );
}

/* Outside chart tools for this pool, on their Robinhood Chain pages. */
const chartLinks = (pool: string): [string, string, IconName][] => [
  ['DexScreener', EXPLORERS.dexScreenerPool(pool), 'chart'],
  ['GeckoTerminal', EXPLORERS.geckoTerminalPool(pool), 'gecko'],
];

const PERF: [string, number][] = [['24h', 864e5], ['7d', 6048e5], ['30d', 2592e6], ['All time', Infinity]];

/** Change over a window, measured from the last trade before it opened. */
function changeOver(swaps: Swap[], windowMs: number, last: number | null, age: number): number | null {
  if (!swaps.length || last === null) return null;
  if (windowMs !== Infinity && age < windowMs) return null;
  const cutoff = Date.now() - windowMs;
  const before = windowMs === Infinity ? swaps[0] : [...swaps].reverse().find((s) => s.t <= cutoff);
  if (!before || before.price <= 0) return null;
  return ((last - before.price) / before.price) * 100;
}

export default function TokenPage() {
  const id = new URLSearchParams(window.location.search).get('id');
  const address = id && isAddress(id) ? (id as Address) : undefined;
  const { data: token, isLoading, error } = useToken(address);
  const { data: swaps } = useSwaps(token?.pool, address);
  const { data: holderData } = useHolders(address, token?.pool, token?.totalSupply);
  const rate = useEthUsd();

  const { data: pooledTokens } = useReadContract({
    address, abi: tokenAbi, functionName: 'balanceOf',
    args: token?.pool ? [token.pool] : undefined,
    query: { enabled: Boolean(address && token?.pool) },
  });

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
        <a href="/launchpad-next/" className="marker">← Back to the board</a>
      </div>
    );
  }

  const trades = swaps ?? [];
  const socials: [string, string, IconName][] = ([
    ['Website', token.socials.website, 'web'],
    ['Telegram', token.socials.telegram, 'telegram'],
    ['X', token.socials.twitter, 'x'],
  ] as [string, string, IconName][]).filter(([, v]) => v);

  const last = trades.length ? trades[trades.length - 1].price : token.priceInEth;
  const first = trades.length ? trades[0].price : null;
  const change = first && last ? ((last - first) / first) * 100 : null;
  const graduated = token.progressPct >= 100;
  const age = token.launchedAt ? Date.now() - token.launchedAt : 0;
  const supply = Number(formatEther(token.totalSupply));

  return (
    <>
      <a href="/launchpad-next/" className="chip sketch-2 shadow-rough-sm marker"
         style={{ marginTop: '1.25rem', textDecoration: 'none', fontSize: '1rem' }}>
        ← Back to Launchpad
      </a>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '1.5rem', marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', minWidth: 0, flex: '1 1 20rem' }}>
          <div style={{ width: 112, height: 112, flex: 'none', borderRadius: '50%', overflow: 'hidden',
                        border: '3px solid var(--ink)', boxShadow: '3px 4px 0 rgba(43,38,32,.8)' }}>
            <TokenArt address={token.address} logo={token.logo} name={token.name} variant="plain" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem' }}>
              <h1 className="marker" style={{ color: 'var(--forest)', fontSize: 'clamp(1.9rem, 5vw, 3rem)', lineHeight: 1.1,
                                              margin: 0, transform: 'rotate(-1deg)', wordBreak: 'break-word' }}>
                {token.name}
              </h1>
              <span className="marker sketch-2" style={{ fontSize: '.7rem', padding: '.1rem .45rem',
                                                         background: graduated ? 'var(--mustard)' : 'var(--forest)',
                                                         color: graduated ? 'var(--ink)' : 'var(--paper)' }}>
                {graduated ? 'GRADUATED' : 'LIVE'}
              </span>
            </div>
            {/* the description lives in the About card, not here */}
            <p className="marker" style={{ color: 'var(--mustard)', fontSize: '1.25rem', margin: '.25rem 0 0' }}>${token.symbol}</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.75rem' }}>
              {socials.map(([label, href, icon]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="chip sketch-2 shadow-rough-sm">
                  <Icon name={icon} /> {label}
                </a>
              ))}
              {token.pool && chartLinks(token.pool).map(([label, href, icon]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                   className="chip sketch-2 shadow-rough-sm" title={`Look this pool up on ${label}`}>
                  <Icon name={icon} /> {label}
                </a>
              ))}
              <CopyChip label="Contract" value={token.address} />
              {token.pool && <CopyChip label="Pool" value={token.pool} />}
            </div>
          </div>
        </div>

        <div className="token-stats" style={{ flex: '0 1 22rem' }}>
          <div className="sketch shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '.75rem' }}>
            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.2rem', margin: 0, lineHeight: 1 }}>MARKET CAP</p>
            <p className="num marker" style={{ fontSize: '1.3rem', margin: '.25rem 0 0', overflowWrap: 'anywhere' }}>{usd(token.marketCapEth, rate)}</p>
            <p style={{ fontSize: '.72rem', color: 'rgba(43,38,32,.55)', margin: 0 }}>USD, fully diluted</p>
            {change !== null && (
              <p className="num marker" style={{ margin: '.35rem 0 0', fontSize: '1.05rem',
                                                 color: change >= 0 ? 'var(--forest2)' : 'var(--crayred)' }}>
                {pct(change)}
              </p>
            )}
          </div>
          <div className="sketch-2 shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '.75rem' }}>
            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.2rem', margin: 0, lineHeight: 1 }}>POOLED</p>
            <p className="num marker" style={{ fontSize: '1.3rem', margin: '.25rem 0 0', overflowWrap: 'anywhere' }}>{token.pooledEth.toFixed(4)} ETH</p>
            <p style={{ fontSize: '.72rem', color: 'rgba(43,38,32,.55)', margin: 0 }}>liquidity, locked forever</p>
            <p className="num" style={{ margin: '.35rem 0 0', fontSize: '.85rem', color: 'rgba(43,38,32,.7)' }}>
              {compactNum(supply)} supply · {holderData ? holderData.holders.length : '—'} holders
            </p>
          </div>
        </div>
      </div>

      <div className="token-grid" style={{ marginTop: '1.75rem' }}>
        <aside className="token-left">
          <Card title={`About ${token.name}`}>
            <p style={{ margin: 0, lineHeight: 1.4, color: 'rgba(43,38,32,.85)' }}>
              {token.description || 'The creator left this one without a description.'}
            </p>
          </Card>

          {/* Supply, decimals and a zero tax are the same on every launch here,
              and the raw price is already the market cap divided by supply. The
              About tab keeps them for anyone who wants the full sheet. */}
          <Card title="Token Info">
            <Row label="Market cap">{usd(token.marketCapEth, rate)}</Row>
            <Row label="Liquidity locked">
              <span style={{ color: 'var(--forest)' }}>Yes · permanently</span>
            </Row>
            <Row label="Contract">{shortAddress(token.address)}</Row>
            <Row label="Launched">{ago(token.launchedAt) || '—'}</Row>
            <Row label="Creator">{shortAddress(token.deployer)}</Row>
            <Row label="Fees to">{shortAddress(token.feeRecipient)}{token.takenOver ? ' (taken over)' : ''}</Row>
          </Card>

          <SentimentPanel token={token.address} />

          {socials.length > 0 && (
            <Card title="Socials">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                {socials.map(([label, href, icon]) => (
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                     className="chip sketch-2 shadow-rough-sm" aria-label={label} title={label}
                     style={{ padding: '.4rem .55rem' }}>
                    <Icon name={icon} />
                  </a>
                ))}
              </div>
            </Card>
          )}
        </aside>

        <div className="token-main">
          <TokenTabs token={token} swaps={trades} holderData={holderData} rate={rate} />
          <TradesTable swaps={trades} symbol={token.symbol} />
        </div>

        <aside className="token-side">
          <TradePanel token={token.address} symbol={token.symbol} priceEth={last} rate={rate} />
          <FeePanel token={token} />

          <Card title="Pool Info">
            <Row label="ETH liquidity">{token.pooledEth.toFixed(4)} ETH</Row>
            <Row label="Token liquidity">
              {pooledTokens !== undefined ? `${compactNum(Number(formatEther(pooledTokens)))} ${token.symbol}` : '—'}
            </Row>

            {/* The same bar the board draws on every card: how close this pool is
                to the threshold that graduates it. A percentage on its own reads
                as a number; the bar reads as a distance. */}
            <div style={{ marginTop: '.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem' }}>
                <span className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem' }}>to graduation</span>
                <span className="num" style={{ fontSize: '.9rem' }}>{token.progressPct.toFixed(1)}%</span>
              </div>
              <div className="bar-track" style={{ height: 14, marginTop: '.3rem' }} role="img"
                   aria-label={`${token.progressPct.toFixed(1)}% of the way to graduation`}>
                <div className="bar-fill" style={{ width: `${Math.min(100, token.progressPct)}%`, background: 'var(--forest2)' }} />
              </div>
              <p className="num" style={{ fontSize: '.78rem', color: 'rgba(43,38,32,.55)', margin: '.3rem 0 0' }}>
                {token.pooledEth.toFixed(4)} of {formatEther(LAUNCH.graduationThreshold)} ETH
              </p>
            </div>
          </Card>

          <Card title="Token Performance">
            {PERF.map(([label, win]) => {
              const v = changeOver(trades, win, last, age);
              return (
                <Row key={label} label={label}>
                  <span style={{ color: v === null ? 'rgba(43,38,32,.45)' : v >= 0 ? 'var(--forest2)' : 'var(--crayred)' }}>
                    {v === null ? '—' : pct(v)}
                  </span>
                </Row>
              );
            })}
            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.5rem 0 0', lineHeight: 1.2 }}>
              from this pool's swaps — a dash means the token is younger than the window
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
