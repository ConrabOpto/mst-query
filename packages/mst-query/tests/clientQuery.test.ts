import { afterEach, expect, expectTypeOf, test, vi } from 'vitest';
import { destroy, types } from 'mobx-state-tree';
import { createInfiniteQuery, createQuery, createRootStore, QueryClient } from '../src';
import { Root } from './models/RootStore';
import { itemData } from './api/data';

afterEach(() => vi.useRealTimers());

function deferred<T = any>() {
    let resolve!: (value: T) => void;
    let reject!: (error: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function setup(staleTime = 0) {
    const client = new QueryClient({ RootStore: Root, queryOptions: { staleTime } }).init();
    const query = client.rootStore.serviceStore.itemServiceStore.itemQuery;
    const endpoint = vi.fn(async () => itemData);
    const options = { request: { id: 'test' }, meta: { getItem: endpoint } };
    return { client, query, endpoint, options };
}

test('returns typed normalized data after updating MST and reuses fresh results', async () => {
    const { client, query, endpoint, options } = setup(5_000);
    const data = await client.query(query, options);
    expectTypeOf(data).toEqualTypeOf<typeof query.data>();
    expect(data).toBe(query.data);
    expect(data).toBe(client.rootStore.itemStore.models.get('test'));
    expect(data?.createdBy).toBe(client.rootStore.userStore.models.get('ko'));
    expect(query.isLoading).toBe(false);
    expect(await client.query(query, { ...options, request: { id: 'test' } })).toBe(data);
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(client.dehydrate().queries[0].result).toEqual(itemData);
});

test('uses configured freshness, per-call overrides, and the exact stale boundary', async () => {
    vi.useFakeTimers();
    const { client, query, endpoint, options } = setup(5_000);
    await client.query(query, options);
    vi.advanceTimersByTime(4_999);
    await client.query(query, options);
    expect(endpoint).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    await client.query(query, options);
    expect(endpoint).toHaveBeenCalledTimes(2);
    await client.query(query, { ...options, staleTime: 0 });
    expect(endpoint).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(10_000);
    await client.query(query, { ...options, staleTime: Infinity });
    expect(endpoint).toHaveBeenCalledTimes(3);
});

test('completed requests fetch again by default, and refetch always forces a refresh', async () => {
    const { client, query, endpoint, options } = setup();
    await client.query(query, options);
    await client.query(query, options);
    expect(endpoint).toHaveBeenCalledTimes(2);
    await client.query(query, { ...options, staleTime: Infinity });
    await query.refetch();
    expect(endpoint).toHaveBeenCalledTimes(3);
    expect(await client.query(query, { staleTime: Infinity })).toBe(query.data);
    expect(endpoint).toHaveBeenCalledTimes(3);
});

test('invalidation overrides infinite staleTime', async () => {
    const { client, query, endpoint, options } = setup(Infinity);
    await client.query(query, options);
    query.invalidate();
    await client.query(query, options);
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('requestless queries cache successful null results', async () => {
    const endpoint = vi.fn(async () => null);
    const Query = createQuery('NullQuery', { endpoint });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
        queryOptions: { staleTime: Infinity },
    }).init();
    expect(await client.query(client.rootStore.query)).toBeNull();
    expect(await client.query(client.rootStore.query)).toBeNull();
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(client.dehydrate().queries[0].result).toBeNull();
});

test.each(['client', 'model', 'refetch'] as const)(
    'joins a pending %s request until normalization completes',
    async (source) => {
        const { client, query, endpoint, options } = setup();
        const pending = deferred();
        endpoint.mockReturnValueOnce(pending.promise);
        const first =
            source === 'client'
                ? client.query(query, options)
                : source === 'model'
                  ? query.query(options)
                  : query.refetch(options);
        const signal = query.__MstQueryHandler.abortController!.signal;
        const second = client.query(query, options);
        const third = client.query(query, options);
        expect(endpoint).toHaveBeenCalledTimes(1);
        expect(signal.aborted).toBe(false);
        const state = client.dehydrate();
        expect(state.queries[0].promise).toBeDefined();
        pending.resolve(itemData);
        await first;
        const [a, b] = await Promise.all([second, third]);
        expect(a).toBe(query.data);
        expect(b).toBe(a);
        expect(query.isLoading).toBe(false);
        expect(client.rootStore.itemStore.models.get('test')).toBe(a);
        expect(await state.queries[0].promise).toEqual(itemData);
    },
);

test('fresh model results become eligible for dehydration without fetching', async () => {
    const { client, query, endpoint, options } = setup(Infinity);
    await query.query(options);
    expect(client.dehydrate().queries).toEqual([]);
    await client.query(query, options);
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(client.dehydrate().queries[0].result).toEqual(itemData);
});

test.each([false, true])(
    'different arguments do not reuse a previous request (pending=%s)',
    async (pending) => {
        const { client, query, endpoint, options } = setup(Infinity);
        const firstResponse = deferred();
        endpoint.mockReturnValueOnce(firstResponse.promise);
        const first = client.query(query, options);
        if (!pending) {
            firstResponse.resolve(itemData);
            await first;
        }
        const replacement = { ...itemData, id: 'other', description: 'Other item' };
        endpoint.mockResolvedValueOnce(replacement);
        const second = await client.query(query, { ...options, request: { id: 'other' } });
        expect(second?.id).toBe('other');
        expect(endpoint).toHaveBeenCalledTimes(2);
        if (pending) {
            firstResponse.resolve(itemData);
            await first;
        }
        expect(query.data?.id).toBe('other');
        expect(client.dehydrate().queries[0]).toMatchObject({
            request: { id: 'other' },
            result: replacement,
        });
    },
);

test.each([false, true])(
    'changed GraphQL metadata does not reuse the previous operation (pending=%s)',
    async (pending) => {
        const { client, query, endpoint, options } = setup(Infinity);
        const firstResponse = deferred();
        endpoint.mockReturnValueOnce(firstResponse.promise);
        const meta = { ...options.meta, gql: { kind: 'Document', name: 'first' } };
        const first = client.query(query, { ...options, meta });
        const outcome = first.catch((error) => error);
        if (!pending) {
            firstResponse.resolve(itemData);
            await first;
        }
        // In-place edits must not retroactively change the recorded operation identity.
        meta.gql.name = 'second';
        await client.query(query, { ...options, meta });
        expect(endpoint).toHaveBeenCalledTimes(2);
        if (pending) firstResponse.resolve(itemData);
        await outcome;
        expect(client.dehydrate().queries).toHaveLength(1);
    },
);

test('different metadata closures with identical source text are different operations', async () => {
    const { client, query, options } = setup(Infinity);
    const getItem = (description: string) => async () => ({ ...itemData, description });
    await client.query(query, { ...options, meta: { getItem: getItem('first') } });
    const data = await client.query(query, { ...options, meta: { getItem: getItem('second') } });
    expect(data?.description).toBe('second');
});

test('endpoint identity changes invalidate reuse', async () => {
    const first = vi.fn(async () => 'first');
    const second = vi.fn(async () => 'second');
    const Query = createQuery('GlobalQuery', { data: types.string });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
        queryOptions: { endpoint: first, staleTime: Infinity },
    }).init();
    expect(await client.query(client.rootStore.query)).toBe('first');
    client.config.queryOptions!.endpoint = second;
    expect(await client.query(client.rootStore.query)).toBe('second');
    expect(second).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
    'failures reject every caller, are excluded from dehydration, and can retry (sync=%s)',
    async (sync) => {
        const { client, query, endpoint, options } = setup(Infinity);
        const error = new Error('Failed');
        endpoint.mockImplementationOnce(() => {
            if (sync) throw error;
            return Promise.reject(error);
        });
        const first = client.query(query, options);
        const second = client.query(query, options);
        const outcomes = await Promise.allSettled([first, second]);
        expect(outcomes).toEqual([
            { status: 'rejected', reason: error },
            { status: 'rejected', reason: error },
        ]);
        expect(query.error).toBe(error);
        expect(query.isLoading).toBe(false);
        expect(client.dehydrate().queries).toEqual([]);
        await client.query(query, options);
        expect(endpoint).toHaveBeenCalledTimes(2);
    },
);

test('normalization failures reject joined callers and are not dehydrated as successes', async () => {
    const { client, query, endpoint, options } = setup();
    endpoint.mockResolvedValueOnce({ ...itemData, description: 123 } as any);
    const outcomes = await Promise.allSettled([
        client.query(query, options),
        client.query(query, options),
    ]);
    expect(outcomes.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(query.error).toBeTruthy();
    expect(query.isLoading).toBe(false);
    expect(client.dehydrate().queries).toEqual([]);
});

test.each(['abort', 'destroy'] as const)('cancellation rejects callers after %s', async (kind) => {
    const { client, query, endpoint, options } = setup();
    const pending = deferred();
    endpoint.mockReturnValueOnce(pending.promise);
    const result = client.query(query, options);
    if (kind === 'abort') query.abort();
    else destroy(client.rootStore);
    pending.resolve(itemData);
    await expect(result).rejects.toThrow();
    expect(client.dehydrate().queries).toEqual([]);
});

test('hydrated fresh results preserve their timestamp and can be dehydrated again', async () => {
    const server = setup(Infinity);
    await server.client.query(server.query, server.options);
    const state = server.client.dehydrate();
    const browser = setup(Infinity);
    browser.client.hydrate(state);
    expect(await browser.client.query(browser.query)).toBe(browser.query.data);
    expect(browser.client.dehydrate().queries).toEqual(state.queries);
    // The first matching client call supplies the metadata omitted by hydration.
    expect(await browser.client.query(browser.query, browser.options)).toBe(browser.query.data);
    expect(browser.endpoint).not.toHaveBeenCalled();

    const differentEndpoint = vi.fn(async () => itemData);
    await browser.client.query(browser.query, {
        ...browser.options,
        meta: { getItem: differentEndpoint },
    });
    expect(differentEndpoint).toHaveBeenCalledTimes(1);
});

test('joins an adopted stream and can dehydrate it while pending or settled', async () => {
    const server = setup();
    const pending = deferred();
    server.endpoint.mockReturnValueOnce(pending.promise);
    const first = server.client.query(server.query, server.options);
    const browser = setup(Infinity);
    browser.client.hydrate(server.client.dehydrate());
    const joined = browser.client.query(browser.query);
    expect(browser.client.dehydrate().queries[0].promise).toBeDefined();
    pending.resolve(itemData);
    await first;
    expect(await joined).toBe(browser.query.data);
    expect(browser.client.dehydrate().queries[0].result).toEqual(itemData);
    expect(await browser.client.query(browser.query)).toBe(browser.query.data);
});

test('adopted normalization failures reject joined callers without unhandled rejections', async () => {
    const { client, query } = setup();
    client.hydrate({
        dehydratedAt: Date.now(),
        queries: [
            {
                path: '/serviceStore/itemServiceStore/itemQuery',
                type: 'ItemQuery',
                request: { id: 'test' },
                promise: Promise.resolve({ ...itemData, description: 123 }),
            },
        ],
    });
    await expect(client.query(query)).rejects.toThrow();
    expect(query.isLoading).toBe(false);
    expect(client.dehydrate().queries).toEqual([]);
});

test('pagination participates in identity and queryMore does not leave stale dehydration data', async () => {
    const endpoint = vi.fn(async ({ pagination }: any) => [pagination.page]);
    const Query = createInfiniteQuery('Pages', {
        data: types.array(types.number),
        pagination: types.model({ page: types.number }),
        endpoint,
    });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
        queryOptions: { staleTime: Infinity },
    }).init();
    const query = client.rootStore.query;
    await client.query(query, { pagination: { page: 1 } });
    await client.query(query, { pagination: { page: 1 } });
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(await client.query(query, { pagination: { page: 2 } })).toEqual([2]);
    expect(endpoint).toHaveBeenCalledTimes(2);
    await query.queryMore({ pagination: { page: 3 } });
    expect(client.dehydrate().queries).toEqual([]);
    await client.query(query, { pagination: { page: 1 } });
    expect(endpoint).toHaveBeenCalledTimes(4);
});
