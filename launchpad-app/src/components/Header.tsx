import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Header() {
  return (
    <header style={{ borderBottom: '3px solid var(--ink)', background: 'rgba(239,230,207,.95)', backdropFilter: 'blur(6px)', position: 'sticky', top: 0, zIndex: 30 }}>
      <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', padding: '.5rem 1.25rem' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '.5rem', textDecoration: 'none', flex: 'none' }}>
          <img
            src="https://vlad-hood.xyz/photo_1_2026-07-21_06-14-24.jpg?v=2"
            alt="Vladhood" width={44} height={44}
            style={{ borderRadius: '50%', border: '3px solid var(--ink)', boxShadow: '3px 4px 0 rgba(43,38,32,.8)' }}
          />
          <span className="marker" style={{ fontSize: '1.35rem', color: 'var(--forest)', letterSpacing: '.03em' }}>VLADHOOD</span>
        </a>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
    </header>
  );
}
