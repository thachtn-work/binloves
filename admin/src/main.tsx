import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import './styles.css';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      /*
        Every save now writes its result into the cache itself (`lib/cache.ts`),
        so what is held here is as current as what the API would answer. Ten
        seconds meant the edit panel refetched the whole catalogue and the whole
        media library each time it was opened a moment after the last one —
        paying for lists the browser already had and that nothing had changed.
        One admin, one owner, no second writer: a minute is the honest number.
      */
      staleTime: 60_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
