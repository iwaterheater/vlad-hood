import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from './lib/wagmi';
import App from './App';
import './index.css';

/* Chain reads are cheap to repeat and expensive to get wrong, so results are
   kept briefly and refetched when the tab comes back rather than on every
   render. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: true },
  },
});

const vladhoodTheme = lightTheme({
  accentColor: '#e0a51e',
  accentColorForeground: '#2b2620',
  borderRadius: 'large',
  fontStack: 'system',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* pinned: RainbowKit otherwise follows the browser language, so the
            wallet dialog turned Russian while the rest of the page stayed English */}
        <RainbowKitProvider theme={vladhoodTheme} modalSize="compact" locale="en-US">
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
