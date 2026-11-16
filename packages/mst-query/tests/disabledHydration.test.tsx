import * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { getSnapshot, types } from 'mobx-state-tree';
import {
    createInfiniteQuery,
    createQuery,
    createRootStore,
    useInfiniteQuery,
    useQuery,
} from '../src';
import { EmptyPagination, EmptyRequest } from '../src/MstQueryHandler';
import { QueryClient } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';

afterEach(cleanup);

const setup = () => {
    const endpoint = vi.fn(async ({ request, pagination }) => ({
        request: request === undefined ? undefined : getSnapshot(request),
        pagination: pagination === undefined ? undefined : getSnapshot(pagination),
    }));
    const Query = createQuery('HydratedQuery', {
        request: types.model({ id: types.string }),
        endpoint,
    });
    const InfiniteQuery = createInfiniteQuery('HydratedInfiniteQuery', {
        request: types.model({ id: types.string }),
        pagination: types.model({ offset: types.number }),
        endpoint,
    });
    const Root = createRootStore({
        query: types.optional(Query, {}),
        infiniteQuery: types.optional(InfiniteQuery, {}),
    });
    const client = new QueryClient({ RootStore: Root }).init();
    const { QueryClientProvider } = createContext(client);
    return { client, endpoint, QueryClientProvider, ...client.rootStore };
};

test.each([
    { staleTime: 0, mode: 'rerender', requestReady: false },
    { staleTime: 1000, mode: 'rerender', requestReady: true },
    { staleTime: Infinity, mode: 'rerender', requestReady: false },
    { staleTime: Infinity, mode: 'remount', requestReady: true },
])(
    'disabled initialData initializes variables on $mode (staleTime=$staleTime, requestReady=$requestReady)',
    async ({ staleTime, mode, requestReady }) => {
        const { infiniteQuery: query, endpoint, QueryClientProvider } = setup();
        const initialData = { initial: true };
        const Comp = ({ enabled }: { enabled: boolean }) => {
            useInfiniteQuery(query, {
                initialData,
                // Disabled forms may not have valid request or pagination yet.
                request: enabled || requestReady ? { id: 'ready' } : undefined,
                pagination: enabled || requestReady ? { offset: 0 } : undefined,
                enabled,
                staleTime,
                refetchOnChanged: 'none',
            });
            return null;
        };
        const view = render(<Comp enabled={false} />, { wrapper: QueryClientProvider });
        expect(query.data).toEqual(initialData);
        expect(query.isFetched).toBe(false);
        expect(endpoint).not.toHaveBeenCalled();
        expect(getSnapshot(query.variables)).toEqual({ request: undefined, pagination: undefined });

        if (mode === 'remount') view.unmount();
        await act(async () => {
            if (mode === 'remount') {
                render(<Comp enabled />, { wrapper: QueryClientProvider });
            } else {
                view.rerender(<Comp enabled />);
            }
        });
        expect(endpoint).toHaveBeenCalledTimes(1);
        expect(query.data).toEqual({ request: { id: 'ready' }, pagination: { offset: 0 } });

        await expect(query.queryMore({ pagination: { offset: 10 } })).resolves.toMatchObject({
            error: null,
            result: { request: { id: 'ready' }, pagination: { offset: 10 } },
        });
        await expect(query.refetch()).resolves.toMatchObject({
            error: null,
            result: { request: { id: 'ready' }, pagination: { offset: 10 } },
        });
        expect(endpoint).toHaveBeenCalledTimes(3);
        expect(query.isLoading).toBe(false);
        expect(query.isFetchingMore).toBe(false);
        expect(query.isRefetching).toBe(false);
    },
);

test.each(['rerender', 'remount'])(
    'disabled cache hydration initializes variables on enabled %s even while fresh',
    async (mode) => {
        const { client, query, endpoint, QueryClientProvider } = setup();
        const initialData = { cached: true };
        query.setData(initialData, { cacheKey: 'hydrated', cacheTime: 1000 });
        const Comp = ({ enabled }: { enabled: boolean }) => {
            useQuery(query, {
                cacheKey: 'hydrated',
                request: enabled ? { id: 'ready' } : undefined,
                enabled,
                staleTime: Infinity,
                refetchOnChanged: 'none',
            });
            return null;
        };
        const view = render(<Comp enabled={false} />, { wrapper: QueryClientProvider });
        expect(query.data).toEqual(initialData);
        expect(endpoint).not.toHaveBeenCalled();
        expect(query.variables.request).toBeUndefined();

        if (mode === 'remount') view.unmount();
        await act(async () => {
            if (mode === 'remount') {
                render(<Comp enabled />, { wrapper: QueryClientProvider });
            } else {
                view.rerender(<Comp enabled />);
            }
        });
        // A new observer can hydrate both the fresh cache and its variables without fetching.
        expect(endpoint).toHaveBeenCalledTimes(mode === 'remount' ? 0 : 1);
        await expect(query.refetch()).resolves.toMatchObject({
            error: null,
            result: { request: { id: 'ready' }, pagination: undefined },
        });
        client.queryStore.removeQueryData(
            client.rootStore.query.__MstQueryHandler.type,
            'hydrated',
        );
    },
);

test('enabled hydration remains fresh after disabling and re-enabling', async () => {
    const { infiniteQuery: query, endpoint, QueryClientProvider } = setup();
    const initialData = { initial: true };
    const Comp = ({ enabled }: { enabled: boolean }) => {
        useInfiniteQuery(query, {
            initialData,
            request: { id: 'ready' },
            pagination: { offset: 0 },
            enabled,
            staleTime: Infinity,
            refetchOnChanged: 'none',
        });
        return null;
    };
    const view = render(<Comp enabled />, { wrapper: QueryClientProvider });
    const cachedAt = query.cachedAt;
    view.rerender(<Comp enabled={false} />);
    view.rerender(<Comp enabled />);
    expect(query.data).toEqual(initialData);
    expect(query.cachedAt).toBe(cachedAt);
    expect(endpoint).not.toHaveBeenCalled();
    await expect(query.queryMore({ pagination: { offset: 10 } })).resolves.toMatchObject({
        error: null,
        result: { request: { id: 'ready' }, pagination: { offset: 10 } },
    });
});

test('omitted variables and hook sentinels never enter MST snapshots', async () => {
    const { infiniteQuery: query, endpoint } = setup();
    await expect(query.query()).resolves.toMatchObject({ error: null });
    await expect(
        query.query({ request: EmptyRequest as any, pagination: EmptyPagination as any }),
    ).resolves.toMatchObject({ error: null });
    expect(getSnapshot(query.variables)).toEqual({ request: undefined, pagination: undefined });
    expect(endpoint).toHaveBeenCalledTimes(2);

    await query.query({ request: { id: 'ready' }, pagination: { offset: 0 } });
    await expect(
        query.query({ request: EmptyRequest as any, pagination: EmptyPagination as any }),
    ).resolves.toMatchObject({
        error: null,
        result: { request: { id: 'ready' }, pagination: { offset: 0 } },
    });
});

test.each(['refetch', 'queryMore'] as const)(
    '%s resets its flag after synchronous variable validation fails',
    async (method) => {
        const { infiniteQuery: query, endpoint } = setup();
        await expect(query[method]({ request: { id: 123 } as any })).rejects.toThrow();
        expect(query.isRefetching).toBe(false);
        expect(query.isFetchingMore).toBe(false);
        expect(query.isLoading).toBe(false);
        expect(endpoint).not.toHaveBeenCalled();
        await expect(
            query[method]({ request: { id: 'ready' }, pagination: { offset: 0 } }),
        ).resolves.toMatchObject({ error: null });
        expect(query.isRefetching).toBe(false);
        expect(query.isFetchingMore).toBe(false);
        expect(query.isLoading).toBe(false);
    },
);
