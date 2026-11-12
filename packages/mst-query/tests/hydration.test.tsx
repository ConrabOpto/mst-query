import * as React from 'react';
import { test, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { observer } from 'mobx-react';
import { QueryClient, DehydratedState } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';
import { HydrationBoundary } from '../src/HydrationBoundary';
import { useQuery, useSuspenseQuery } from '../src/hooks';
import { Root } from './models/RootStore';
import { itemData } from './api/data';
import { wait } from './utils';

afterEach(() => {
    cleanup();
});

const createServerClient = () => new QueryClient({ RootStore: Root }).init();

const setupClient = (queryOptions: any = {}) => {
    const queryClient = new QueryClient({ RootStore: Root, queryOptions }).init();
    const { QueryClientProvider } = createContext(queryClient);
    return {
        queryClient,
        q: queryClient.rootStore.serviceStore.itemServiceStore,
        render: (ui: React.ReactElement) => render(ui, { wrapper: QueryClientProvider as any }),
    };
};

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: any }
> {
    state = { error: null as any };
    static getDerivedStateFromError(error: any) {
        return { error };
    }
    render() {
        return this.state.error ? <div>error: {this.state.error.message}</div> : this.props.children;
    }
}

test('dehydrate includes resolved prefetched queries as results', async () => {
    const server = createServerClient();
    const q = server.rootStore.serviceStore.itemServiceStore;

    await server.prefetchQuery(q.itemQuery, { request: { id: 'test' } });
    const state = server.dehydrate();

    expect(state.queries).toEqual([
        {
            path: '/serviceStore/itemServiceStore/itemQuery',
            type: 'ItemQuery',
            request: { id: 'test' },
            result: itemData,
            cachedAt: expect.any(Number),
        },
    ]);
    expect(q.itemQuery.data?.description).toBe(itemData.description);
});

test('dehydrate includes pending prefetched queries as promises', async () => {
    const server = createServerClient();
    const q = server.rootStore.serviceStore.itemServiceStore;
    const deferred = createDeferred<any>();

    server.prefetchQuery(q.itemQuery, {
        request: { id: 'test' },
        meta: { getItem: () => deferred.promise },
    });
    const state = server.dehydrate();

    expect(state.queries).toHaveLength(1);
    expect(state.queries[0].promise).toBeInstanceOf(Promise);
    expect(state.queries[0].result).toBeUndefined();

    deferred.resolve(itemData);
    await expect(state.queries[0].promise).resolves.toEqual(itemData);
});

test('dehydrate skips queries not started by prefetchQuery and failed prefetches', async () => {
    const server = createServerClient();
    const q = server.rootStore.serviceStore.itemServiceStore;

    await q.itemQuery.query({ request: { id: 'test' } });
    await server.prefetchQuery(q.itemQuery2, {
        request: { id: 'test' },
        meta: {
            getItem: () => Promise.reject(new Error('Failed')),
        },
    });

    expect(server.dehydrate().queries).toEqual([]);
});

test('prefetchQuery never rejects', async () => {
    const server = createServerClient();
    const q = server.rootStore.serviceStore.itemServiceStore;

    await expect(
        server.prefetchQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem: () => Promise.reject(new Error('Failed')) },
        }),
    ).resolves.toBeUndefined();
    expect(q.itemQuery.error?.message).toBe('Failed');
});

test('HydrationBoundary hydrates results during the first render without fetching', async () => {
    const server = createServerClient();
    await server.prefetchQuery(server.rootStore.serviceStore.itemServiceStore.itemQuery, {
        request: { id: 'test' },
    });
    const state = server.dehydrate();

    const { q, queryClient, render } = setupClient({ staleTime: 60_000 });
    const getItem = vi.fn();

    const renders: (string | undefined)[] = [];
    const Item = observer(() => {
        const { data } = useQuery(q.itemQuery, { request: { id: 'test' }, meta: { getItem } });
        renders.push(data?.description);
        return <div>{data?.description}</div>;
    });

    const { getByText } = render(
        <HydrationBoundary state={state}>
            <Item />
        </HydrationBoundary>,
    );

    expect(renders[0]).toBe(itemData.description);
    getByText(itemData.description);
    expect(queryClient.rootStore.itemStore.models.get('test')).toBe(q.itemQuery.data);
    expect(q.itemQuery.__MstQueryHandler.cachedAt?.getTime()).toBe(state.queries[0].cachedAt);

    await wait(0);
    expect(getItem).not.toHaveBeenCalled();
});

test('useSuspenseQuery suspends on a streamed promise and renders when it resolves', async () => {
    const server = createServerClient();
    const deferred = createDeferred<any>();
    server.prefetchQuery(server.rootStore.serviceStore.itemServiceStore.itemQuery, {
        request: { id: 'test' },
        meta: { getItem: () => deferred.promise },
    });
    const state = server.dehydrate();

    const { q, render } = setupClient();
    const getItem = vi.fn();

    const Item = observer(() => {
        const { data } = useSuspenseQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem },
        });
        return <div>{data.description}</div>;
    });

    const { getByText, findByText } = render(
        <HydrationBoundary state={state}>
            <React.Suspense fallback={<div>loading</div>}>
                <Item />
            </React.Suspense>
        </HydrationBoundary>,
    );

    getByText('loading');
    expect(q.itemQuery.isLoading).toBe(true);

    await act(async () => {
        deferred.resolve(itemData);
    });

    await findByText(itemData.description);
    await wait(0);
    expect(getItem).not.toHaveBeenCalled();
    expect(q.itemQuery.isLoading).toBe(false);
});

test('hydrate adopts thenables whose then does not return a promise', async () => {
    const { q, queryClient } = setupClient();
    let resolve!: (value: any) => void;
    // Mimics a promise deserialized by React from a server component payload
    const thenable = {
        then(onFulfilled: (value: any) => void) {
            resolve = onFulfilled;
        },
    };

    queryClient.hydrate({
        dehydratedAt: Date.now(),
        queries: [
            {
                path: '/serviceStore/itemServiceStore/itemQuery',
                type: 'ItemQuery',
                request: { id: 'test' },
                promise: thenable,
            },
        ],
    });
    expect(q.itemQuery.isLoading).toBe(true);

    await wait(0);
    resolve(itemData);
    await q.itemQuery.__MstQueryHandler.promise;
    expect(q.itemQuery.data?.description).toBe(itemData.description);
});

test('a rejected streamed promise is thrown to the error boundary', async () => {
    const server = createServerClient();
    const deferred = createDeferred<any>();
    server.prefetchQuery(server.rootStore.serviceStore.itemServiceStore.itemQuery, {
        request: { id: 'test' },
        meta: { getItem: () => deferred.promise },
    });
    const state = server.dehydrate();

    const { q, render } = setupClient();

    const Item = observer(() => {
        const { data } = useSuspenseQuery(q.itemQuery, { request: { id: 'test' } });
        return <div>{data.description}</div>;
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { findByText } = render(
        <HydrationBoundary state={state}>
            <ErrorBoundary>
                <React.Suspense fallback={<div>loading</div>}>
                    <Item />
                </React.Suspense>
            </ErrorBoundary>
        </HydrationBoundary>,
    );

    await act(async () => {
        deferred.reject(new Error('Server failed'));
    });

    await findByText('error: Server failed');
    consoleError.mockRestore();
});

test('useSuspenseQuery fetches and suspends when nothing was prefetched', async () => {
    const { q, render } = setupClient();
    const deferred = createDeferred<any>();
    const getItem = vi.fn(() => deferred.promise);

    const Item = observer(() => {
        const { data } = useSuspenseQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem },
        });
        return <div>{data.description}</div>;
    });

    const { getByText, findByText } = render(
        <React.Suspense fallback={<div>loading</div>}>
            <Item />
        </React.Suspense>,
    );

    getByText('loading');
    await act(async () => {
        deferred.resolve(itemData);
    });
    await findByText(itemData.description);
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);
});

test('useSuspenseQuery suspends again when the request changes', async () => {
    const { q, render } = setupClient();
    const getItem = vi.fn(async ({ request }: any) => {
        await wait(10);
        return { ...itemData, id: request.id, description: `item ${request.id}` };
    });

    const Item = observer(({ id }: { id: string }) => {
        const { data } = useSuspenseQuery(q.itemQuery, { request: { id }, meta: { getItem } });
        return <div>{data.description}</div>;
    });

    const { findByText, getByText, rerender } = render(
        <React.Suspense fallback={<div>loading</div>}>
            <Item id="a" />
        </React.Suspense>,
    );
    await findByText('item a');

    rerender(
        <React.Suspense fallback={<div>loading</div>}>
            <Item id="b" />
        </React.Suspense>,
    );
    getByText('loading');
    await findByText('item b');
    expect(getItem).toHaveBeenCalledTimes(2);
});

test('hydrate does not overwrite newer client data', async () => {
    const server = createServerClient();
    await server.prefetchQuery(server.rootStore.serviceStore.itemServiceStore.itemQuery, {
        request: { id: 'test' },
    });
    const state = server.dehydrate();

    const { q, queryClient } = setupClient();
    await wait(1);
    await q.itemQuery.query({
        request: { id: 'test' },
        meta: { getItem: async () => ({ ...itemData, description: 'Newer' }) },
    });

    queryClient.hydrate(state);
    expect(q.itemQuery.data?.description).toBe('Newer');
});

test('hydrate ignores paths that do not resolve to a query of the same type', () => {
    const { queryClient } = setupClient();
    const state: DehydratedState = {
        dehydratedAt: Date.now(),
        queries: [
            { path: '/serviceStore/itemServiceStore/missing', type: 'ItemQuery', result: itemData },
            { path: '/serviceStore/itemServiceStore/listQuery', type: 'ItemQuery', result: itemData },
        ],
    };

    expect(() => queryClient.hydrate(state)).not.toThrow();
    expect(queryClient.rootStore.itemStore.models.size).toBe(0);
});

test('HydrationBoundary defers hydrating observed queries to an effect', async () => {
    const server = createServerClient();
    await server.prefetchQuery(server.rootStore.serviceStore.itemServiceStore.itemQuery, {
        request: { id: 'test' },
    });
    const state = server.dehydrate();

    const { q, render } = setupClient({ staleTime: 60_000 });
    const hydratedDuringRender: boolean[] = [];

    const Observer = observer(() => {
        useQuery(q.itemQuery, { enabled: false });
        return null;
    });
    const Probe = () => {
        hydratedDuringRender.push(q.itemQuery.data != null);
        return null;
    };

    const { rerender } = render(<Observer />);
    rerender(
        <>
            <Observer />
            <HydrationBoundary state={state}>
                <Probe />
            </HydrationBoundary>
        </>,
    );

    expect(hydratedDuringRender[0]).toBe(false);
    await wait(0);
    expect(q.itemQuery.data?.description).toBe(itemData.description);
});
