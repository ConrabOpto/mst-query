'use client';
import * as React from 'react';
import type { DehydratedState, QueryClient } from './QueryClient';
import { Context } from './context';

type HydrationBoundaryProps = {
    state?: DehydratedState | null;
    children?: React.ReactNode;
};

export function createHydrationBoundary(context: React.Context<QueryClient<any> | undefined>) {
    return function HydrationBoundary({ state, children }: HydrationBoundaryProps) {
        const queryClient = React.useContext(context);
        if (!queryClient) {
            throw new Error('No QueryClient set, use QueryClientProvider to set one');
        }

        // Unobserved queries hydrate during render so children can read them right away.
        // Observed queries wait for an effect to avoid updating other components mid-render.
        const deferred = React.useMemo(
            () => (state ? queryClient.hydrate(state, { deferObserved: true }) : []),
            [queryClient, state],
        );

        React.useEffect(() => {
            if (state && deferred.length > 0) {
                queryClient.hydrate({ ...state, queries: deferred });
            }
        }, [queryClient, state, deferred]);

        return <>{children}</>;
    };
}

export const HydrationBoundary = createHydrationBoundary(Context);
