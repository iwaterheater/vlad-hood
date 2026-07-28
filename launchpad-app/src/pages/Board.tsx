import { useTokens } from '../lib/useTokens';
import { useEthUsd } from '../lib/useEthUsd';
import { usd, shortAddress, ago } from '../lib/format';
import TokenArt from '../components/TokenArt';

export default function Board() {
  const { data: tokens, isLoading, error, refetch, isFetching } = useTokens();
  const rate = useEthUsd();

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

      {tokens && tokens.length > 0 && (
        <>
          <p className="caveat" style={{ fontSize: '1.15rem', color: 'var(--brown)', margin: '.5rem 0 0' }}>
            {tokens.length} token{tokens.length === 1 ? '' : 's'}{isFetching ? ' · refreshing' : ''}
          </p>
          <div className="grid-cards">
            {tokens.map((t) => (
              <a key={t.address} className="card sketch shadow-rough" href={`/launchpad/token?id=${t.address}`}>
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
