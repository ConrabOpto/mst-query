import * as React from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, getSnapshot, getType, types } from 'mobx-state-tree';
import { afterEach, expect, test, vi } from 'vitest';
import {
    createContext,
    createInfiniteQuery,
    createMutation,
    createQuery,
    createRootStore,
    onMutate,
    QueryClient,
    useInfiniteQuery,
    useMutation,
    useQuery,
} from '../src';

afterEach(cleanup);

const setup = () => {
    const SharedQuery = createQuery('SharedQuery', {
        data: types.model({ value: types.string }),
        request: types.model({ id: types.string }),
        endpoint: ({ request, meta, signal }) => meta.fetch(request, signal),
    });
    const Root = createRootStore({ query: types.optional(SharedQuery, {}) });
    const client = new QueryClient({ RootStore: Root }).init();
    const { QueryClientProvider } = createContext(client);
    return { client, query: client.rootStore.query, wrapper: QueryClientProvider };
};

test.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
])(
    'a second hook throws even with matching requests (first enabled=%s, second enabled=%s)',
    (firstEnabled, secondEnabled) => {
        const { client, query, wrapper } = setup();
        const fetch = vi.fn(() => new Promise<{ value: string }>(() => {}));
        const first = renderHook(
            () =>
                useQuery(query, {
                    request: { id: 'same' },
                    meta: { fetch },
                    enabled: firstEnabled,
                }),
            { wrapper },
        );
        expect(() =>
            renderHook(
                () =>
                    useQuery(query, {
                        request: { id: 'same' },
                        meta: { fetch },
                        enabled: secondEnabled,
                        initialData: { value: 'Must not be applied' },
                    }),
                { wrapper },
            ),
        ).toThrow('Query "SharedQuery" already has a query hook.');
        expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
        expect(fetch).toHaveBeenCalledTimes(firstEnabled ? 1 : 0);
        expect(query.data).toBeNull();
        first.unmount();
        expect(query.__MstQueryHandler.queryObservers.length).toBe(0);
        destroy(client.rootStore);
    },
);

test('a second hook throws when its request is omitted', () => {
    const { client, query, wrapper } = setup();
    const first = renderHook(() => useQuery(query, { enabled: false }), { wrapper });
    expect(() => renderHook(() => useQuery(query), { wrapper })).toThrow(
        'Query "SharedQuery" already has a query hook.',
    );
    expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
    first.unmount();
    destroy(client.rootStore);
});

test('two hooks in the same component throw and release the subscription on failed mount', () => {
    const { client, query, wrapper } = setup();
    expect(() =>
        renderHook(
            () => {
                useQuery(query, { enabled: false });
                useQuery(query, { enabled: false });
            },
            { wrapper },
        ),
    ).toThrow('Query "SharedQuery" already has a query hook.');
    expect(query.__MstQueryHandler.queryObservers.length).toBe(0);
    destroy(client.rootStore);
});

test.each([false, true])(
    'one hook coordinates the query while other components read it reactively (strictMode=%s)',
    async (reactStrictMode) => {
        const { client, query, wrapper } = setup();
        const fetch = vi.fn(async ({ id }: { id: string }) => ({ value: id }));
        const Owner = observer(({ id }: { id: string }) => {
            const { data } = useQuery(query, { request: { id }, meta: { fetch } });
            return <div>{data?.value ?? 'loading'}</div>;
        });
        const Reader = observer(() => <div>{query.data?.value ?? 'loading'}</div>);
        const owner = render(<Owner id="first" />, { wrapper, reactStrictMode });
        const reader = render(<Reader />, { wrapper, reactStrictMode });
        await waitFor(() => expect(reader.container.textContent).toBe('first'));
        expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
        expect(fetch).toHaveBeenCalledTimes(1);
        owner.rerender(<Owner id="second" />);
        await waitFor(() => expect(reader.container.textContent).toBe('second'));
        expect(owner.container.textContent).toBe('second');
        expect(fetch).toHaveBeenCalledTimes(2);
        await act(async () => {
            query.setData({ value: 'Updated directly' });
        });
        expect(reader.container.textContent).toBe('Updated directly');
        expect(owner.container.textContent).toBe('Updated directly');
        reader.unmount();
        expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
        owner.unmount();
        expect(query.__MstQueryHandler.queryObservers.length).toBe(0);
        destroy(client.rootStore);
    },
);

test('rerendering a hook with new options does not register another owner', async () => {
    const { client, query, wrapper } = setup();
    const fetch = vi.fn(async () => ({ value: 'Result' }));
    const Comp = observer(({ revision }: { revision: number }) => {
        const { data } = useQuery(query, { request: { id: 'same' }, meta: { fetch } });
        return (
            <div>
                {revision}: {data?.value ?? 'loading'}
            </div>
        );
    });
    const { container, rerender, unmount } = render(<Comp revision={0} />, { wrapper });
    await waitFor(() => expect(container.textContent).toBe('0: Result'));
    rerender(<Comp revision={1} />);
    expect(container.textContent).toBe('1: Result');
    expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();
    destroy(client.rootStore);
});

test('another hook can take ownership after the previous hook unmounts', async () => {
    const { client, query, wrapper } = setup();
    const fetch = vi.fn(async ({ id }: { id: string }) => ({ value: id }));
    const Comp = observer(({ id }: { id: string }) => {
        const { data } = useQuery(query, { request: { id }, meta: { fetch } });
        return <div>{data?.value ?? 'loading'}</div>;
    });
    const first = render(<Comp id="first" />, { wrapper });
    await waitFor(() => expect(first.container.textContent).toBe('first'));
    first.unmount();
    expect(query.__MstQueryHandler.queryObservers.length).toBe(0);
    const second = render(<Comp id="second" />, { wrapper });
    await waitFor(() => expect(second.container.textContent).toBe('second'));
    expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    second.unmount();
    destroy(client.rootStore);
});

test('replacing an owner in the same commit releases the old subscription first', async () => {
    const { client, query, wrapper } = setup();
    const fetch = vi.fn(async ({ id }: { id: string }) => ({ value: id }));
    const Comp = observer(({ id }: { id: string }) => {
        const { data } = useQuery(query, { request: { id }, meta: { fetch } });
        return <div>{data?.value ?? 'loading'}</div>;
    });
    const { container, rerender, unmount } = render(<Comp key="first" id="first" />, { wrapper });
    await waitFor(() => expect(container.textContent).toBe('first'));
    rerender(<Comp key="second" id="second" />);
    await waitFor(() => expect(container.textContent).toBe('second'));
    expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
    destroy(client.rootStore);
});

test.each([0, 10])('a second infinite query hook throws with pagination offset %s', (offset) => {
    const fetch = vi.fn(() => new Promise<{ value: string }>(() => {}));
    const InfiniteQuery = createInfiniteQuery('SharedInfiniteQuery', {
        data: types.model({ value: types.string }),
        pagination: types.model({ offset: types.number }),
        endpoint: fetch,
    });
    const Root = createRootStore({ query: types.optional(InfiniteQuery, {}) });
    const client = new QueryClient({ RootStore: Root }).init();
    const { QueryClientProvider: wrapper } = createContext(client);
    const query = client.rootStore.query;
    const first = renderHook(() => useInfiniteQuery(query, { pagination: { offset: 0 } }), {
        wrapper,
    });
    expect(() =>
        renderHook(() => useInfiniteQuery(query, { pagination: { offset }, enabled: false }), {
            wrapper,
        }),
    ).toThrow('Query "SharedInfiniteQuery" already has a query hook.');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(query.variables.pagination?.offset).toBe(0);
    expect(query.__MstQueryHandler.queryObservers.length).toBe(1);
    first.unmount();
    destroy(client.rootStore);
});

test('mutation hooks and mutation listeners remain independent of the query hook restriction', async () => {
    const Mutation = createMutation('SharedMutation', {
        endpoint: async () => ({ value: 'Result' }),
    });
    const Root = createRootStore({ mutation: types.optional(Mutation, {}) });
    const client = new QueryClient({ RootStore: Root }).init();
    const { QueryClientProvider: wrapper } = createContext(client);
    const mutation = client.rootStore.mutation;
    const listener = vi.fn();
    onMutate(mutation, listener);
    const first = renderHook(() => useMutation(mutation), { wrapper });
    const second = renderHook(() => useMutation(mutation), { wrapper });
    await act(async () => {
        await first.result.current[0]({ request: undefined });
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mutation.__MstQueryHandler.queryObservers.length).toBe(3);
    first.unmount();
    second.unmount();
    destroy(client.rootStore);
});

test('singleton snapshots and imperative requestless refetches keep their existing shape', async () => {
    const { query, client } = setup();
    const fetch = vi.fn(async ({ id }: { id: string }) => ({ value: id }));
    await query.query({ request: { id: 'first' }, meta: { fetch } });
    expect(getType(query).name).toBe('SharedQuery');
    expect(getSnapshot(query)).toEqual({
        data: { value: 'first' },
        variables: { request: { id: 'first' } },
    });
    expect('entries' in query).toBe(false);
    const result = await query.refetch();
    expect(Object.keys(result).sort()).toEqual(['data', 'error', 'result']);
    expect(result.data!.value).toBe('first');
    expect(fetch).toHaveBeenCalledTimes(2);
    await query.query({ request: { id: 'second' }, meta: { fetch } });
    expect(query.variables.request!.id).toBe('second');
    expect(query.data!.value).toBe('second');
    destroy(client.rootStore);
});

test('old singleton snapshots restore without migration, including model extensions named entries', () => {
    const Query = createQuery('ExtendedSingleton', {
        data: types.frozen<string>(),
        request: types.model({ id: types.string }),
    }).props({ entries: types.map(types.string) });
    const client = new QueryClient({
        RootStore: createRootStore({ query: types.optional(Query, {}) }),
    }).init({
        query: {
            data: 'Saved',
            variables: { request: { id: 'saved' } },
            entries: { custom: 'value' },
        },
    });
    const query = client.rootStore.query;
    expect(query.data).toBe('Saved');
    expect(query.entries.get('custom')).toBe('value');
    expect(
        client.rootStore.getQueries(Query, (node) => node.variables.request?.id === 'saved'),
    ).toEqual([query]);
    query.setData('Cached', { cacheKey: 'saved', cacheTime: 1000 });
    expect(client.queryStore.getQueryData(Query, 'saved')!.data).toBe('Cached');
    destroy(client.rootStore);
});
