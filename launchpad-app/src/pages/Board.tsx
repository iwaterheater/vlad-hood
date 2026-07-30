import { useMemo, useState } from 'react';
import { formatEther } from 'viem';
import { useTokens } from '../lib/useTokens';
import { useActivity } from '../lib/useActivity';
import { useEthUsd } from '../lib/useEthUsd';
import { usd, shortAddress, ago } from '../lib/format';
import { LAUNCH } from '../lib/chain';
import TokenArt from '../components/TokenArt';
import Icon, { type IconName } from '../components/Icon';

type Sort = 'buys' | 'newest' | 'oldest' | 'mcap' | 'volume' | 'pooled';
type Period = 'all' | '24h' | '7d';

const SORTS: [Sort, string][] = [
  ['buys', 'Recent buys'], ['newest', 'Newest'], ['oldest', 'Oldest'],
  ['mcap', 'Market cap'], ['volume', 'Volume'], ['pooled', 'Pooled'],
];
const PERIODS: [Period, string][] = [['all', 'All'], ['24h', '24h'], ['7d', '7d']];
const WINDOW: Record<Period, number> = { all: Infinity, '24h': 864e5, '7d': 6048e5 };

const FEATURES: { icon: IconName; bg: string; fg: string; title: string; body: string; edge: string }[] = [
  { icon: 'scales', bg: 'var(--mustard)', fg: 'var(--ink)', title: 'Fair Launch', body: 'No presale. No VC. Just the community.', edge: 'sketch' },
  { icon: 'shield', bg: 'var(--forest)', fg: 'var(--paper)', title: 'Safe & Transparent', body: 'LP locked. Verified contracts. Rugproof by design.', edge: 'sketch-2' },
  { icon: 'users', bg: 'var(--brown)', fg: 'var(--paper)', title: 'Community Powered', body: 'Vote, support and pump the next big meme.', edge: 'sketch' },
];

const PROMISES = [
  'Fair launch on Robinhood Chain',
  'Locked liquidity',
  'Verified & community driven',
  'Get your meme in front of degens',
];

export default function Board() {
  const { data: tokens, isLoading, error, refetch, isFetching } = useTokens();
  const { data: activity } = useActivity(tokens);
  const rate = useEthUsd();
  const [sort, setSort] = useState<Sort>('newest');
  const [period, setPeriod] = useState<Period>('all');
  const [query, setQuery] = useState('');
  const [gradPage, setGradPage] = useState(0);

  /* A token that filled its curve leaves the board and joins the shelf above it,
     so nothing appears in both places. */
  const { live, graduated, matched } = useMemo(() => {
    const all = tokens ?? [];
    const q = query.trim().toLowerCase();
    const inWindow = (t: (typeof all)[number]) =>
      period === 'all' || (t.launchedAt !== null && Date.now() - t.launchedAt <= WINDOW[period]);
    const matches = (t: (typeof all)[number]) =>
      !q || [t.name, t.symbol, t.address, t.description].join(' ').toLowerCase().includes(q);
    const act = (t: (typeof all)[number]) => activity?.get(t.address.toLowerCase());

    const sorted = [...all].filter(inWindow).filter(matches).sort((a, b) => {
      if (sort === 'oldest') return (a.launchedAt ?? 0) - (b.launchedAt ?? 0);
      if (sort === 'mcap') return (b.marketCapEth ?? 0) - (a.marketCapEth ?? 0);
      if (sort === 'pooled') return b.pooledEth - a.pooledEth;
      if (sort === 'volume') return (act(b)?.volumeEth ?? 0) - (act(a)?.volumeEth ?? 0);
      /* Until the pools have been read, "recent buys" has nothing to rank on, and
         a token nobody has bought has no buy to be recent — both fall through to
         launch time rather than to an arbitrary order. */
      if (sort === 'buys') {
        const d = (act(b)?.lastBuy ?? 0) - (act(a)?.lastBuy ?? 0);
        if (d !== 0) return d;
      }
      return (b.launchedAt ?? 0) - (a.launchedAt ?? 0);
    });

    return {
      live: sorted.filter((t) => t.progressPct < 100),
      graduated: all.filter((t) => t.progressPct >= 100).filter(matches)
        .sort((a, b) => (b.marketCapEth ?? 0) - (a.marketCapEth ?? 0)),
      matched: sorted.length,
    };
  }, [tokens, activity, sort, period, query]);

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
      <section className="hero">
        <div>
          <p className="taped marker sketch-2 shadow-rough-sm"
             style={{ display: 'inline-block', background: 'var(--crayred)', color: 'var(--paper)',
                      fontSize: '.72rem', letterSpacing: '.04em', padding: '.25rem .7rem',
                      transform: 'rotate(-1deg)', margin: 0 }}>
            The forest needs new legends.
          </p>

          <h1 className="marker" style={{ color: 'var(--forest)', fontSize: 'clamp(2.25rem, 7vw, 3.75rem)', lineHeight: 1.2,
                                          margin: '1.5rem 0 0', transform: 'rotate(-1deg)', wordBreak: 'break-word' }}>
            <span className="scribble-underline">LAUNCHPAD</span><br />
            <span style={{ color: 'var(--mustard)' }}>MEMES</span>
          </h1>

          <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.5rem', margin: '1.25rem 0 0' }}>
            The home for the next 100x memes.
          </p>
          <p style={{ color: 'rgba(43,38,32,.8)', fontSize: '1.05rem', margin: '.1rem 0 0' }}>
            Fair launches. Community first. Built on Robinhood Chain.
          </p>

          <div className="hero-features">
            {FEATURES.map((f) => (
              <div key={f.title} className={`${f.edge} shadow-rough-sm`} style={{ background: 'var(--paper2)', padding: '.75rem' }}>
                <span className="hero-badge" style={{ background: f.bg, color: f.fg }}><Icon name={f.icon} /></span>
                <h3 className="marker" style={{ color: 'var(--forest)', fontSize: '1rem', margin: '.5rem 0 0' }}>{f.title}</h3>
                <p style={{ color: 'rgba(43,38,32,.8)', fontSize: '.9rem', lineHeight: 1.35, margin: '.15rem 0 0' }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="sketch shadow-rough" style={{ position: 'relative', background: 'var(--paper2)', padding: '1.25rem' }}>
          <span className="pin" />
          <h2 className="marker" style={{ color: 'var(--forest)', fontSize: '1.5rem', margin: '.25rem 0 0' }}>Create your meme</h2>
          <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.15rem', margin: '.1rem 0 0' }}>Launch your idea to the forest.</p>

          <ul style={{ listStyle: 'none', padding: 0, margin: '.75rem 0 0', display: 'grid', gap: '.4rem' }}>
            {PROMISES.map((p) => (
              <li key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', lineHeight: 1.35 }}>
                <span style={{ color: 'var(--forest2)', fontSize: '1.15rem', flex: 'none' }}><Icon name="check" strokeWidth={2.6} /></span>
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <a href="/launchpad-next/create" className="marker sketch-2 shadow-rough-sm"
             style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem',
                      background: 'var(--mustard)', padding: '.65rem 1rem', marginTop: '1rem',
                      textDecoration: 'none', fontSize: '1.2rem' }}>
            LAUNCH A MEME <Icon name="arrow" strokeWidth={2.2} />
          </a>

          <p className="caveat" style={{ color: 'var(--brown)', fontSize: '1.1rem', textAlign: 'center', margin: '.35rem 0 0' }}>
            Launch fee: {formatEther(LAUNCH.fee)} ETH
          </p>
          <p style={{ fontSize: '.72rem', color: 'rgba(43,38,32,.55)', textAlign: 'center', margin: '.5rem 0 0', lineHeight: 1.35 }}>
            Opens the launch form. It deploys a real token on the testnet, so your wallet will ask you to sign and the
            launch fee is charged in testnet ETH.
          </p>
        </aside>
      </section>

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
          <h2 className="sect-head marker" style={{ color: 'var(--forest)', fontSize: '.9rem', margin: 0 }}>
            <span className="sect-badge" style={{ background: 'var(--mustard)', color: 'var(--ink)' }}><Icon name="flag" /></span>
            <span>GRADUATED <span className="num" style={{ color: 'rgba(43,38,32,.55)', fontSize: '.8rem' }}>({graduated.length})</span></span>
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
          <div className="sketch shadow-rough-sm toolbar" style={{ background: 'var(--paper2)', padding: '.5rem .7rem', marginTop: '1rem' }}>
            {SORTS.map(([k, label]) => (
              <button key={k} style={pill(sort === k)} onClick={() => setSort(k)} aria-pressed={sort === k}>{label}</button>
            ))}
            {PERIODS.map(([k, label]) => (
              <button key={k} style={pill(period === k)} onClick={() => setPeriod(k)} aria-pressed={period === k}>{label}</button>
            ))}
            <label className="sketch-2 toolbar-search">
              <span style={{ color: 'rgba(43,38,32,.55)', flex: 'none', display: 'flex' }}><Icon name="search" /></span>
              <input value={query} onChange={(e) => { setQuery(e.target.value); setGradPage(0); }}
                     placeholder="Search memes" aria-label="Search memes" />
            </label>
          </div>

          <p className="caveat" style={{ fontSize: '1.15rem', color: 'var(--brown)', margin: '.5rem 0 0' }}>
            {matched > 0
              ? `Showing ${live.length} of ${tokens.length} token${tokens.length === 1 ? '' : 's'}`
              : 'Nothing matches that search'}
            {isFetching ? ' · refreshing' : ''}
          </p>

          {live.length > 0 && (
            <>
              <h2 className="sect-head marker" style={{ color: 'var(--forest)', fontSize: '.9rem', margin: '1rem 0 0' }}>
                <span className="sect-badge" style={{ background: 'var(--forest)', color: 'var(--paper)' }}><Icon name="spark" /></span>
                <span>LIVE NOW <span className="num" style={{ color: 'rgba(43,38,32,.55)', fontSize: '.8rem' }}>({live.length})</span></span>
              </h2>
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
      )}
    </>
  );
}
