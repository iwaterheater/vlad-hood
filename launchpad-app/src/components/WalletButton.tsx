import { ConnectButton } from '@rainbow-me/rainbowkit';

/**
 * The wallet control, drawn like the rest of the page.
 *
 * RainbowKit's own button is a rounded white pill with its own type — the one
 * thing on a hand-drawn page that looked bought in. Its modal is still doing all
 * the work; only the trigger is ours.
 */
export default function WalletButton({ label = 'Connect wallet', full = false }: {
  label?: string; full?: boolean;
}) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, openChainModal, mounted }) => {
        const base = {
          fontFamily: "'Permanent Marker', cursive",
          border: '2.4px solid var(--ink)',
          padding: full ? '.6rem 1rem' : '.35rem .8rem',
          fontSize: full ? '1.1rem' : '.95rem',
          cursor: 'pointer',
          width: full ? '100%' : undefined,
          whiteSpace: 'nowrap' as const,
        };

        /* Until the connectors have settled, anything drawn here would be a
           guess that flickers into the truth a frame later. */
        if (!mounted) {
          return <div style={{ opacity: 0, pointerEvents: 'none', height: full ? '2.6rem' : '2rem' }} aria-hidden />;
        }

        if (!account || !chain) {
          return (
            <button className="sketch-2 shadow-rough-sm" onClick={openConnectModal}
                    style={{ ...base, background: 'var(--mustard)', color: 'var(--ink)' }}>
              {label}
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button className="sketch-2 shadow-rough-sm" onClick={openChainModal}
                    style={{ ...base, background: 'var(--crayred)', color: 'var(--paper)' }}>
              Wrong network
            </button>
          );
        }

        return (
          <button className="sketch-2 shadow-rough-sm num" onClick={openAccountModal}
                  title={account.address}
                  style={{ ...base, background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'inherit' }}>
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
