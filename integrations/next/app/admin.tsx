'use client';
import { createContext as createReactContext, useState, type ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { QueryClient, createContext, useSuspenseQuery } from 'mst-query';
import { AdminRootStore } from './models';

const makeAdminQueryClient = () =>
    new QueryClient({ RootStore: AdminRootStore, queryOptions: { staleTime: 60_000 } });

let browserAdminQueryClient: QueryClient<typeof AdminRootStore> | undefined;

function getAdminQueryClient() {
    if (typeof window === 'undefined') {
        return makeAdminQueryClient();
    }
    return (browserAdminQueryClient ??= makeAdminQueryClient());
}

const AdminQueryContext = createReactContext<QueryClient<any> | undefined>(undefined);

export const {
    QueryClientProvider: AdminQueryClientProvider,
    HydrationBoundary: AdminHydrationBoundary,
    useRootStore: useAdminRootStore,
} = createContext(makeAdminQueryClient(), { context: AdminQueryContext });

export function AdminProviders({ children }: { children: ReactNode }) {
    const [queryClient] = useState(getAdminQueryClient);
    return <AdminQueryClientProvider client={queryClient}>{children}</AdminQueryClientProvider>;
}

export const AdminItem = observer(() => {
    const { adminStore } = useAdminRootStore();
    const { data } = useSuspenseQuery(adminStore.adminItemQuery, { request: { id: 'admin' } });
    return (
        <p>
            {data.description} created {data.createdAt.toISOString()}
        </p>
    );
});
