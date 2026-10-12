'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { makeQueryClient } from '../lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  // useState keeps one client per browser session instead of one per render.
  const [queryClient] = useState(makeQueryClient);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
