import * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, isAlive, types } from 'mobx-state-tree';
import {
    createContext,
    createInfiniteQueryMap,
    createQueryMap,
    createRootStore,
    HydrationBoundary,
    QueryClient,
    useInfiniteQuery,
    useQuery,
    useSuspenseInfiniteQuery,
    useSuspenseQuery,
} from '../src';
import type { DehydratedState } from '../src';
import { wait } from './utils';

const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanup();
    cleanups.splice(0).forEach((dispose) => dispose());
});

const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const fetchItem = vi.fn(async ({ id }: { id: string }) => ({ value: `item ${id}` }));
const fetchPage = vi.fn(async ({ id }: { id: string }, { offset }: { offset: number }) => ({
    value: `${id}@${offset}`,
}));

const ItemMap = createQueryMap('HydratedItemMap', {
    data: types.model({ value: types.string }),
    request: types.model({ id: types.string }),
    endpoint: ({ request }) => fetchItem(request),
});
const PageMap = createInfiniteQueryMap('HydratedPageMap', {
    data: types.model({ value: types.string }),
    request: types.model({ id: types.string }),
    pagination: types.model({ offset: types.number }),
    endpoint: ({ request, pagination }) => fetchPage(request, pagination),
});
const Root = createRootStore({
    items: types.optional(ItemMap, {}),
    pages: types.optional(PageMap, {}),
});

const createClient = () => {
    const client = new QueryClient({
        RootStore: Root,
        gcInterval: Infinity,
        queryOptions: { cacheTime: Infinity, retry: false },
    }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    return client;
};

const setupClient = (staleTime = 60_000) => {
    const client = new QueryClient({
        RootStore: Root,
        gcInterval: Infinity,
        queryOptions: { cacheTime: Infinity, staleTime, retry: false },
    }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    const { QueryClientProvider } = createContext(client);
    return {
        client,
        items: client.rootStore.items,
        render: (ui: React.ReactElement) => r(ui, { wrapper: QueryClientProvider as any }),
    };
};

const prefetchState = async (prefetch: (server: QueryClient<typeof Root>) => Promise<void>) => {
    const server = createClient();
    await prefetch(server);
    const state = server.dehydrate();
    fetchItem.mockClear();
    fetchPage.mockClear();
    return state;
};

afterEach(() => {
    fetchItem.mockClear();
    fetchPage.mockClear();
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
    state = { error: null as any };
    static getDerivedStateFromError(error: any) {
        return { error };
    }
    render() {
        return this.state.error ? <div>error: {this.state.error.message}</div> : this.props.children;
    }
}

test('prefetchQuery accepts a query map and dehydrate locates the entry by map path and key', async () => {
    const server = createClient();
    await server.prefetchQuery(server.rootStore.items, { request: { id: 'a' } });
    await server.prefetchQuery(server.rootStore.items, { request: { id: 'a' }, scope: 'side' });

    const entry = server.rootStore.items.get({ id: 'a' })!;
    expect(entry.data?.value).toBe('item a');
    expect(server.dehydrate().queries).toEqual([
        {
            path: '/items',
            key: server.rootStore.items.__getKey({ id: 'a' }),
            type: 'HydratedItemMapEntry',
            request: { id: 'a' },
            result: { value: 'item a' },
            cachedAt: expect.any(Number),
        },
        {
            path: '/items',
            key: server.rootStore.items.__getKey({ id: 'a' }, 'side'),
            type: 'HydratedItemMapEntry',
            request: { id: 'a' },
            result: { value: 'item a' },
            cachedAt: expect.any(Number),
        },
    ]);
});

test('hydrate creates missing map entries, including scoped and infinite ones', async () => {
    const state = await prefetchState(async (server) => {
        await server.prefetchQuery(server.rootStore.items, { request: { id: 'a' }, scope: 'side' });
        await server.prefetchQuery(server.rootStore.pages, {
            request: { id: 'p' },
            pagination: { offset: 20 },
        });
    });

    const client = createClient();
    client.hydrate(state);

    const { items, pages } = client.rootStore;
    expect(items.get({ id: 'a' })).toBeUndefined();
    const entry = items.get({ id: 'a' }, 'side')!;
    expect(entry.data?.value).toBe('item a');
    expect(entry.cachedAt?.getTime()).toBe(state.queries[0].cachedAt);
    const page = pages.get({ id: 'p' })!;
    expect(page.data?.value).toBe('p@20');
    expect(page.variables.pagination?.offset).toBe(20);
    expect(fetchItem).not.toHaveBeenCalled();
    expect(fetchPage).not.toHaveBeenCalled();
});

test('HydrationBoundary renders a map entry during the first render without fetching', async () => {
    const state = await prefetchState((server) =>
        server.prefetchQuery(server.rootStore.items, { request: { id: 'a' } }),
    );
    const { items, render } = setupClient();

    const renders: (string | undefined)[] = [];
    const Item = observer(() => {
        const { data } = useQuery(items, { request: { id: 'a' } });
        renders.push(data?.value);
        return <div>{data?.value}</div>;
    });

    const { getByText } = render(
        <HydrationBoundary state={state}>
            <Item />
        </HydrationBoundary>,
    );
    expect(renders[0]).toBe('item a');
    getByText('item a');
    await act(() => wait(0));
    expect(fetchItem).not.toHaveBeenCalled();
});

test('HydrationBoundary streams a pending map entry into useInfiniteQuery', async () => {
    const deferred = createDeferred<any>();
    const state = await prefetchState(async (server) => {
        fetchPage.mockReturnValueOnce(deferred.promise);
        server.prefetchQuery(server.rootStore.pages, {
            request: { id: 'p' },
            pagination: { offset: 0 },
        });
    });
    expect(state.queries[0].promise).toBeInstanceOf(Promise);
    const { client, render } = setupClient();

    const Page = observer(() => {
        const { data, isLoading } = useInfiniteQuery(client.rootStore.pages, {
            request: { id: 'p' },
            pagination: { offset: 0 },
        });
        return <div>{isLoading ? 'loading' : data?.value}</div>;
    });
    const { getByText, findByText } = render(
        <HydrationBoundary state={state}>
            <Page />
        </HydrationBoundary>,
    );
    getByText('loading');

    await act(async () => deferred.resolve({ value: 'streamed' }));
    await findByText('streamed');
    expect(fetchPage).not.toHaveBeenCalled();
});

test('hydrate warns about map entries whose map or key does not match', async () => {
    const state = await prefetchState((server) =>
        server.prefetchQuery(server.rootStore.items, { request: { id: 'a' } }),
    );
    const [entry] = state.queries;
    const mismatched: DehydratedState = {
        dehydratedAt: state.dehydratedAt,
        queries: [
            { ...entry, path: '/pages' },
            { ...entry, type: 'OtherEntry' },
            { ...entry, request: { id: 'b' } },
        ],
    };

    const client = createClient();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => client.hydrate(mismatched)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
    expect(client.rootStore.items.entries.size).toBe(0);
    expect(client.rootStore.pages.entries.size).toBe(0);
});

test('useSuspenseQuery suspends on a streamed map entry and renders when it resolves', async () => {
    const deferred = createDeferred<any>();
    const state = await prefetchState(async (server) => {
        fetchItem.mockReturnValueOnce(deferred.promise);
        server.prefetchQuery(server.rootStore.items, { request: { id: 'a' } });
    });
    const { items, render } = setupClient();

    const Item = observer(() => {
        const { data } = useSuspenseQuery(items, { request: { id: 'a' } });
        return <div>{data.value}</div>;
    });
    const { getByText, findByText } = render(
        <HydrationBoundary state={state}>
            <React.Suspense fallback={<div>loading</div>}>
                <Item />
            </React.Suspense>
        </HydrationBoundary>,
    );
    getByText('loading');

    await act(async () => deferred.resolve({ value: 'streamed' }));
    await findByText('streamed');
    await act(() => wait(0));
    expect(fetchItem).not.toHaveBeenCalled();
});

test('useSuspenseInfiniteQuery suspends on a streamed infinite map entry', async () => {
    const deferred = createDeferred<any>();
    const state = await prefetchState(async (server) => {
        fetchPage.mockReturnValueOnce(deferred.promise);
        server.prefetchQuery(server.rootStore.pages, {
            request: { id: 'p' },
            pagination: { offset: 0 },
        });
    });
    const { client, render } = setupClient();

    const Page = observer(() => {
        const { data } = useSuspenseInfiniteQuery(client.rootStore.pages, {
            request: { id: 'p' },
            pagination: { offset: 0 },
        });
        return <div>{data.value}</div>;
    });
    const { getByText, findByText } = render(
        <HydrationBoundary state={state}>
            <React.Suspense fallback={<div>loading</div>}>
                <Page />
            </React.Suspense>
        </HydrationBoundary>,
    );
    getByText('loading');

    await act(async () => deferred.resolve({ value: 'streamed' }));
    await findByText('streamed');
    expect(fetchPage).not.toHaveBeenCalled();
});

test('useSuspenseQuery fetches map entries that were not prefetched, one per request', async () => {
    const { items, render } = setupClient();
    const a = createDeferred<any>();
    const b = createDeferred<any>();
    fetchItem.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const Item = observer(({ id }: { id: string }) => {
        const { data, query } = useSuspenseQuery(items, { request: { id } });
        expect(query).toBe(items.get({ id }));
        return <div>{data.value}</div>;
    });
    const { getByText, findByText } = render(
        <>
            <React.Suspense fallback={<div>loading a</div>}>
                <Item id="a" />
            </React.Suspense>
            <React.Suspense fallback={<div>loading b</div>}>
                <Item id="b" />
            </React.Suspense>
        </>,
    );
    getByText('loading a');
    getByText('loading b');
    await act(() => wait(0));
    expect(fetchItem).toHaveBeenCalledTimes(2);

    await act(async () => b.resolve({ value: 'B' }));
    await findByText('B');
    getByText('loading a');

    await act(async () => a.resolve({ value: 'A' }));
    await findByText('A');
    expect(fetchItem).toHaveBeenCalledTimes(2);
});

test('useSuspenseQuery accepts a map entry directly', async () => {
    const { items, render } = setupClient();
    const entry = items.getOrCreate({ request: { id: 'a' } });

    const Item = observer(() => {
        const { data } = useSuspenseQuery(entry);
        return <div>{data.value}</div>;
    });
    const { getByText, findByText } = render(
        <React.Suspense fallback={<div>loading</div>}>
            <Item />
        </React.Suspense>,
    );
    getByText('loading');
    await findByText('item a');
    expect(fetchItem).toHaveBeenCalledTimes(1);
    expect(fetchItem).toHaveBeenCalledWith({ id: 'a' });
});

test('useSuspenseQuery throws map entry errors to the error boundary', async () => {
    const { items, render } = setupClient();
    fetchItem.mockRejectedValueOnce(new Error('Failed'));

    const Item = observer(() => {
        const { data } = useSuspenseQuery(items, { request: { id: 'a' } });
        return <div>{data.value}</div>;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { findByText } = render(
        <ErrorBoundary>
            <React.Suspense fallback={<div>loading</div>}>
                <Item />
            </React.Suspense>
        </ErrorBoundary>,
    );
    await findByText('error: Failed');
    consoleError.mockRestore();
    expect(fetchItem).toHaveBeenCalledTimes(1);
});

test('a disabled map entry seeded with fresh initialData does not fetch when enabled', async () => {
    const { items, render } = setupClient(Infinity);

    const Item = observer(({ enabled }: { enabled: boolean }) => {
        const { data } = useQuery(items, {
            request: { id: 'a' },
            initialData: { value: 'initial' },
            enabled,
        });
        return <div>{data?.value}</div>;
    });
    const { getByText, rerender } = render(<Item enabled={false} />);
    await act(() => wait(0));
    getByText('initial');

    rerender(<Item enabled />);
    await act(() => wait(0));
    getByText('initial');
    expect(fetchItem).not.toHaveBeenCalled();
});
