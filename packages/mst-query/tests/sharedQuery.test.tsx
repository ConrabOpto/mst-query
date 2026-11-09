import { act, cleanup, renderHook } from '@testing-library/react';
import { destroy, flow, getSnapshot, isAlive, types } from 'mobx-state-tree';
import { afterEach, expect, test, vi } from 'vitest';
import {
    createContext,
    createInfiniteQueryMap,
    createQueryMap,
    createRootStore,
    QueryClient,
    useInfiniteQuery,
    useQuery,
} from '../src';

const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanup();
    cleanups.splice(0).forEach((dispose) => dispose());
    vi.clearAllTimers();
    vi.useRealTimers();
});
const pending = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};
const settle = () => act(async () => {});
const setup = (cacheTime = Infinity) => {
    const fetch = vi.fn(async ({ id }: { id: string }) => ({ value: id }));
    const Query = createQueryMap('SharedQuery', {
        data: types.model({ value: types.string }),
        request: types.model({ id: types.string, format: types.optional(types.string, 'full') }),
        endpoint: ({ request }) => fetch(request),
    });
    const Root = createRootStore({
        query: types.optional(Query, {}),
        selectedId: '',
        selectedValue: '',
    }).actions((self) => ({
        select: flow(function* (id: string) {
            self.selectedId = id;
            const { data, error } = yield self.query.refetch({ request: { id } });
            if (error) throw error;
            self.selectedValue = data.value;
            return data;
        }),
    }));
    const client = new QueryClient({
        RootStore: Root,
        gcInterval: Infinity,
        queryOptions: { cacheTime },
    }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    const { QueryClientProvider: wrapper } = createContext(client);
    return { client, query: client.rootStore.query, wrapper, fetch, Query };
};

test('equal request values share an entry, including defaults and property order', async () => {
    const { query } = setup();
    const a = await query.query({ request: { id: 'a' } });
    expect(query.get({ format: 'full', id: 'a' })).toBe(a.query);
    const b = await query.query({ request: { id: 'b' } });
    expect(a.query).not.toBe(b.query);
    expect(a.query.data!.value).toBe('a');
    expect(b.query.data!.value).toBe('b');
    expect(query.entries.size).toBe(2);
});
test('an MST action updates state, awaits the collection fetch and uses its result', async () => {
    const { client, query } = setup();
    const data = await client.rootStore.select('a');
    expect(client.rootStore.selectedId).toBe('a');
    expect(client.rootStore.selectedValue).toBe('a');
    expect(data).toBe(query.get({ id: 'a' })!.data);
});
test('concurrent imperative callers share one fetch and one applied result', async () => {
    const { query, fetch } = setup();
    const response = pending<{ value: string }>();
    fetch.mockReturnValue(response.promise);
    const a = query.query({ request: { id: 'a' } });
    const b = query.refetch({ request: { id: 'a' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    response.resolve({ value: 'Result' });
    const [first, second] = await Promise.all([a, b]);
    expect(first.query).toBe(second.query);
    expect(first.data).toBe(second.data);
});

test('query maps remain opt-in and their entries support direct shared hooks and global lookup', async () => {
    const { query, Query, client, wrapper } = setup();
    const response = await query.query({ request: { id: 'a' } });
    const hook = renderHook(
        () => [
            useQuery(response.query, { enabled: false }),
            useQuery(response.query, { enabled: false }),
        ],
        { wrapper },
    );
    expect(hook.result.current[0].query).toBe(response.query);
    expect(hook.result.current[1].query).toBe(response.query);
    expect(client.rootStore.getQueries(Query)).toEqual([response.query]);
    hook.unmount();
});
test('an entry cannot be redirected to another request', async () => {
    const { query } = setup();
    const { query: entry } = await query.query({ request: { id: 'a' } });
    await expect(entry.refetch({ request: { id: 'b' } })).rejects.toThrow('fixed request');
    expect(entry.variables.request!.id).toBe('a');
});
test.each([false, true])(
    'matching hooks share an entry and fetch (strictMode=%s)',
    async (reactStrictMode) => {
        const { query, wrapper, fetch } = setup();
        const response = pending<{ value: string }>();
        fetch.mockReturnValue(response.promise);
        const hook = renderHook(
            () => [
                useQuery(query, { request: { id: 'a' } }),
                useQuery(query, { request: { id: 'a' } }),
            ],
            { wrapper, reactStrictMode },
        );
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(hook.result.current[0].query).toBe(hook.result.current[1].query);
        await act(async () => {
            response.resolve({ value: 'Fetched' });
        });
        hook.rerender();
        expect(hook.result.current[0].data!.value).toBe('Fetched');
        expect(hook.result.current[1].data!.value).toBe('Fetched');
    },
);
test('changing one hook switches entries without changing another hook or fetching back', async () => {
    const { query, wrapper, fetch } = setup();
    const hook = renderHook(
        ({ id }) => [
            useQuery(query, { request: { id } }),
            useQuery(query, { request: { id: 'a' } }),
        ],
        { wrapper, initialProps: { id: 'a' } },
    );
    await settle();
    hook.rerender({ id: 'b' });
    await settle();
    hook.rerender({ id: 'b' });
    expect(hook.result.current[0].data!.value).toBe('b');
    expect(hook.result.current[1].data!.value).toBe('a');
    expect(fetch).toHaveBeenCalledTimes(2);
});
test('a disabled observer reads results fetched by an enabled observer', async () => {
    const { query, wrapper, fetch } = setup();
    const hook = renderHook(
        () => [
            useQuery(query, { request: { id: 'a' }, enabled: false }),
            useQuery(query, { request: { id: 'a' } }),
        ],
        { wrapper },
    );
    await settle();
    hook.rerender();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(hook.result.current[0].data!.value).toBe('a');
});
test('unmounting one observer leaves a shared request running for the other', async () => {
    const { query, wrapper, fetch } = setup();
    const response = pending<{ value: string }>();
    fetch.mockReturnValue(response.promise);
    const first = renderHook(() => useQuery(query, { request: { id: 'a' } }), { wrapper });
    const second = renderHook(() => useQuery(query, { request: { id: 'a' } }), { wrapper });
    first.unmount();
    expect(second.result.current.query!.__MstQueryHandler.abortController!.signal.aborted).toBe(
        false,
    );
    await act(async () => {
        response.resolve({ value: 'Done' });
    });
    second.rerender();
    expect(second.result.current.data!.value).toBe('Done');
    expect(fetch).toHaveBeenCalledTimes(1);
});
test('placeholders belong to observers and never overwrite shared entry data', () => {
    const { query, wrapper, fetch } = setup();
    fetch.mockReturnValue(new Promise(() => {}));
    const hook = renderHook(
        () => [
            useQuery(query, { request: { id: 'a' }, placeholderData: { value: 'First' } }),
            useQuery(query, { request: { id: 'a' }, placeholderData: { value: 'Second' } }),
        ],
        { wrapper },
    );
    expect(hook.result.current[0].data!.value).toBe('First');
    expect(hook.result.current[1].data!.value).toBe('Second');
    expect(query.get({ id: 'a' })!.data).toBeNull();
});
test('initial data seeds a shared entry only once', async () => {
    const { query, wrapper, fetch } = setup();
    const hook = renderHook(
        () => [
            useQuery(query, {
                request: { id: 'a' },
                initialData: { value: 'First' },
                staleTime: Infinity,
            }),
            useQuery(query, {
                request: { id: 'a' },
                initialData: { value: 'Second' },
                staleTime: Infinity,
            }),
        ],
        { wrapper },
    );
    await settle();
    expect(query.get({ id: 'a' })!.data!.value).toBe('First');
    expect(fetch).not.toHaveBeenCalled();
    expect(hook.result.current[1].data!.value).toBe('First');
});
test('invalidation targets one request or all entries, fetching only enabled observed entries', async () => {
    const { query, wrapper, fetch } = setup();
    renderHook(
        () => [
            useQuery(query, { request: { id: 'a' } }),
            useQuery(query, { request: { id: 'a' } }),
            useQuery(query, { request: { id: 'b' }, enabled: false }),
        ],
        { wrapper },
    );
    await settle();
    await act(async () => {
        query.invalidate({ request: { id: 'b' } });
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(query.get({ id: 'b' })!.__MstQueryHandler.markedAsStale).toBe(true);
    await act(async () => {
        query.invalidate();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
});
test('unused entries expire while mounted entries remain until unmount', async () => {
    vi.useFakeTimers();
    const { query, wrapper } = setup(100);
    const a = await query.query({ request: { id: 'a' } });
    const hook = renderHook(() => useQuery(query, { request: { id: 'b' } }), { wrapper });
    await settle();
    await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
    });
    expect(isAlive(a.query)).toBe(false);
    expect(query.get({ id: 'a' })).toBeUndefined();
    expect(query.get({ id: 'b' })).toBeDefined();
    hook.unmount();
    await vi.advanceTimersByTimeAsync(100);
    expect(query.entries.size).toBe(0);
});
test('collection instances and explicit scopes isolate equal requests', async () => {
    const first = setup();
    const second = setup();
    const a = await first.query.query({ request: { id: 'a' } });
    const b = await second.query.query({ request: { id: 'a' } });
    const c = await first.query.query({ request: { id: 'a' }, scope: 'other' });
    expect(a.query).not.toBe(b.query);
    expect(a.query).not.toBe(c.query);
});
test('infinite observers share pages and hook props cannot rewind pagination', async () => {
    const fetch = vi.fn(async ({ pagination }) => [pagination.offset]);
    const Query = createInfiniteQueryMap('SharedPages', {
        data: types.frozen<number[]>(),
        request: types.model({ folder: types.string }),
        pagination: types.model({ offset: 0 }),
        endpoint: fetch,
        onQueryMore({ query, data }) {
            query.setData([...(query.data ?? []), ...data]);
        },
    });
    const Root = createRootStore({ query: types.optional(Query, {}) });
    const client = new QueryClient({
        RootStore: Root,
        queryOptions: { cacheTime: Infinity },
    }).init();
    cleanups.push(() => destroy(client.rootStore));
    const { QueryClientProvider: wrapper } = createContext(client);
    const hook = renderHook(
        ({ offset }) => [
            useInfiniteQuery(client.rootStore.query, {
                request: { folder: 'a' },
                pagination: { offset: 0 },
            }),
            useInfiniteQuery(client.rootStore.query, {
                request: { folder: 'a' },
                pagination: { offset },
            }),
        ],
        { wrapper, initialProps: { offset: 20 } },
    );
    await settle();
    await act(async () => {
        await hook.result.current[0].queryMore({ pagination: { offset: 10 } });
    });
    hook.rerender({ offset: 0 });
    expect(hook.result.current[0].query).toBe(hook.result.current[1].query);
    expect(hook.result.current[0].data).toEqual([0, 10]);
    expect(getSnapshot(hook.result.current[0].query!.variables.pagination!)).toEqual({
        offset: 10,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('an abandoned render never creates an entry or starts a request', () => {
    const { query, fetch, wrapper } = setup();
    expect(() =>
        renderHook(
            () => {
                useQuery(query, { request: { id: 'a' } });
                throw new Error('Abandoned render');
            },
            { wrapper },
        ),
    ).toThrow('Abandoned render');
    expect(query.entries.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
});

test('invalidation during an existing fetch schedules one fresh request afterwards', async () => {
    const { query, fetch, wrapper } = setup();
    const response = pending<{ value: string }>();
    fetch.mockReturnValueOnce(response.promise);
    renderHook(() => useQuery(query, { request: { id: 'a' } }), { wrapper });
    act(() => {
        query.invalidate();
        query.invalidate();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
        response.resolve({ value: 'Before invalidation' });
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(query.get({ id: 'a' })!.data!.value).toBe('a');
    expect(query.get({ id: 'a' })!.__MstQueryHandler.markedAsStale).toBe(false);
});

test('two focus observers trigger one fetch using an eligible observer policy', async () => {
    const { query, fetch, wrapper } = setup();
    renderHook(
        () => [
            useQuery(query, { request: { id: 'a' }, refetchOnWindowFocus: false }),
            useQuery(query, { request: { id: 'a' }, refetchOnWindowFocus: 'always' }),
            useQuery(query, { request: { id: 'a' }, refetchOnWindowFocus: 'always' }),
        ],
        { wrapper },
    );
    await settle();
    await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('inactive expiry waits for a slow request and begins on completion', async () => {
    vi.useFakeTimers();
    const { query, fetch } = setup(100);
    const response = pending<{ value: string }>();
    fetch.mockReturnValue(response.promise);
    const execution = query.query({ request: { id: 'a' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(query.get({ id: 'a' })).toBeDefined();
    response.resolve({ value: 'Done' });
    await execution;
    await vi.advanceTimersByTimeAsync(99);
    expect(query.get({ id: 'a' })).toBeDefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(query.get({ id: 'a' })).toBeUndefined();
});

test('the longest observer retention applies and a remount cancels pending expiry', async () => {
    vi.useFakeTimers();
    const { query, wrapper } = setup(10);
    const first = renderHook(() => useQuery(query, { request: { id: 'a' }, cacheTime: 100 }), {
        wrapper,
    });
    const second = renderHook(() => useQuery(query, { request: { id: 'a' }, cacheTime: 200 }), {
        wrapper,
    });
    await settle();
    first.unmount();
    second.unmount();
    await vi.advanceTimersByTimeAsync(199);
    const third = renderHook(() => useQuery(query, { request: { id: 'a' }, staleTime: Infinity }), {
        wrapper,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(query.entries.size).toBe(1);
    third.unmount();
    await vi.advanceTimersByTimeAsync(199);
    expect(query.entries.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(query.entries.size).toBe(0);
});

test('requestless calls use the default entry instead of an arbitrary previous request', async () => {
    const Query = createQueryMap('OptionalIdentity', {
        data: types.frozen<string>(),
        request: types.maybe(types.model({ id: types.string })),
        endpoint: async ({ request }) => request?.id ?? 'default',
    });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
    }).init();
    cleanups.push(() => destroy(client.rootStore));
    const named = await client.rootStore.query.query({ request: { id: 'a' } });
    const unnamed = await client.rootStore.query.query();
    expect(unnamed.data).toBe('default');
    expect(unnamed.query).not.toBe(named.query);
    expect(client.rootStore.query.get()).toBe(unnamed.query);
});

test('custom request keys receive normalized requests and keep entry requests fixed', async () => {
    const Query = createQueryMap('CustomIdentity', {
        request: types.model({ id: types.string, locale: 'en' }),
        requestKey: ({ id, locale }) => [id.toLowerCase(), locale],
        endpoint: async ({ request }) => request.id,
    });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
    }).init();
    cleanups.push(() => destroy(client.rootStore));
    const first = await client.rootStore.query.query({ request: { id: 'A' } });
    const second = await client.rootStore.query.query({ request: { id: 'a', locale: 'en' } });
    expect(second.query).toBe(first.query);
    expect(second.query.variables.request!.id).toBe('A');
    expect(second.data).toBe('A');
});

test('nested request arrays, maps and reference identifiers have stable keys', async () => {
    const Item = types.model('RequestIdentityItem', { id: types.identifier, title: '' });
    const Query = createQueryMap('NestedIdentity', {
        request: types.model({
            ids: types.array(types.string),
            filters: types.map(types.model({ active: true })),
            item: types.safeReference(Item),
        }),
        endpoint: async ({ request }) => request.item?.id,
    });
    const Root = createRootStore({
        query: types.optional(Query, {}),
        items: types.map(Item),
    }).actions((self) => ({
        add() {
            self.items.set('item', { id: 'item' });
        },
    }));
    const client = new QueryClient({ RootStore: Root }).init();
    cleanups.push(() => destroy(client.rootStore));
    client.rootStore.add();
    const response = await client.rootStore.query.query({
        request: { ids: ['b', 'a'], filters: { first: {} }, item: 'item' },
    });
    expect(response.data).toBe('item');
    expect(
        client.rootStore.query.get({
            item: 'item',
            filters: { first: { active: true } },
            ids: ['b', 'a'],
        }),
    ).toBe(response.query);
    expect(
        client.rootStore.query.get({ item: 'item', filters: { first: {} }, ids: ['a', 'b'] }),
    ).toBeUndefined();
    await expect(
        response.query.refetch({
            request: { ids: ['b', 'a'], filters: { first: {} }, item: 'item' },
        }),
    ).resolves.toHaveProperty('data', 'item');
});

test('snapshots retain entry layout and restored entries expire', async () => {
    vi.useFakeTimers();
    const { query, client } = setup(100);
    await query.query({ request: { id: 'a' } });
    const Root = client.config.RootStore;
    const restored = new QueryClient({
        RootStore: Root,
        gcInterval: Infinity,
        queryOptions: { cacheTime: 100 },
    }).init(getSnapshot(client.rootStore));
    cleanups.push(() => destroy(restored.rootStore));
    expect(restored.rootStore.query.get({ id: 'a' })!.data!.value).toBe('a');
    await vi.advanceTimersByTimeAsync(100);
    expect(restored.rootStore.query.entries.size).toBe(0);
});

test('reset disposes old entry timers and late responses cannot alter the new root', async () => {
    vi.useFakeTimers();
    const { query, client, fetch } = setup(100);
    const response = pending<{ value: string }>();
    fetch.mockReturnValue(response.promise);
    const execution = query.query({ request: { id: 'a' } });
    client.reset();
    response.resolve({ value: 'Old result' });
    expect((await execution).data).toBeNull();
    expect(client.rootStore.query.entries.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
});

test.each([-1, NaN, -Infinity, 2 ** 31])(
    'invalid entry retention %s fails before creating an entry',
    (cacheTime) => {
        const { query } = setup();
        expect(() => query.getOrCreate({ request: { id: 'a' }, cacheTime })).toThrow('cacheTime');
        expect(query.entries.size).toBe(0);
    },
);

test('explicit abort releases a stuck fetch so a new call can start immediately', async () => {
    const { query, fetch } = setup();
    const response = pending<{ value: string }>();
    fetch.mockReturnValueOnce(response.promise);
    const old = query.query({ request: { id: 'a' } });
    const entry = query.get({ id: 'a' })!;
    entry.abort();
    const fresh = await entry.refetch();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fresh.data!.value).toBe('a');
    response.resolve({ value: 'Old result' });
    expect((await old).data).toBeNull();
    expect(entry.data!.value).toBe('a');
});

test('an endpoint synchronous error clears loading and permits a later fetch', async () => {
    const { query, fetch } = setup();
    const error = new Error('Synchronous failure');
    fetch.mockImplementationOnce(() => {
        throw error;
    });
    const failed = await query.query({ request: { id: 'a' } });
    expect(failed.error).toBe(error);
    expect(failed.query.isLoading).toBe(false);
    expect((await failed.query.refetch()).data!.value).toBe('a');
});

test('query-definition retention is used when a hook has no retention override', async () => {
    vi.useFakeTimers();
    const Query = createQueryMap('ShortLivedQuery', {
        cacheTime: 50,
        endpoint: async () => 'Done',
    });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
    }).init();
    cleanups.push(() => destroy(client.rootStore));
    const { QueryClientProvider: wrapper } = createContext(client);
    const hook = renderHook(() => useQuery(client.rootStore.query), { wrapper });
    await settle();
    hook.unmount();
    await vi.advanceTimersByTimeAsync(49);
    expect(client.rootStore.query.entries.size).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.rootStore.query.entries.size).toBe(0);
});

test('a default entry can be selected before a required custom request key is available', () => {
    const Query = createQueryMap('DependentCustomKey', {
        request: types.model({ id: types.string }),
        requestKey: ({ id }) => id.toLowerCase(),
    });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
    }).init();
    cleanups.push(() => destroy(client.rootStore));
    const { QueryClientProvider: wrapper } = createContext(client);
    renderHook(() => useQuery(client.rootStore.query, { enabled: false }), { wrapper });
    expect(client.rootStore.query.get()).toBeDefined();
});

test('null and omitted requests select different entries', async () => {
    const Query = createQueryMap('NullableRequest', {
        request: types.frozen(),
        endpoint: async ({ request }) => (request === null ? 'null' : 'default'),
    });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
    }).init();
    cleanups.push(() => destroy(client.rootStore));
    const first = await client.rootStore.query.query();
    const second = await client.rootStore.query.query({ request: null });
    expect(first.data).toBe('default');
    expect(second.data).toBe('null');
    expect(first.query).not.toBe(second.query);
});

test('previous model placeholders remain alive with cacheTime zero until replaced', async () => {
    vi.useFakeTimers();
    const { query, fetch, wrapper } = setup(0);
    const response = pending<{ value: string }>();
    fetch.mockResolvedValueOnce({ value: 'First' }).mockReturnValueOnce(response.promise);
    const hook = renderHook(
        ({ id }) =>
            useQuery(query, {
                request: { id },
                placeholderData: (previous) => previous,
            }),
        { wrapper, initialProps: { id: 'a' } },
    );
    await settle();
    hook.rerender({ id: 'a' });
    const previousEntry = query.get({ id: 'a' })!;
    hook.rerender({ id: 'b' });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
    expect(isAlive(previousEntry)).toBe(true);
    expect(hook.result.current.data!.value).toBe('First');
    await act(async () => {
        response.resolve({ value: 'Second' });
    });
    hook.rerender({ id: 'b' });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
    expect(isAlive(previousEntry)).toBe(false);
    expect(hook.result.current.data!.value).toBe('Second');
});
