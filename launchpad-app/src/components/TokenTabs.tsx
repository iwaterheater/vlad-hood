import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import type { Swap } from '../lib/useSwaps';
import type { HolderData } from '../lib/useHolders';
import type { LaunchedToken } from '../lib/tokens';
import { usd, usdAxis, pct, compactNum, shortAddress, ago } from '../lib/format';
import PriceChart from './PriceChart';

type Tab = 'chart' | 'holders' | 'about';
type Range = '5m' | '15m' | '1h' | '6h' | '1d';

/* Trades are not a tab — they have their own card under this one. */
const TABS: [Tab, string][] = [['chart', 'Chart'], ['holders', 'Holders'], ['about', 'About']];
const RANGES: [Range, string][] = [['5m', '5M'], ['15m', '15M'], ['1h', '1H'], ['6h', '6H'], ['1d', '1D']];
/* A step, not a window: the buttons change how finely the history is cut, the
   way every chart of this kind reads them. As a window they hid the whole token
   — a pool trades a handful of times a day, so "last 5 minutes" was empty. */
const STEP_MS: Record<Range, number> = { '5m': 3e5, '15m': 9e5, '1h': 36e5, '6h': 216e5, '1d': 864e5 };
/* Enough points for a shape, few enough that a fine step over a long life does
   not draw thousands. Past this the chart shows the most recent MAX_POINTS. */
const MAX_POINTS = 180;

/** Last trade price in each step, carried forward through steps with no trades —
 *  a quiet interval holds the previous price rather than breaking the line. */
function bucketed(swaps: Swap[], step: number, now: number): { t: number; price: number }[] {
  if (!swaps.length) return [];
  const firstEdge = Math.floor(swaps[0].t / step) * step;
  const lastEdge = Math.floor(now / step) * step;
  const total = Math.floor((lastEdge - firstEdge) / step) + 1;
  /* A token younger than one step fits in a single bucket, and one point is not
     a line. Reaching one step further back opens flat at the first trade's price
     so the coarse timeframes still draw something true. */
  const count = Math.min(MAX_POINTS, Math.max(2, total));
  const from = lastEdge - (count - 1) * step;

  const out: { t: number; price: number }[] = [];
  let i = 0;
  let last = swaps[0].price;
  while (i < swaps.length && swaps[i].t < from) last = swaps[i++].price;
  for (let b = 0; b < count; b++) {
    const edge = from + (b + 1) * step;
    while (i < swaps.length && swaps[i].t < edge) last = swaps[i++].price;
    out.push({ t: from + b * step, price: last });
  }
  /* Buckets are stamped with their own start, so the ends of the axis lie: the
     last one can be most of a day behind the present, and the first reaches back
     before the token existed. Pin both to what actually happened, and the time
     labels then span exactly the trading history. */
  out[out.length - 1].t = Math.max(out[out.length - 1].t, now);
  out[0].t = Math.max(out[0].t, swaps[0].t);
  return out;
}

function humanSpan(ms: number) {
  const m = Math.round(ms / 6e4);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/** The same badge the chart pins on a creator trade, for the legend beside it. */
function Flag({ kind }: { kind: 'buy' | 'sell' }) {
  return (
    <span className="num" style={{ background: kind === 'buy' ? 'var(--forest2)' : 'var(--crayred)',
                                   color: 'var(--paper)', borderRadius: 5, padding: '0 .3rem', fontSize: '.75rem' }}>
      {kind === 'buy' ? 'DB' : 'DS'}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.5rem', textAlign: 'center' }}>
      <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: 0, lineHeight: 1 }}>{label}</p>
      <p className="num" style={{ margin: '.25rem 0 0', fontSize: '.95rem', overflowWrap: 'anywhere' }}>{children}</p>
    </div>
  );
}

export default function TokenTabs({ token, swaps, holderData, rate }: {
  token: LaunchedToken; swaps: Swap[]; holderData?: HolderData; rate: number | null;
}) {
  const [tab, setTab] = useState<Tab>('chart');
  const [range, setRange] = useState<Range>('1d');

  const supply = Number(formatEther(token.totalSupply));
  /* The chart is a market cap chart: a launch price is billionths of an ETH and
     says nothing on its own, while supply here is fixed, so the two curves have
     the same shape and only one of them is readable. */
  const capOf = (price: number) => price * supply;

  const points = useMemo(() => bucketed(swaps, STEP_MS[range], Date.now()), [swaps, range]);

  const series = points.map((p) => ({ t: p.t, v: capOf(p.price) }));

  /* The creator trading their own launch is the one thing on this chart worth
     pointing at, so it is flagged rather than left to the trades table. Only
     what the drawn window covers — a flag pinned to the nearest point outside
     it would sit on a moment it did not happen in. */
  const from = points[0]?.t ?? 0;
  const devTrades = swaps.filter(
    (s) => s.from && s.from === token.deployer.toLowerCase() && s.t >= from,
  );
  const markers = devTrades.map((s) => ({ t: s.t, kind: s.side }));
  const devBuys = devTrades.filter((s) => s.side === 'buy').length;
  const devSells = devTrades.length - devBuys;
  const caps = series.map((p) => p.v);
  const first = caps[0] ?? null;
  const lastCap = caps[caps.length - 1] ?? (token.marketCapEth ?? null);
  const change = first && lastCap ? ((lastCap - first) / first) * 100 : null;
  const hi = caps.length ? Math.max(...caps) : null;
  const lo = caps.length ? Math.min(...caps) : null;
  /* How long there has actually been something to look at. The axis reaches back
     a whole step further than the first trade so a young token still draws a
     line, and measuring the label off that claimed the chart covered 42 hours of
     a token one minute old. */
  const covered = swaps.length ? Date.now() - Math.max(points[0]?.t ?? 0, swaps[0].t) : 0;
  const span = covered > 6e4 ? humanSpan(covered) : null;

  const tabBtn = (on: boolean) => ({
    padding: '.5rem .7rem', cursor: 'pointer', background: 'transparent', border: 0,
    borderBottom: on ? '3px solid var(--forest)' : '3px solid transparent',
    color: on ? 'var(--forest)' : 'var(--ink)',
    fontFamily: "'Permanent Marker', cursive", fontSize: '1.05rem',
  });

  return (
    <div className="sketch shadow-rough" style={{ background: 'var(--paper2)', padding: '1rem' }}>
      <div role="tablist" aria-label="Token detail sections" className="tab-strip">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} style={tabBtn(tab === k)} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'chart' && (
        <div role="tabpanel" style={{ paddingTop: '.75rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '.75rem' }}>
            <div>
              <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.15rem', margin: 0, lineHeight: 1 }}>market cap</p>
              <p style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', margin: '.25rem 0 0', flexWrap: 'wrap' }}>
                <span className="num marker" style={{ fontSize: '1.6rem' }}>{usd(lastCap, rate)}</span>
                {change !== null && (
                  <span className="num" style={{ color: change >= 0 ? 'var(--forest2)' : 'var(--crayred)' }}>
                    {pct(change)}{span ? ` · ${span}` : ''}
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
              {RANGES.map(([k, label]) => (
                <button key={k} className="marker sketch-2" onClick={() => setRange(k)} aria-pressed={range === k}
                        style={{ padding: '.15rem .55rem', fontSize: '.8rem', cursor: 'pointer', border: '2px solid var(--ink)',
                                 background: range === k ? 'var(--ink)' : 'var(--paper)',
                                 color: range === k ? 'var(--paper)' : 'var(--ink)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="sketch-2" style={{ background: 'var(--paper)', padding: '.5rem', marginTop: '.75rem', position: 'relative' }}>
            {devTrades.length > 0 && (
              <div className="sketch-2" style={{ position: 'absolute', top: '.9rem', left: '.9rem', zIndex: 1,
                                                 background: 'var(--paper2)', padding: '.2rem .5rem',
                                                 display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.85rem' }}>
                {devBuys > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                  <Flag kind="buy" /> Dev buy <span className="num" style={{ color: 'rgba(43,38,32,.6)' }}>{devBuys}</span>
                </span>}
                {devSells > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                  <Flag kind="sell" /> Dev sell <span className="num" style={{ color: 'rgba(43,38,32,.6)' }}>{devSells}</span>
                </span>}
              </div>
            )}
            <PriceChart series={series} markers={markers} format={(v, step) => usdAxis(v, rate, step)} />
          </div>

          {series.length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '.5rem', marginTop: '.75rem' }}>
              <Stat label="high">{usd(hi, rate)}</Stat>
              <Stat label="low">{usd(lo, rate)}</Stat>
              <Stat label="range">
                <span style={{ color: (change ?? 0) >= 0 ? 'var(--forest2)' : 'var(--crayred)' }}>{pct(change)}</span>
              </Stat>
            </div>
          )}

          <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.6rem 0 0' }}>
            built from this pool's own swaps
          </p>
        </div>
      )}

      {tab === 'holders' && (
        <div role="tabpanel" style={{ paddingTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '.5rem', flexWrap: 'wrap' }}>
            <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.4rem', margin: 0 }}>Top Holders</h2>
            <p className="num" style={{ color: 'rgba(43,38,32,.7)', margin: 0 }}>
              {holderData ? `${holderData.holders.length} holder${holderData.holders.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>

          {!holderData && <p style={{ color: 'rgba(43,38,32,.6)' }}>Reading transfers…</p>}
          {holderData && holderData.holders.length === 0 && <p style={{ color: 'rgba(43,38,32,.6)' }}>No holders yet.</p>}
          {holderData && holderData.holders.length > 0 && (
            <div style={{ display: 'grid', gap: '.5rem', marginTop: '.75rem' }}>
              {holderData.holders.slice(0, 20).map((h) => (
                <div key={h.address}>
                  <div className="num" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.9rem' }}>
                    <span style={{ color: 'rgba(43,38,32,.75)' }}>{shortAddress(h.address)}</span>
                    {h.label && <span className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem' }}>{h.label}</span>}
                    <span style={{ flex: 1, borderBottom: '1px dotted rgba(43,38,32,.25)' }} />
                    <span>{h.share.toFixed(2)}%</span>
                  </div>
                  <div className="bar-track" style={{ height: 8, marginTop: '.2rem' }}>
                    <div className="bar-fill" style={{ width: `${Math.min(100, h.share)}%`, background: 'var(--forest2)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {holderData && (
            <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.05rem', margin: '.9rem 0 0', lineHeight: 1.2 }}>
              replayed from {holderData.transfers} transfer{holderData.transfers === 1 ? '' : 's'} — exact, not sampled
            </p>
          )}
        </div>
      )}

      {tab === 'about' && (
        <div role="tabpanel" style={{ paddingTop: '1rem' }}>
          <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.4rem', margin: 0 }}>About {token.name}</h2>
          <p style={{ margin: '.5rem 0 0', lineHeight: 1.4, color: 'rgba(43,38,32,.85)' }}>
            {token.description || 'The creator left this one without a description.'}
          </p>

          <h3 className="marker" style={{ color: 'var(--forest)', fontSize: '1.15rem', margin: '1.25rem 0 0' }}>Key facts</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '.5rem', marginTop: '.5rem' }}>
            <Stat label="status">{token.progressPct >= 100 ? 'GRADUATED' : 'LIVE'}</Stat>
            <Stat label="market cap">{usd(token.marketCapEth, rate)}</Stat>
            <Stat label="total supply">{compactNum(supply)} {token.symbol}</Stat>
            <Stat label="holders">{holderData ? holderData.holders.length : '—'}</Stat>
            <Stat label="trades">{swaps.length}</Stat>
            <Stat label="pooled">{token.pooledEth.toFixed(4)} ETH</Stat>
            <Stat label="to graduation">{token.progressPct.toFixed(1)}%</Stat>
            <Stat label="tax">0% buy / 0% sell</Stat>
            <Stat label="launched">{ago(token.launchedAt) || '—'}</Stat>
          </div>
        </div>
      )}
    </div>
  );
}
