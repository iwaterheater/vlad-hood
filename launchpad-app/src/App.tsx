import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import Header from './components/Header';
import Board from './pages/Board';
import TokenPage from './pages/TokenPage';
import Create from './pages/Create';

/* Three pages, no router library: the paths are fixed and a dependency for two
   comparisons is not worth its weight. */
function route() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.endsWith('/create')) return 'create';
  if (path.endsWith('/token') || new URLSearchParams(window.location.search).get('id')) return 'token';
  return 'board';
}

export default function App() {
  const page = route();

  /* Nothing here polls the chain, so switching accounts in the wallet left every
     figure on the page describing the account you just left — the launch form
     read a stale balance and refused a wallet that could well afford it. */
  const { address } = useAccount();
  const queryClient = useQueryClient();
  useEffect(() => { queryClient.invalidateQueries(); }, [address, queryClient]);

  return (
    <>
      <Header />
      <div className="banner">
        <div className="wrap" style={{ padding: '.6rem 1.25rem', display: 'flex', gap: '.6rem' }}>
          <span className="marker" style={{ letterSpacing: '.03em' }}>TESTNET.</span>
          <span style={{ lineHeight: 1.35 }}>
            Tokens here are real contracts on the Robinhood Chain testnet. The coins are handed out free
            and are worth nothing, the chain can be reset at any time, and none of it has been audited.
          </span>
        </div>
      </div>
      <main className="wrap" style={{ paddingBottom: '4rem' }}>
        {page === 'board' && <Board />}
        {page === 'token' && <TokenPage />}
        {page === 'create' && <Create />}
      </main>
    </>
  );
}
