import { createConfig, http } from 'wagmi';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet, metaMaskWallet, rabbyWallet, phantomWallet, coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { robinhoodTestnet } from './chain';

/**
 * Browser wallets only, deliberately.
 *
 * RainbowKit's getDefaultConfig pulls in WalletConnect, which needs a project id
 * from a third-party dashboard. Every wallet listed here is injected into the
 * page, so the launchpad needs no account anywhere to let people connect. Adding
 * WalletConnect later is one entry in this list plus that id.
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Installed',
      wallets: [injectedWallet, metaMaskWallet, rabbyWallet, phantomWallet, coinbaseWallet],
    },
  ],
  { appName: 'Vladhood Launchpad', projectId: 'VLADHOOD_NO_WALLETCONNECT' },
);

export const config = createConfig({
  chains: [robinhoodTestnet],
  connectors,
  transports: { [robinhoodTestnet.id]: http() },
  ssr: false,
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
