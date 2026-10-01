import { createBrowserRouter, redirect } from 'react-router'

import { AlphaShell, AppShell } from './AppShell'
import { RouteError } from './RouteError'

const volumePage = async () => ({ Component: (await import('../features/volume/VolumePage')).default })
const rsiPage = async () => ({ Component: (await import('../features/rsi/RsiPage')).default })
const anomalyPage = async () => ({ Component: (await import('../features/anomaly/AnomalyPage')).default })
const notFound = () => {
  throw new Response('Not found', { status: 404 })
}

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
          { path: 'hacim', lazy: volumePage },
          { path: 'fiyat-hacim', lazy: anomalyPage },
          // Former address of the price/volume page; keeps saved links and their filters working.
          { path: 'anomali', loader: ({ request }) => redirect(`/fiyat-hacim${new URL(request.url).search}`) },
          { path: 'golden-cross', lazy: async () => ({ Component: (await import('../features/cross/CrossPage')).default }) },
          { path: 'rsi', lazy: rsiPage },
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
          { path: '*', loader: notFound },
        ],
      },
    ],
  },
  // Binance Alpha (Web3 tokens): a separate site reusing the pages above. Its data is
  // only requested on these routes, so the futures pages never wait for it.
  {
    path: '/web3',
    Component: AlphaShell,
    ErrorBoundary: RouteError,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, loader: () => redirect('/web3/hacim') },
          { path: 'hacim', lazy: volumePage },
          { path: 'rsi', lazy: rsiPage },
          { path: 'fiyat-hacim', lazy: anomalyPage },
          { path: '*', loader: notFound },
        ],
      },
    ],
  },
])
