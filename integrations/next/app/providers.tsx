'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, createContext } from 'mst-query';
import { RootStore } from './models';

const makeQueryClient = () =>
    new QueryClient({ RootStore, queryOptions: { staleTime: 60_000 } });

let browserQueryClient: QueryClient<typeof RootStore> | undefined;

function getQueryClient() {
    if (typeof window === 'undefined') {
        return makeQueryClient();
    }
    return (browserQueryClient ??= makeQueryClient());
}

export const { QueryClientProvider, useRootStore } = createContext(makeQueryClient());

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(getQueryClient);
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
