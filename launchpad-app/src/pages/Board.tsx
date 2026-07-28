import { useMemo, useState } from 'react';
import { useTokens } from '../lib/useTokens';
import { useEthUsd } from '../lib/useEthUsd';
import { usd, shortAddress, ago } from '../lib/format';
import TokenArt from '../components/TokenArt';

type Sort = 'newest' | 'oldest' | 'mcap' | 'pooled';
type Period = 'all' | '24h' | '7d';

const SORTS: [Sort, string][] = [['newest', 'Newest'], ['oldest', 'Oldest'], ['mcap', 'Market cap'], ['pooled', 'Pooled']];
const PERIODS: [Period, string][] = [['all', 'All'], ['24h', '24h'], ['7d', '7d']];
const WINDOW: Record<Period, number> = { all: Infinity, '24h': 864e5, '7d': 6048e5 };

export default function Board() {
  const { data: tokens, isLoading, error, refetch, isFetching } = useTokens();
  const rate = useEthUsd();
  const [sort, setSort] = useState<Sort>('newest');
  const [period, setPeriod] = useState<Period>('all');
  const [gradPage, setGradPage] = useState(0);

  /* A token that filled its curve leaves the board and joins the shelf above it,
     so nothing appears in both places. */
  const { live, graduated } = useMemo(() => {
    const all = tokens ?? [];
    const inWindow = (t: (typeof all)[number]) =>
      period === 'all' || (t.launchedAt !== null && Date.now() - t.launchedAt <= WINDOW[period]);

    const sorted = [...all].filter(inWindow).sort((a, b) => {
      if (sort === 'oldest') return (a.launchedAt ?? 0) - (b.launchedAt ?? 0);
      if (sort === 'mcap') return (b.marketCapEth ?? 0) - (a.marketCapEth ?? 0);
      if (sort === 'pooled') return b.pooledEth - a.pooledEth;
      return (b.launchedAt ?? 0) - (a.launchedAt ?? 0);
    });

    return {
      live: sorted.filter((t) => t.progressPct < 100),
      graduated: all.filter((t) => t.progressPct >= 100).sort((a, b) => (b.marketCapEth ?? 0) - (a.marketCapEth ?? 0)),
    };
  }, [tokens, sort, period]);

  const PER_PAGE = 10;
  const gradPages = Math.max(1, Math.ceil(graduated.length / PER_PAGE));
  const gradSlice = graduated.slice(gradPage * PER_PAGE, gradPage * PER_PAGE + PER_PAGE);

  const pill = (on: boolean) => ({
    padding: '.25rem .7rem', cursor: 'pointer', fontSize: '.85rem',
    background: on ? 'var(--ink)' : 'var(--paper)', color: on ? 'var(--paper)' : 'var(--ink)',
    border: '2px solid var(--ink)', borderRadius: '999px',
    fontFamily: "'Permanent Marker', cursive",
  });

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
        <h1 className="marker" style={{ color: 'var(--forest)', fontSize: '2.25rem', margin: 0 }}>Launchpad</h1>
        <a href="/launchpad/create" className="marker sketch-2 shadow-rough-sm"
           style={{ background: 'var(--mustard)', padding: '.6rem 1.1rem', textDecoration: 'none', fontSize: '1.05rem' }}>
          Launch a meme →
        </a>
      </div>

      {isLoading && (
        <p className="caveat" style={{ fontSize: '1.35rem', color: 'var(--brown)', marginTop: '2rem' }}>
          Reading the chain…
        </p>
      )}

      {error && (
        <div className="sketch shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '1.5rem', marginTop: '1.5rem' }}>
          <p className="marker" style={{ color: 'var(--crayred)', margin: 0 }}>Could not reach the chain</p>
          <p style={{ marginTop: '.5rem' }}>{(error as Error).message}</p>
          <button className="marker sketch-2" onClick={() => refetch()} style={{ marginTop: '.75rem', padding: '.4rem .9rem', background: 'var(--paper)', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      )}

      {tokens && tokens.length === 0 && (
        <p className="caveat" style={{ fontSize: '1.35rem', color: 'var(--brown)', marginTop: '2rem' }}>
          Nothing launched here yet. Be first.
        </p>
      )}

      {graduated.length > 0 && (
        <section className="sketch-2 shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '.7rem .9rem', marginTop: '1.25rem' }}>
          <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '.9rem', margin: 0 }}>
            GRADUATED <span className="num" style={{ color: 'rgba(43,38,32,.55)', fontSize: '.8rem' }}>({graduated.length})</span>
          </h2>
          <div style={{ display: 'grid', gap: '.5rem', gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))', marginTop: '.5rem' }}>
            {gradSlice.map((t) => (
              <a key={t.address} href={`/launchpad-next/token?id=${t.address}`}
                 className="sketch-2 shadow-rough-sm"
                 style={{ background: 'var(--paper)', padding: '.4rem .5rem', textDecoration: 'none', display: 'grid', gap: '.15rem' }}>
                <span className="marker" style={{ color: 'var(--forest)', fontSize: '.7rem' }}>{t.name}</span>
                <span className="num" style={{ color: 'var(--brown)', fontSize: '.7rem' }}>${t.symbol}</span>
                <span className="num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem' }}>
                  <span>{usd(t.marketCapEth, rate)} <span style={{ color: 'var(--brown)', fontSize: '.62rem' }}>MC</span></span>
                  <span style={{ color: 'var(--brown)' }}>{ago(t.launchedAt)}</span>
                </span>
              </a>
            ))}
          </div>
          {gradPages > 1 && (
            <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'center', alignItems: 'center', marginTop: '.5rem' }}>
              <button style={{ ...pill(false), fontSize: '.65rem' }} disabled={gradPage === 0} onClick={() => setGradPage((p) => p - 1)}>← Prev</button>
              <span className="num" style={{ fontSize: '.7rem', color: 'rgba(43,38,32,.7)' }}>{gradPage + 1} / {gradPages}</span>
              <button style={{ ...pill(false), fontSize: '.65rem' }} disabled={gradPage >= gradPages - 1} onClick={() => setGradPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </section>
      )}

      {tokens && tokens.length > 0 && (
        <>
          <div className="sketch shadow-rough-sm" style={{ background: 'var(--paper2)', padding: '.5rem .7rem', marginTop: '1rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {SORTS.map(([k, label]) => (
              <button key={k} style={pill(sort === k)} onClick={() => setSort(k)} aria-pressed={sort === k}>{label}</button>
            ))}
            <span style={{ flex: 1 }} />
            {PERIODS.map(([k, label]) => (
              <button key={k} style={pill(period === k)} onClick={() => setPeriod(k)} aria-pressed={period === k}>{label}</button>
            ))}
          </div>

          <p className="caveat" style={{ fontSize: '1.15rem', color: 'var(--brown)', margin: '.5rem 0 0' }}>
            {live.length} of {tokens.length} token{tokens.length === 1 ? '' : 's'}{isFetching ? ' · refreshing' : ''}
          </p>
          <div className="grid-cards">
            {live.map((t) => (
              <a key={t.address} className="card sketch shadow-rough" href={`/launchpad-next/token?id=${t.address}`}>
                <TokenArt address={t.address} logo={t.logo} name={t.name} />
                <div style={{ padding: '.7rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 className="marker card-title" style={{ color: 'var(--forest)', fontSize: '.95rem', margin: 0 }}>{t.name}</h3>
                  <p className="num" style={{ color: 'var(--brown)', fontSize: '.85rem', margin: '.15rem 0 0' }}>${t.symbol}</p>
                  <p className="num" style={{ fontSize: '1.05rem', margin: '.35rem 0 0' }}>
                    {usd(t.marketCapEth, rate)}
                    <span style={{ fontSize: '.7rem', color: 'var(--brown)', marginLeft: '.3rem' }}>MC</span>
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.6rem' }}>
                    <div className="bar-track" style={{ flex: 1 }} role="img" aria-label={`${t.progressPct.toFixed(1)}% to graduation`}>
                      <div className="bar-fill" style={{ width: `${t.progressPct}%`, background: 'var(--forest2)' }} />
                    </div>
                    <span className="num" style={{ fontSize: '.8rem' }}>{Math.round(t.progressPct)}%</span>
                  </div>
                  <div className="num" style={{ display: 'flex', justifyContent: 'space-between', gap: '.4rem', fontSize: '.72rem', marginTop: 'auto', paddingTop: '.6rem' }}>
                    <span style={{ color: 'rgba(43,38,32,.6)' }}>{shortAddress(t.address)}</span>
                    <span style={{ color: 'var(--forest)' }}>{ago(t.launchedAt)}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
