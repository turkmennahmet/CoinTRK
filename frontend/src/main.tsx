import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { ApiError } from './api/client'
import { router } from './app/router'
import { SectionTransition } from './app/SectionTransition'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      // Client errors and region blocks will not fix themselves; transient upstream errors might.
      retry: (failureCount, error) =>
        failureCount < 2 && (!(error instanceof ApiError) || error.isTransient || error.status === 0),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <SectionTransition />
    </QueryClientProvider>
  </StrictMode>,
)
