import * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { observer } from 'mobx-react';
import { types } from 'mobx-state-tree';
import {
    createContext,
    createQuery,
    createInfiniteQuery,
    HydrationBoundary,
    QueryClient,
    useInfiniteQuery,
    useQuery,
    useSuspenseQuery,
} from '../src';
import type { DehydratedState } from '../src';

afterEach(cleanup);

const setup = () => {
    const endpoint = vi.fn(async ({ meta }: { meta: Record<string, any> }) => {
        if (!meta.document) throw new Error('Missing GraphQL document');
        return { value: meta.document.name };
    });
    const options = {
        data: types.frozen<{ value: string }>(),
        request: types.model({ id: types.string }),
        endpoint,
    };
    const Query = createQuery('MetadataQuery', options);
    const InfiniteQuery = createInfiniteQuery('MetadataInfiniteQuery', options);
    const client = new QueryClient({
        RootStore: types.model({
            query: types.optional(Query, {}),
            infiniteQuery: types.optional(InfiniteQuery, {}),
        }),
    }).init();
    const { QueryClientProvider } = createContext(client);
    const meta = { document: { kind: 'Document', name: 'client' } };
    return { client, ...client.rootStore, endpoint, meta, QueryClientProvider };
};

const hydrationState = (pending = false, infinite = false) => {
    let resolve!: (value: { value: string }) => void;
    const promise = new Promise<{ value: string }>((done) => (resolve = done));
    const state: DehydratedState = {
        dehydratedAt: Date.now() + 1,
        queries: [
            {
                path: infinite ? '/infiniteQuery' : '/query',
                type: infinite ? 'MetadataInfiniteQuery' : 'MetadataQuery',
                request: { id: '1' },
                cachedAt: Date.now() + 1,
                ...(pending ? { promise } : { result: { value: 'server' } }),
            },
        ],
    };
    return { state, resolve };
};

test.each([false, true])(
    'hydration preserves existing client metadata (pending=%s)',
    async (pending) => {
        const { client, query, endpoint, meta } = setup();
        await query.query({ request: { id: '1' }, meta });
        endpoint.mockClear();
        const { state, resolve } = hydrationState(pending);

        client.hydrate(state);
        if (pending) {
            resolve({ value: 'server' });
            await query.__MstQueryHandler.promise;
        }
        expect(query.data).toEqual({ value: 'server' });
        expect(endpoint).not.toHaveBeenCalled();

        await expect(query.refetch()).resolves.toMatchObject({
            error: null,
            result: { value: 'client' },
        });
        expect(endpoint).toHaveBeenCalledTimes(1);
        expect(endpoint.mock.calls[0][0].meta).toBe(meta);
    },
);

type TestClient = ReturnType<typeof setup>;
type TestMeta = TestClient['meta'];
const hookOptions = (meta: TestMeta) => ({ request: { id: '1' }, staleTime: Infinity, meta });
const hooks = [
    {
        name: 'useQuery',
        infinite: false,
        useHook: (client: TestClient, meta: TestMeta) => useQuery(client.query, hookOptions(meta)),
    },
    {
        name: 'useInfiniteQuery',
        infinite: true,
        useHook: (client: TestClient, meta: TestMeta) =>
            useInfiniteQuery(client.infiniteQuery, hookOptions(meta)),
    },
    {
        name: 'useSuspenseQuery',
        infinite: false,
        useHook: (client: TestClient, meta: TestMeta) =>
            useSuspenseQuery(client.query, hookOptions(meta)),
    },
];

test.each(
    hooks.flatMap((hook) => ['refetch', 'invalidate'].map((method) => ({ ...hook, method }))),
)(
    '$name registers metadata on a fresh hydrated mount for bare $method',
    async ({ useHook, infinite, method }) => {
        const client = setup();
        const { endpoint, meta, QueryClientProvider } = client;
        const query = infinite ? client.infiniteQuery : client.query;
        const { state } = hydrationState(false, infinite);
        const Probe = observer(() => {
            useHook(client, meta);
            return null;
        });
        render(
            <QueryClientProvider>
                <HydrationBoundary state={state}>
                    <Probe />
                </HydrationBoundary>
            </QueryClientProvider>,
        );
        expect(endpoint).not.toHaveBeenCalled();
        expect(query.data).toEqual({ value: 'server' });

        await act(async () => {
            if (method === 'refetch') await query.refetch();
            else query.invalidate();
        });
        await waitFor(() => expect(query.data).toEqual({ value: 'client' }));
        expect(query.error).toBeNull();
        expect(endpoint).toHaveBeenCalledTimes(1);
        expect(endpoint.mock.calls[0][0].meta).toBe(meta);
    },
);

test.each(hooks)(
    '$name registers metadata after a streamed first mount',
    async ({ useHook, infinite }) => {
        const client = setup();
        const { endpoint, meta, QueryClientProvider } = client;
        const query = infinite ? client.infiniteQuery : client.query;
        const { state, resolve } = hydrationState(true, infinite);
        const Probe = observer(() => {
            useHook(client, meta);
            return null;
        });
        render(
            <QueryClientProvider>
                <HydrationBoundary state={state}>
                    <React.Suspense fallback={null}>
                        <Probe />
                    </React.Suspense>
                </HydrationBoundary>
            </QueryClientProvider>,
        );
        await act(async () => {
            resolve({ value: 'server' });
        });
        expect(endpoint).not.toHaveBeenCalled();
        await act(async () => {
            await expect(query.refetch()).resolves.toMatchObject({
                error: null,
                result: { value: 'client' },
            });
        });
        expect(endpoint.mock.calls[0][0].meta).toBe(meta);
    },
);

test('disabled hooks register updated metadata without fetching and preserve it when omitted', async () => {
    const { query, endpoint, meta, QueryClientProvider } = setup();
    const updated = { document: { kind: 'Document', name: 'updated' } };
    const Probe = ({ meta }: { meta?: { document: object } }) => {
        useQuery(query, { enabled: false, meta });
        return null;
    };
    const view = render(<Probe meta={meta} />, { wrapper: QueryClientProvider });
    view.rerender(<Probe meta={updated} />);
    view.rerender(<Probe />);
    expect(endpoint).not.toHaveBeenCalled();
    await expect(query.refetch()).resolves.toMatchObject({
        error: null,
        result: { value: 'updated' },
    });
    expect(endpoint.mock.calls[0][0].meta).toBe(updated);
});

test.each([false, true])('dehydration excludes metadata (pending=%s)', async (pending) => {
    const { client, query, endpoint } = setup();
    const document = { kind: 'Document', name: 'private-server-document' };
    const meta: Record<string, any> = { document };
    meta.circular = meta;
    let resolve!: (value: { value: string }) => void;
    endpoint.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const prefetch = client.prefetchQuery(query, { request: { id: '1' }, meta });
    if (!pending) {
        resolve({ value: 'server' });
        await prefetch;
    }
    const state = client.dehydrate();
    expect(state.queries).toHaveLength(1);
    expect(state.queries[0]).not.toHaveProperty('meta');
    expect(JSON.stringify(state)).not.toContain('private-server-document');
    if (pending) {
        resolve({ value: 'server' });
        await prefetch;
    }
});
