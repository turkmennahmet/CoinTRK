import { createBrowserRouter, redirect } from 'react-router'

import { AppShell } from './AppShell'
import { RouteError } from './RouteError'

// Every page is its own chunk, so the first load only ships the page being opened.
export const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    ErrorBoundary: RouteError,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, lazy: async () => ({ Component: (await import('../features/overview/OverviewPage')).default }) },
          { path: 'hacim', lazy: async () => ({ Component: (await import('../features/volume/VolumePage')).default }) },
          {
            path: 'fiyat-hacim',
            lazy: async () => ({ Component: (await import('../features/anomaly/AnomalyPage')).default }),
          },
          // Former address of the price/volume page; keeps saved links and their filters working.
          { path: 'anomali', loader: ({ request }) => redirect(`/fiyat-hacim${new URL(request.url).search}`) },
          { path: 'golden-cross', lazy: async () => ({ Component: (await import('../features/cross/CrossPage')).default }) },
          { path: 'rsi', lazy: async () => ({ Component: (await import('../features/rsi/RsiPage')).default }) },
          { path: 'ema', lazy: async () => ({ Component: (await import('../features/ema/EmaPage')).default }) },
          {
            path: 'birlesik-filtre',
            lazy: async () => ({ Component: (await import('../features/screener/ScreenerPage')).default }),
          },
          { path: 'coin/:symbol', lazy: async () => ({ Component: (await import('../features/coin/CoinPage')).default }) },
          {
            path: 'uyumsuzluk',
            lazy: async () => ({ Component: (await import('../features/divergence/DivergencePage')).default }),
          },
          {
            path: 'open-interest',
            lazy: async () => ({ Component: (await import('../features/open-interest/OpenInterestPage')).default }),
          },
          { path: 'funding', lazy: async () => ({ Component: (await import('../features/funding/FundingPage')).default }) },
          { path: '*', loader: () => { throw new Response('Not found', { status: 404 }) } },
        ],
      },
    ],
  },
])
