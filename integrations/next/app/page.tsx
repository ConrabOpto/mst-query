import { Suspense } from 'react';
import { HydrationBoundary, QueryClient } from 'mst-query';
import { AdminRootStore, RootStore } from './models';
import { Item } from './item';
import { AdminHydrationBoundary, AdminItem, AdminProviders } from './admin';

async function fetchItem(id: string) {
    await new Promise((resolve) => setTimeout(resolve, id === 'streamed' ? 200 : 0));
    return { id, description: `Item ${id}`, createdAt: new Date('2024-01-01T00:00:00.000Z') };
}

export default async function Page() {
    const queryClient = new QueryClient({ RootStore }).init();
    const { itemStore } = queryClient.rootStore;

    await queryClient.prefetchQuery(itemStore.awaitedItemQuery, {
        request: { id: 'awaited' },
        meta: { fetchItem },
    });
    queryClient.prefetchQuery(itemStore.streamedItemQuery, {
        request: { id: 'streamed' },
        meta: { fetchItem },
    });

    const adminQueryClient = new QueryClient({ RootStore: AdminRootStore }).init();
    adminQueryClient.prefetchQuery(adminQueryClient.rootStore.adminStore.adminItemQuery, {
        request: { id: 'admin' },
        meta: { fetchItem },
    });

    return (
        <main>
            <HydrationBoundary state={queryClient.dehydrate()}>
                <Item id="awaited" />
                <Suspense fallback={<p>Loading streamed item...</p>}>
                    <Item id="streamed" />
                </Suspense>
            </HydrationBoundary>
            <AdminProviders>
                <AdminHydrationBoundary state={adminQueryClient.dehydrate()}>
                    <Suspense fallback={<p>Loading admin item...</p>}>
                        <AdminItem />
                    </Suspense>
                </AdminHydrationBoundary>
            </AdminProviders>
        </main>
    );
}
