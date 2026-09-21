import * as React from 'react';
import { test, vi, expect, describe, beforeEach, afterEach } from 'vitest';
import { types, unprotect, applySnapshot, getSnapshot } from 'mobx-state-tree';
import { useQuery, useMutation } from '../src';
import { autorun, configure as configureMobx, observable, reaction, when } from 'mobx';
import { collectSeenIdentifiers } from '../src/QueryStore';
import { merge } from '../src/merge';
import { act, cleanup, fireEvent, render as r, configure } from '@testing-library/react';
import { observer } from 'mobx-react';
import { ItemQuery } from './models/ItemQuery';
import { itemData, listData } from './api/data';
import { api } from './api/api';
import { wait } from './utils';
import { QueryClient } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';
import { DateModel, DeepModelA, Root } from './models/RootStore';
import { useInfiniteQuery, useVolatileQuery } from '../src/hooks';
import { UnionModel } from './models/UnionModel';

const setup = ({ strictMode = false } = {}) => {
    const queryClient = new QueryClient({ RootStore: Root });
    queryClient.init();

    const { QueryClientProvider } = createContext(queryClient);

    const Wrapper = ({ children }: any) => <QueryClientProvider>{children}</QueryClientProvider>;

    configure({ reactStrictMode: strictMode });

    return {
        queryClient,
        rootStore: queryClient.rootStore,
        q: queryClient.rootStore.serviceStore.itemServiceStore,
        render: (ui: React.ReactElement, options?: any) =>
            r(ui, {
                wrapper: Wrapper,
                ...options,
            }),
    };
};

test('garbage collection', async () => {
    const { q, queryClient } = setup();

    await q.itemQuery.query({ request: { id: 'test ' } });
    await q.itemQuery2.query({ request: { id: 'test2' } });
    expect(queryClient.rootStore.itemStore.models.size).toBe(1);
    expect(queryClient.rootStore.userStore.models.size).toBe(1);
    expect(queryClient.rootStore.listStore.models.size).toBe(0);

    await q.listQuery.query();
    expect(queryClient.rootStore.itemStore.models.size).toBe(4);
    expect(queryClient.rootStore.userStore.models.size).toBe(4);
    expect(queryClient.rootStore.listStore.models.size).toBe(1);

    expect(queryClient.queryStore.models.size).toBe(9);

    q.listQuery.__MstQueryHandler.setData(null);
    q.itemQuery2.__MstQueryHandler.setData(null);
    await wait();
    q.itemQuery2.__MstQueryHandler.setData(itemData);
    q.listQuery.__MstQueryHandler.setData(listData);
    await wait();
    queryClient.queryStore.removeQuery(q.itemQuery);
    queryClient.queryStore.runGc();
    expect(queryClient.queryStore.models.size).toBe(9);

    queryClient.queryStore.removeQuery(q.listQuery);
    queryClient.queryStore.runGc();
    expect(queryClient.queryStore.models.size).toBe(2);

    queryClient.queryStore.removeQuery(q.itemQuery2);
    queryClient.queryStore.runGc();
    expect(queryClient.queryStore.models.size).toBe(0);
});

test('gc - only walk model props', () => {
    const VolatileModel = types.model({ id: types.identifier });
    const ModelA = types
        .model({
            id: types.identifier,
            modelProp: types.string,
            arr: types.late(() =>
                types.array(types.model({ id: types.identifier, b: types.maybe(types.string) })),
            ),
        })
        .volatile(() => ({
            volatileProp: VolatileModel.create({ id: '2' }),
        }));
    const idents = new Set();
    collectSeenIdentifiers(
        ModelA.create({ id: '1', modelProp: 'hey', arr: [{ id: '3' }] }),
        idents,
    );
    expect(idents.size).toBe(2);
});

test('mutation updates domain model', async () => {
    const { q } = setup();

    await q.itemQuery.query({ request: { id: 'test' } });

    await q.setDescriptionMutation.mutate({ request: { id: 'test', description: 'new' } });

    expect(q.itemQuery.data?.description).toBe('new');
});

test('isLoading state', async () => {
    const { q, queryClient } = setup();

    expect(q.itemQuery.isLoading).toBe(false);
    q.itemQuery.query({ request: { id: 'test' } });
    expect(q.itemQuery.isLoading).toBe(true);

    await when(() => !q.itemQuery.isLoading);
    expect(q.itemQuery.isLoading).toBe(false);

    queryClient.queryStore.clear();
});

test('useQuery', async () => {
    const { q, render } = setup();

    let loadingStates: boolean[] = [false];

    const sub = reaction(
        () => q.itemQuery.isLoading,
        (isLoading) => {
            loadingStates.push(isLoading);
        },
    );

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: 'test' },
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(q.itemQuery.data).not.toBe(null);
    expect(loadingStates).toStrictEqual([false, true, false]);

    sub();
});

describe('useQuery - refetchInterval', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        // Unmount while fake timers are still active, including when an assertion fails.
        cleanup();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const advance = async (milliseconds: number) => {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(milliseconds);
        });
    };

    const setupPolling = ({ strictMode = false } = {}) => {
        const { q, render } = setup({ strictMode });
        const getItem = vi.fn().mockResolvedValue(itemData);

        // Milliseconds, false, or a callback receiving the MST query model.
        type Options = {
            refetchInterval?:
                | number
                | false
                | ((query: typeof q.itemQuery) => number | false | undefined);
            refetchIntervalInBackground?: boolean;
            enabled?: boolean;
            id?: string;
        };

        const Comp = observer(
            ({
                refetchInterval,
                refetchIntervalInBackground,
                enabled = true,
                id = 'test',
            }: Options) => {
                const { data, isRefetching } = useQuery(q.itemQuery, {
                    request: { id },
                    meta: { getItem },
                    staleTime: Infinity,
                    enabled,
                    refetchInterval,
                    refetchIntervalInBackground,
                });
                return (
                    <div>
                        {isRefetching ? 'refetching' : 'ready'}:{data?.description}
                    </div>
                );
            },
        );

        return { q, render, getItem, Comp };
    };

    test.each([false, true])(
        'polls fresh data every interval (strictMode=%s)',
        async (strictMode) => {
            const { render, getItem, Comp } = setupPolling({ strictMode });
            render(<Comp refetchInterval={1000} />);
            await advance(0);
            expect(getItem).toHaveBeenCalledTimes(1);

            await advance(999);
            expect(getItem).toHaveBeenCalledTimes(1);
            await advance(1);
            expect(getItem).toHaveBeenCalledTimes(2);
            await advance(1000);
            expect(getItem).toHaveBeenCalledTimes(3);
        },
    );

    test.each([undefined, false, 0] as const)(
        'does not poll with refetchInterval=%s',
        async (refetchInterval) => {
            const { render, getItem, Comp } = setupPolling();
            render(<Comp refetchInterval={refetchInterval} />);
            await advance(5000);
            expect(getItem).toHaveBeenCalledTimes(1);
        },
    );

    test('only polls a hidden tab when refetchIntervalInBackground is true', async () => {
        const { render, getItem, Comp } = setupPolling();
        const { rerender } = render(<Comp refetchInterval={1000} />);
        await advance(0);
        expect(getItem).toHaveBeenCalledTimes(1);

        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await advance(2000);
        expect(getItem).toHaveBeenCalledTimes(1);

        rerender(<Comp refetchInterval={1000} refetchIntervalInBackground />);
        await advance(2000);
        expect(getItem).toHaveBeenCalledTimes(3);

        rerender(<Comp refetchInterval={1000} refetchIntervalInBackground={false} />);
        await advance(2000);
        expect(getItem).toHaveBeenCalledTimes(3);
    });

    test('updates the interval and can stop and restart polling', async () => {
        const { render, getItem, Comp } = setupPolling();
        const { rerender } = render(<Comp refetchInterval={1000} />);
        await advance(0);
        expect(getItem).toHaveBeenCalledTimes(1);

        rerender(<Comp refetchInterval={2000} />);
        await advance(1999);
        expect(getItem).toHaveBeenCalledTimes(1);
        await advance(1);
        expect(getItem).toHaveBeenCalledTimes(2);

        rerender(<Comp refetchInterval={false} />);
        await advance(5000);
        expect(getItem).toHaveBeenCalledTimes(2);

        rerender(<Comp refetchInterval={500} />);
        await advance(499);
        expect(getItem).toHaveBeenCalledTimes(2);
        await advance(1);
        expect(getItem).toHaveBeenCalledTimes(3);
    });

    test('only polls while enabled', async () => {
        const { render, getItem, Comp } = setupPolling();
        const { rerender } = render(<Comp refetchInterval={1000} enabled={false} />);
        await advance(3000);
        expect(getItem).not.toHaveBeenCalled();

        rerender(<Comp refetchInterval={1000} />);
        await advance(0);
        expect(getItem).toHaveBeenCalledTimes(1);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);

        rerender(<Comp refetchInterval={1000} enabled={false} />);
        await advance(3000);
        expect(getItem).toHaveBeenCalledTimes(2);

        rerender(<Comp refetchInterval={1000} />);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(3);
    });

    test('stops polling after unmount', async () => {
        const { render, getItem, Comp } = setupPolling();
        const { unmount } = render(<Comp refetchInterval={1000} />);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);

        unmount();
        await advance(5000);
        expect(getItem).toHaveBeenCalledTimes(2);
    });

    test('rerendering with the same interval does not postpone polling', async () => {
        const { render, getItem, Comp } = setupPolling();
        const { rerender } = render(<Comp refetchInterval={1000} />);
        await advance(500);
        rerender(<Comp refetchInterval={1000} />);
        await advance(500);
        expect(getItem).toHaveBeenCalledTimes(2);
    });

    test('recomputes the callback without a React observer or component rerender', async () => {
        const { q, render, getItem } = setupPolling();
        getItem
            .mockResolvedValueOnce({ ...itemData, description: 'pending' })
            .mockResolvedValueOnce({ ...itemData, description: 'done' });
        const Comp = () => {
            useQuery(q.itemQuery, {
                request: { id: 'test' },
                meta: { getItem },
                refetchInterval: (query) => (query.data?.description === 'done' ? false : 1000),
            });
            return null;
        };
        render(<Comp />);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(q.itemQuery.data?.description).toBe('done');
        await advance(3000);
        expect(getItem).toHaveBeenCalledTimes(2);
    });

    test('moves polling to the new query when the query instance changes', async () => {
        const { q, render, getItem } = setupPolling();
        const Comp = ({ query }: { query: typeof q.itemQuery }) => {
            useQuery(query, {
                request: { id: 'test' },
                meta: { getItem },
                staleTime: Infinity,
                refetchInterval: 1000,
            });
            return null;
        };
        const { rerender } = render(<Comp query={q.itemQuery} />);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);

        rerender(<Comp query={q.itemQuery2} />);
        await advance(0);
        expect(getItem).toHaveBeenCalledTimes(3);
        getItem.mockClear();
        await advance(2000);
        expect(getItem).toHaveBeenCalledTimes(2);
        for (const [args] of getItem.mock.calls) {
            expect(args.query).toBe(q.itemQuery2);
        }
    });

    test('polls with the latest request and preserves meta', async () => {
        const { render, getItem, Comp } = setupPolling();
        const { rerender } = render(<Comp refetchInterval={1000} />);
        await advance(0);

        rerender(<Comp refetchInterval={1000} id="different-test" />);
        await advance(0);
        expect(getItem).toHaveBeenCalledTimes(2);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(3);
        expect(getItem).toHaveBeenLastCalledWith(
            expect.objectContaining({
                request: expect.objectContaining({ id: 'different-test' }),
                meta: expect.objectContaining({ getItem }),
            }),
        );
    });

    test('exposes refetching state and updates data without overlapping a pending request', async () => {
        const { q, render, getItem, Comp } = setupPolling();
        let resolveNext!: (data: typeof itemData) => void;
        getItem.mockResolvedValueOnce(itemData).mockImplementationOnce(
            () =>
                new Promise<typeof itemData>((resolve) => {
                    resolveNext = resolve;
                }),
        );
        const { container } = render(<Comp refetchInterval={1000} />);
        await advance(0);

        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(q.itemQuery.isRefetching).toBe(true);
        expect(container.textContent).toBe(`refetching:${itemData.description}`);
        await advance(3000);
        expect(getItem).toHaveBeenCalledTimes(2);

        await act(async () => {
            resolveNext({ ...itemData, description: 'polled' });
        });
        expect(q.itemQuery.isRefetching).toBe(false);
        expect(container.textContent).toBe('ready:polled');
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(3);
    });

    test('recomputes the callback interval from query data and stops when it returns false', async () => {
        const { q, render, getItem, Comp } = setupPolling();
        getItem
            .mockResolvedValueOnce({ ...itemData, description: 'pending' })
            .mockResolvedValueOnce({ ...itemData, description: 'processing' })
            .mockResolvedValueOnce({ ...itemData, description: 'done' });
        const refetchInterval = vi.fn((query: typeof q.itemQuery) => {
            if (query.data?.description === 'done') return false;
            return query.data?.description === 'processing' ? 2000 : 1000;
        });
        render(<Comp refetchInterval={refetchInterval} />);
        await advance(0);
        expect(refetchInterval).toHaveBeenCalledWith(q.itemQuery);

        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(q.itemQuery.data?.description).toBe('processing');
        await advance(1999);
        expect(getItem).toHaveBeenCalledTimes(2);
        await advance(1);
        expect(getItem).toHaveBeenCalledTimes(3);
        expect(q.itemQuery.data?.description).toBe('done');
        await advance(5000);
        expect(getItem).toHaveBeenCalledTimes(3);
    });

    test('disables polling when the callback returns undefined', async () => {
        const { q, render, getItem, Comp } = setupPolling();
        const refetchInterval = vi.fn((query: typeof q.itemQuery) => undefined);
        render(<Comp refetchInterval={refetchInterval} />);
        await advance(5000);
        expect(refetchInterval).toHaveBeenCalledWith(q.itemQuery);
        expect(getItem).toHaveBeenCalledTimes(1);
    });

    test('continues polling after an error and clears the error on success', async () => {
        const { q, render, getItem, Comp } = setupPolling();
        const error = new Error('Temporarily unavailable');
        getItem.mockResolvedValueOnce(itemData).mockRejectedValueOnce(error);
        render(<Comp refetchInterval={1000} />);
        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(2);
        expect(q.itemQuery.error).toBe(error);

        await advance(1000);
        expect(getItem).toHaveBeenCalledTimes(3);
        expect(q.itemQuery.error).toBe(null);
    });
});

test('useMutation', async () => {
    const { render, q, rootStore } = setup();

    let loadingStates: boolean[] = [false];

    const sub = reaction(
        () => q.addItemMutation.isLoading,
        (isLoading) => {
            loadingStates.push(isLoading);
        },
    );

    const Comp = observer(() => {
        useInfiniteQuery(q.listQuery);
        const [add] = useMutation(q.addItemMutation);
        return (
            <div>
                <button
                    type="button"
                    data-testid="add"
                    onClick={() => {
                        add({
                            request: { path: 'test', message: 'new message' },
                            optimisticUpdate() {
                                const item = rootStore.itemStore.merge({ ...itemData, id: 'temp' });
                                q.listQuery.data?.addItem(item);
                            },
                        });
                    }}>
                    Button
                </button>
            </div>
        );
    });

    const { findByTestId } = render(<Comp />);

    await wait(0);
    expect(q.listQuery.data?.items.length).toBe(4);

    const button = await findByTestId('add');

    fireEvent.click(button);
    expect(q.listQuery.data?.items[4].id).toBe('temp');
    expect(q.listQuery.data?.items.length).toBe(5);
    await wait(0);
    expect(q.listQuery.data?.items[4].id!).toBe('add-test');
    expect(q.listQuery.data?.items.length).toBe(5);

    expect(loadingStates).toStrictEqual([false, true, false]);

    sub();
});

test('useQuery - reactive request', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    const Comp = observer(() => {
        const { query } = useQuery(q.itemQuery, {
            request: { id: id.get() },
            staleTime: 0,
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);
    expect(q.itemQuery.data?.id).toBe('test');

    id.set('different-test');
    await wait(0);
    expect(q.itemQuery.data?.id).toBe('different-test');
    expect(q.itemQuery.variables.request?.id).toBe('different-test');

    configureMobx({ enforceActions: 'observed' });
});

test('useQuery - placeholderData keeps previous data while a changed request is in flight', async () => {
    const { render, q } = setup();
    let resolveNext!: (data: typeof itemData) => void;
    const nextResponse = new Promise<typeof itemData>((resolve) => {
        resolveNext = resolve;
    });
    const getItem = vi.fn().mockResolvedValueOnce(itemData).mockReturnValueOnce(nextResponse);
    const placeholderData = vi.fn((previousData: typeof q.itemQuery.data) => previousData);

    const Comp = observer(({ id }: { id: string }) => {
        const { data, isLoading } = useQuery(q.itemQuery, {
            request: { id },
            meta: { getItem },
            placeholderData: (previousData) => placeholderData(previousData),
        });
        return <div>{isLoading ? 'loading' : 'ready'}:{data?.id ?? 'empty'}</div>;
    });
    const { container, rerender, unmount } = render(<Comp id="test" />);

    await act(async () => {
        await when(() => !q.itemQuery.isLoading);
    });
    expect(container.textContent).toBe('ready:test');
    const previousData = q.itemQuery.data;
    placeholderData.mockClear();

    rerender(<Comp id="different-test" />);

    expect(getItem).toHaveBeenCalledTimes(2);
    expect(q.itemQuery.isLoading).toBe(true);
    expect.soft(placeholderData).toHaveBeenCalledWith(previousData);
    expect.soft(container.textContent).toBe('loading:test');

    await act(async () => {
        resolveNext({ ...itemData, id: 'different-test' });
        await when(() => !q.itemQuery.isLoading);
    });
    expect(container.textContent).toBe('ready:different-test');
    expect(q.itemQuery.data?.id).toBe('different-test');
    unmount();
});

test.each([
    { kind: 'value', cacheKey: undefined },
    { kind: 'callback', cacheKey: undefined },
    { kind: 'value', cacheKey: 'test' },
    { kind: 'callback', cacheKey: 'test' },
])(
    'useQuery - placeholderData accepts a custom $kind with cacheKey=$cacheKey until the response arrives',
    async ({ kind, cacheKey }) => {
        const { render, q, queryClient } = setup();
        const placeholder = { ...itemData, id: 'placeholder' };
        let resolveResponse!: (data: typeof itemData) => void;
        const response = new Promise<typeof itemData>((resolve) => {
            resolveResponse = resolve;
        });
        const getItem = vi.fn(() => response);

        const Comp = observer(() => {
            const { data, isLoading } = useQuery(q.itemQuery, {
                request: { id: 'test' },
                meta: { getItem },
                cacheKey,
                cacheTime: 1000,
                placeholderData: kind === 'value' ? placeholder : () => placeholder,
            });
            return <div>{isLoading ? 'loading' : 'ready'}:{data?.id ?? 'empty'}</div>;
        });
        const { container, unmount } = render(<Comp />);

        expect(getItem).toHaveBeenCalledTimes(1);
        expect(q.itemQuery.isLoading).toBe(true);
        expect(q.itemQuery.isFetched).toBe(false);
        expect(q.itemQuery.cachedAt).toBeUndefined();
        expect(queryClient.queryStore.getQueryData(ItemQuery, 'test')).toBeUndefined();
        expect.soft(container.textContent).toBe('loading:placeholder');
        expect(q.itemQuery.data?.id).toBe('placeholder');

        await act(async () => {
            resolveResponse(itemData);
            await when(() => !q.itemQuery.isLoading);
        });
        expect(container.textContent).toBe('ready:test');
        expect(q.itemQuery.data?.id).toBe('test');
        expect(q.itemQuery.isFetched).toBe(true);
        if (cacheKey) {
            expect(queryClient.queryStore.getQueryData(ItemQuery, cacheKey)?.data.id).toBe('test');
            queryClient.queryStore.removeQueryData(ItemQuery, cacheKey);
        }
        unmount();
    },
);

test('useQuery - placeholderData is only shown while an enabled query is in flight', async () => {
    const { render, q } = setup();
    const error = new Error('Request failed');
    let rejectResponse!: (error: Error) => void;
    const response = new Promise<typeof itemData>((_, reject) => {
        rejectResponse = reject;
    });
    const getItem = vi.fn(() => response);
    const placeholderData = vi.fn(() => ({ ...itemData, id: 'placeholder' }));
    const Comp = observer(({ enabled }: { enabled: boolean }) => {
        const { data } = useQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem },
            enabled,
            placeholderData,
        });
        return <div>{data?.id ?? 'empty'}</div>;
    });
    const { container, rerender, unmount } = render(<Comp enabled={false} />);
    expect(container.textContent).toBe('empty');
    expect(getItem).not.toHaveBeenCalled();
    expect(placeholderData).not.toHaveBeenCalled();

    rerender(<Comp enabled />);
    expect(container.textContent).toBe('placeholder');
    expect(placeholderData).toHaveBeenCalledWith(null);

    await act(async () => {
        rejectResponse(error);
        await when(() => !q.itemQuery.isLoading);
    });
    expect(container.textContent).toBe('empty');
    expect(q.itemQuery.error).toBe(error);
    expect(q.itemQuery.isFetched).toBe(false);
    unmount();
});

test('useQuery - cached data takes precedence over placeholderData during a refetch', async () => {
    const { render, q, queryClient } = setup();
    q.itemQuery.setData(itemData, { cacheKey: 'test', cacheTime: 1000 });
    let resolveResponse!: (data: typeof itemData) => void;
    const response = new Promise<typeof itemData>((resolve) => {
        resolveResponse = resolve;
    });
    const getItem = vi.fn(() => response);
    const placeholderData = vi.fn(() => ({ ...itemData, id: 'placeholder' }));
    const Comp = observer(() => {
        const { data } = useQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem },
            cacheKey: 'test',
            staleTime: 0,
            placeholderData,
        });
        return <div>{data?.id ?? 'empty'}</div>;
    });
    const { container, unmount } = render(<Comp />);
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('test');
    expect(placeholderData).not.toHaveBeenCalled();

    await act(async () => {
        resolveResponse(itemData);
        await response;
    });
    expect(container.textContent).toBe('test');
    unmount();
    queryClient.queryStore.removeQueryData(ItemQuery, 'test');
});

test('useQuery - cacheKey and cacheTime', async () => {
    const { render, q, queryClient } = setup();

    configureMobx({ enforceActions: 'never' });

    const getItem = vi.fn(({ request }) => api.getItem({ request }));
    const testApi = {
        ...api,
        getItem,
    };

    let id = observable.box('test');
    const Comp = observer(() => {
        const { query } = useQuery(q.itemQuery, {
            request: { id: id.get() },
            cacheKey: id.get(),
            cacheTime: 25,
            staleTime: 25,
            meta: { getItem: testApi.getItem },
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);
    expect(q.itemQuery.data?.id).toBe('test');

    id.set('different-test');
    await wait(0);
    expect(q.itemQuery.data?.id).toBe('different-test');
    expect(q.itemQuery.variables.request?.id).toBe('different-test');

    id.set('test');
    await wait(0);
    expect(q.itemQuery.data?.id).toBe('test');
    expect(getItem).toHaveBeenCalledTimes(2);

    await wait(50);
    queryClient.queryStore.runGc();
    await wait(0);

    id.set('different-test');
    await wait(0);
    expect(q.itemQuery.data?.id).toBe('different-test');
    expect(getItem).toHaveBeenCalledTimes(3);

    configureMobx({ enforceActions: 'observed' });
});

test.each([
    { name: 'undefined', pagination: undefined },
    { name: 'explicit', pagination: { offset: 4 } },
])('useInfiniteQuery - $name hook pagination preserves existing model pagination', async ({ pagination }) => {
    const { render, q } = setup();
    const getItems = vi.fn(({ pagination }) => api.getItems({ pagination }));

    await q.listQuery.query({
        pagination: { offset: 4 },
        meta: { getItems },
    });
    expect(getSnapshot(q.listQuery.variables.pagination!)).toEqual({ offset: 4 });
    getItems.mockClear();

    const Comp = observer(() => {
        useInfiniteQuery(q.listQuery, {
            pagination,
            refetchOnMount: 'always',
            meta: { getItems },
        });
        return <div></div>;
    });

    render(<Comp />);
    await wait(0);

    expect(getItems).toHaveBeenCalledTimes(1);
    expect(getSnapshot(getItems.mock.calls[0][0].pagination)).toEqual({ offset: 4 });
    expect(getSnapshot(q.listQuery.variables.pagination!)).toEqual({ offset: 4 });
    expect(q.listQuery.error).toBe(null);
    expect(q.listQuery.isLoading).toBe(false);
    expect(q.listQuery.isRefetching).toBe(false);
});

test('onQueryMore', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const customApi = {
        ...api,
        async getItems(options: any) {
            if (!q.listQuery.isFetched) {
                return listData;
            }
            return api.getItems(options);
        },
    };

    let isFetchingMoreStates: boolean[] = [false];
    reaction(
        () => q.listQuery.isFetchingMore,
        (isFetchingMore) => isFetchingMoreStates.push(isFetchingMore),
    );

    let offset = observable.box(0);

    const Comp = observer(() => {
        useInfiniteQuery(q.listQuery, {
            pagination: { offset: offset.get() },
            meta: { getItems: customApi.getItems },
        });
        return <div></div>;
    });
    render(<Comp />);

    await when(() => q.listQuery.isFetched);

    offset.set(4);
    await wait(0);
    await when(() => !q.listQuery.isFetchingMore);
    expect(q.listQuery.isLoading).toBe(false);

    expect(isFetchingMoreStates).toEqual([false, true, false]);
    expect(q.listQuery.data?.items.length).toBe(7);

    configureMobx({ enforceActions: 'observed' });
});

test('onQueryMore is called for every parallel queryMore request', async () => {
    const { q } = setup();

    let resolveFirst!: (data: typeof listData) => void;
    let resolveSecond!: (data: typeof listData) => void;
    const firstResponse = new Promise<typeof listData>((resolve) => {
        resolveFirst = resolve;
    });
    const secondResponse = new Promise<typeof listData>((resolve) => {
        resolveSecond = resolve;
    });
    const getItems = vi.fn(({ pagination }) =>
        pagination.offset === 4 ? firstResponse : secondResponse,
    );
    const onQueryMore = vi.spyOn(q.listQuery.__MstQueryHandler.options, 'onQueryMore');

    const first = q.listQuery.queryMore({ pagination: { offset: 4 }, meta: { getItems } });
    const second = q.listQuery.queryMore({ pagination: { offset: 8 }, meta: { getItems } });

    resolveSecond(listData);
    await second;
    expect(onQueryMore).toHaveBeenCalledTimes(1);
    expect(q.listQuery.isFetchingMore).toBe(true);

    resolveFirst(listData);
    await first;
    expect(onQueryMore).toHaveBeenCalledTimes(2);
    expect(onQueryMore).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ pagination: { offset: 8 } }),
    );
    expect(onQueryMore).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ pagination: { offset: 4 } }),
    );
    expect(q.listQuery.isFetchingMore).toBe(false);
});

test('useQuery - with error', async () => {
    const { render, q } = setup();

    let err: any = null;
    const customError = new Error();
    const apiWithError = {
        async getItem() {
            throw customError;
        },
    };

    const Comp = observer(() => {
        const { error } = useQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem: apiWithError.getItem },
        });
        err = error;
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(err).toEqual(customError);
});

test('model with optional identifier', async () => {
    const { render, q, queryClient } = setup();

    const customApi = {
        ...api,
        async getItems() {
            const data: any = {
                ...listData,
            };
            delete data.id;
            return data;
        },
    };

    const Comp = observer(() => {
        const { query } = useInfiniteQuery(q.listQuery, {
            request: { id: 'test' },
            meta: { getItems: customApi.getItems },
        });
        return <div></div>;
    });
    render(<Comp />);

    await when(() => !q.listQuery.isLoading);

    const model = queryClient.queryStore.models.get('ListModel:optional-1');
    expect(model).not.toBe(undefined);
});

test('refetching query', async () => {
    const { q } = setup();

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    await q.itemQuery.query({ request: { id: 'test' }, meta: { getItem: testApi.getItem } });

    await q.setDescriptionMutation.mutate({ request: { id: 'test', description: 'new' } });
    await q.itemQuery.refetch();

    expect(getItem).toHaveBeenCalledTimes(2);
    expect(q.itemQuery.data?.description).toBe('Test item');
});

test('mutation updates query (with optimistic update)', async () => {
    const { q, rootStore } = setup();

    await q.listQuery.query();
    expect(q.listQuery.data?.items.length).toBe(4);

    q.addItemMutation.mutate({
        request: { path: 'test', message: 'testing' },
        optimisticUpdate() {
            const item = rootStore.itemStore.merge({ ...itemData, id: 'temp' });
            q.listQuery.data?.addItem(item);
        },
    });

    expect(q.listQuery.data?.items[4].id).toBe('temp');

    await when(() => !q.addItemMutation.isLoading);

    expect(q.listQuery.data?.items[4].id).toBe('add-test');
    expect(q.listQuery.data?.items.length).toBe(5);
});

test('optimisticUpdate with revert-none keeps changes on success', async () => {
    const { q } = setup();

    await q.listQuery.query();
    expect(q.listQuery.data?.items.length).toBe(4);

    const item = q.listQuery.data?.items[1];
    await q.removeItemMutation.mutate({
        request: { id: item!.id },
        optimisticUpdate() {
            q.listQuery.data?.removeItem(item);
        },
        revert: 'revert-none',
    });

    expect(q.listQuery.data?.items.length).toBe(3);
});

test('optimisticUpdate with revert-on-error keeps changes on success', async () => {
    const { q } = setup();

    await q.listQuery.query();
    expect(q.listQuery.data?.items.length).toBe(4);

    const item = q.listQuery.data?.items[1];
    await q.removeItemMutation.mutate({
        request: { id: item!.id },
        optimisticUpdate() {
            q.listQuery.data?.removeItem(item);
        },
        revert: 'revert-on-error',
    });

    expect(q.listQuery.data?.items.length).toBe(3);
});

test('optimisticUpdate with revert-on-error reverts changes on error', async () => {
    const { q } = setup();

    await q.listQuery.query();
    expect(q.listQuery.data?.items.length).toBe(4);

    const item = q.listQuery.data?.items[1];
    const { error } = await q.removeItemMutation.mutate({
        request: { id: item!.id },
        optimisticUpdate() {
            q.listQuery.data?.removeItem(item);
        },
        revert: 'revert-on-error',
        meta: {
            removeItem() {
                throw new Error('failed to remove');
            },
        },
    });

    expect(error).toBeTruthy();
    expect(q.listQuery.data?.items.length).toBe(4);
});

test('merge of date objects', () => {
    const { queryClient } = setup();

    configureMobx({ enforceActions: 'never' });

    merge(
        {
            id: 'test',
            changed: {
                at: new Date('2020-02-02'),
            },
        },
        DateModel,
        queryClient.config.env,
    );
    const result = merge(
        {
            id: 'test',
            changed: {
                at: new Date('2020-03-03'),
            },
        },
        DateModel,
        queryClient.config.env,
    );
    expect((getSnapshot(result) as any).changed.at).toBe(1583193600000);

    configureMobx({ enforceActions: 'observed' });
});

test('deep update of object', () => {
    const { queryClient, rootStore } = setup();

    configureMobx({ enforceActions: 'never' });

    const a = DeepModelA.create({}, queryClient.config.env);
    unprotect(rootStore);
    rootStore.serviceStore.deepModelA = a;

    const result = merge(
        { model: { a: 'banana' }, ref: { id: '1', a: 'fruit' } },
        DeepModelA,
        queryClient.config.env,
    );
    applySnapshot(a, result);
    const result2 = merge(
        { model: { a: 'banana', b: 'apple' }, ref: { id: '1', a: 'orange' } },
        DeepModelA,
        queryClient.config.env,
    );

    applySnapshot(a, result2);

    expect(a.model?.a).toBe('banana');
    expect(a.model?.b).toBe('apple');
    expect(a.ref?.a).toBe('orange');

    configureMobx({ enforceActions: 'observed' });
});

test('merge frozen type', () => {
    const { rootStore } = setup();

    rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
        id: 'test',
        frozen: { data1: 'data1', data2: 'data2' },
    });

    expect(() =>
        rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
            id: 'test',
            frozen: { data1: 'data1', data2: 'data2' },
        }),
    ).not.toThrow();
});

test('replace arrays on sub properties', () => {
    const { rootStore } = setup();

    rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
        id: 'test',
        prop: { ids: [{ baha: 'hey' }, { baha: 'hello' }] },
    });
    rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
        id: 'test',
        prop: { ids: [{ baha: 'hey2' }, { baha: 'hello2' }] },
    });
    expect(rootStore.serviceStore.frozenQuery.data?.prop?.ids[0].baha).toBe('hey2');
});

test('merge with undefined data and union type', () => {
    const { rootStore } = setup();

    expect(() =>
        rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
            id: 'test',
            folderPath: 'test',
            origin: undefined,
        }),
    ).not.toThrow();
});

test('findAll', () => {
    const { q, queryClient } = setup();

    q.itemQuery.query({ request: { id: 'test' } });

    const queries = queryClient.queryStore.getQueries(
        ItemQuery,
        (query) => !!query.variables.request?.id.includes('t'),
    );
    expect(queries.length).toBe(1);

    const queries2 = queryClient.queryStore.getQueries(
        ItemQuery,
        (query) => !!query.variables.request?.id.includes('o'),
    );
    expect(queries2.length).toBe(0);
});

test('caching - stale time', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    const Comp = observer(() => {
        const { query } = useQuery(q.itemQuery, {
            request: { id: 'test' },
            staleTime: 1,
            meta: { getItem: testApi.getItem },
        });
        return <div></div>;
    });

    let show = observable.box(true);
    const Wrapper = observer(() => {
        if (show.get()) {
            return <Comp />;
        }
        return null;
    });

    render(<Wrapper />);
    await when(() => !q.itemQuery.isLoading);

    show.set(false);
    await wait(0);
    show.set(true);

    expect(q.itemQuery.data?.createdBy.name).toBe('Kim');
    expect(getItem).toBeCalledTimes(1);

    configureMobx({ enforceActions: 'observed' });
});

test('hook - handle async return values in different order', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const getItems = vi.fn(() => Promise.resolve(listData));

    let counter = 0;
    const testApi = {
        ...api,
        getItems: async () => {
            counter += 1;
            if (counter === 1) {
                await wait(1);
                return getItems();
            } else if (counter > 1) {
                return {
                    id: 'list-1',
                    items: [],
                };
            }
        },
    };

    let id = observable.box('test');

    const Comp = observer(() => {
        useInfiniteQuery(q.listQuery, {
            request: { id: id.get() },
            meta: { getItems: testApi.getItems },
        });
        return <div></div>;
    });
    render(<Comp />);

    id.set('test2');

    await wait(2);

    expect(q.listQuery.data?.items.length).toBe(0);

    configureMobx({ enforceActions: 'observed' });
});

test('hook - enabled prop', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const enabled = observable.box(false);

    const Comp = observer(() => {
        const { query } = useInfiniteQuery(q.listQuery, {
            pagination: { offset: 0 },
            enabled: enabled.get(),
        });
        return <div></div>;
    });

    render(<Comp />);

    expect(q.listQuery.isFetched).toBe(false);

    enabled.set(true);

    await when(() => q.listQuery.isLoading);
    await when(() => !q.listQuery.isLoading);

    expect(q.listQuery.isFetched).toBe(true);

    configureMobx({ enforceActions: 'observed' });
});

test('hook - enabled & refetchOnChanged none', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const enabled = observable.box(false);

    const Comp = observer(() => {
        const { query } = useInfiniteQuery(q.listQuery, {
            pagination: { offset: 0 },
            enabled: enabled.get(),
            refetchOnChanged: 'none',
        });
        return <div></div>;
    });

    render(<Comp />);

    expect(q.listQuery.isFetched).toBe(false);

    enabled.set(true);

    await when(() => q.listQuery.isLoading);
    await when(() => !q.listQuery.isLoading);

    expect(q.listQuery.isFetched).toBe(true);

    configureMobx({ enforceActions: 'observed' });
});

test('base array type', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const Comp = observer(() => {
        useQuery(q.arrayQuery);
        return <div></div>;
    });

    render(<Comp />);

    expect(q.arrayQuery.error).toBe(null);

    configureMobx({ enforceActions: 'observed' });
});

test('support map type', () => {
    const { rootStore } = setup();

    rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
        id: 'test',
        amountLimit: {
            tag: 'Limited',
            content: {
                native: {
                    tag: 'Limited',
                    content: '1000000',
                },
            },
        },
    });

    expect(rootStore.serviceStore.frozenQuery.data?.amountLimit?.content?.get('native')?.tag).toBe(
        'Limited',
    );
});

test('merge with partial data', () => {
    const { rootStore } = setup();

    expect(() =>
        rootStore.serviceStore.frozenQuery.__MstQueryHandler.setData({
            id: 'test',
            origin: 'a',
            optionalProps1: 'optional',
            optionalProps2: ['optional'],
            optionalProps3: { a: 'a' },
        }),
    ).not.toThrow();
    expect(rootStore.serviceStore.frozenQuery.data?.id).toBe('test');
    expect(rootStore.serviceStore.frozenQuery.data?.origin).toBe('a');
    expect(rootStore.serviceStore.frozenQuery.data).not.toHaveProperty('optionalProps1');
    expect(rootStore.serviceStore.frozenQuery.data).not.toHaveProperty('optionalProps2');
    expect(rootStore.serviceStore.frozenQuery.data).not.toHaveProperty('optionalProps3');
});

test('subscription query', async () => {
    const { q } = setup();

    let meta = { updater: undefined } as any;
    await q.subscriptionQuery.query({
        request: { id: 'test' },
        meta,
    });
    expect(q.subscriptionQuery.isLoading).toBe(false);

    meta.updater(itemData);
    expect(q.subscriptionQuery.data?.count).toBe(4);

    meta.updater({
        ...itemData,
        count: 5,
    });

    expect(q.subscriptionQuery.data?.count).toBe(5);
});

test('volatile query', async () => {
    const { render } = setup();

    const text = 'testing';

    let renders = 0;
    const Comp = observer(() => {
        const { query, data } = useVolatileQuery({
            request: { data: text },
            async endpoint({ request }) {
                return { testing: request.data };
            },
        });
        renders++;
        if (!data) {
            return null;
        }
        return <div>{data.testing}</div>;
    });

    const { findByText } = render(<Comp />);
    await wait(0);

    await findByText(text);

    expect(renders).toBe(3);
});

test('request with optional values', async () => {
    const { render, q } = setup();

    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQueryWihthOptionalRequest, {
            request: { id: 'test' },
            meta: { getItem },
        });
        return <div></div>;
    });
    render(<Comp />);

    expect((getItem.mock.calls[0] as any)[0].request.filter).toBe(null);
});

test('request with optional values', async () => {
    const { render, q } = setup();

    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQueryWihthOptionalRequest, {
            request: { id: 'test' },
            meta: { getItem },
        });
        return <div></div>;
    });
    render(<Comp />);

    expect((getItem.mock.calls[0] as any)[0].request.filter).toBe(null);
});

test('set data to null when request changes', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');

    let d: any;
    const Comp = observer(() => {
        const { data } = useQuery(q.itemQuery, {
            request: { id: id.get() },
            staleTime: 1,
            meta: { getItem: api.getItem },
        });
        d = data;
        return <div></div>;
    });

    const { unmount } = render(<Comp />);
    await wait(0);

    expect(d.id).toBe('test');
    unmount();

    id.set('different-test');
    render(<Comp />);
    expect(d).toBe(null);
    await wait(0);

    expect(d.id).toBe('different-test');

    configureMobx({ enforceActions: 'observed' });
});

test('safeReference', async () => {
    const { render, q, rootStore } = setup();

    configureMobx({ enforceActions: 'never' });

    const Comp = observer(() => {
        useQuery(q.safeReferenceQuery);
        return <div></div>;
    });

    render(<Comp />);

    await wait(0);

    expect(q.safeReferenceQuery.data?.items.length).toBe(4);

    q.removeItemMutation.mutate({ request: { id: 'test' } });

    await wait(0);

    expect(q.safeReferenceQuery.data?.items.length).toBe(3);

    configureMobx({ enforceActions: 'observed' });
});

test('change query in useQuery', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let query = observable.box(q.itemQuery);

    const Comp = observer(() => {
        useQuery(query.get(), {
            request: { id: 'test' },
            meta: { getItem: api.getItem },
        });
        return <div></div>;
    });

    render(<Comp />);
    await wait(0);

    query.set(q.itemQuery2);
    await wait(10);

    expect(query.get().data).not.toBe(null);

    configureMobx({ enforceActions: 'observed' });
});

test('useQuery should not run when initialData is passed and staleTime is larger than 0', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    const initialData = await api.getItem({ request: { id: id.get() } });

    let loadingStates: boolean[] = [];
    const isLoadingReaction = reaction(
        () => q.itemQuery.isLoading,
        (isLoading) => {
            loadingStates.push(isLoading);
        },
    );

    let dataStates: any[] = [];
    const dataReaction = reaction(
        () => q.itemQuery.data,
        (data: any) => {
            dataStates.push(data ? data.id : null);
        },
    );

    const Comp = observer(() => {
        const { query, isLoading } = useQuery(q.itemQuery, {
            initialData,
            request: { id: id.get() },
            staleTime: 10,
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(loadingStates).toEqual([]);
    expect(dataStates).toEqual(['test']);
    expect(q.itemQuery.data?.id).toBe('test');

    id.set('different-test');
    await wait(0);

    expect(q.itemQuery.data?.id).toBe('different-test');
    expect(q.itemQuery.variables.request?.id).toBe('different-test');
    expect(loadingStates).toEqual([true, false]);
    expect(dataStates).toEqual(['test', null, 'different-test']);

    isLoadingReaction();
    dataReaction();

    configureMobx({ enforceActions: 'observed' });
});

test('useQuery should run when initialData is passed and initialDataUpdatedAt is older than staleTime', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    const initialData = await api.getItem({ request: { id: id.get() } });
    const initialDataUpdatedAt = Date.now() - 1000;

    const loadingStates: boolean[] = [];
    const Comp = observer(() => {
        const { query, isLoading } = useQuery(q.itemQuery, {
            initialData,
            initialDataUpdatedAt,
            request: { id: id.get() },
            staleTime: 500,
        });
        loadingStates.push(isLoading);
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(loadingStates).toEqual([false, true, false]);
    expect(q.itemQuery.data?.id).toBe('test');

    id.set('different-test');
    await wait(0);
    expect(q.itemQuery.data?.id).toBe('different-test');
    expect(q.itemQuery.variables.request?.id).toBe('different-test');

    configureMobx({ enforceActions: 'observed' });
});

test('useQuery should run when initialData is given and invalidate is called', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    const initialData = await api.getItem({ request: { id: id.get() } });

    const loadingStates: boolean[] = [];
    const disposer = autorun(() => {
        loadingStates.push(q.itemQuery.isLoading);
    });

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            initialData,
            request: { id: id.get() },
            staleTime: 500,
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    q.itemQuery.invalidate();

    await wait(10);

    expect(loadingStates).toEqual([false, true, false]);

    disposer();
    configureMobx({ enforceActions: 'observed' });
});

test('useQuery should set initialData when enabled is false', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    const initialData = await api.getItem({ request: { id: id.get() } });

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            initialData,
            enabled: false,
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(q.itemQuery.data?.id).toBe('test');

    configureMobx({ enforceActions: 'observed' });
});

test('refetchOnRequestChanged function', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    let id2 = observable.box('test2');

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: id.get(), id2: id2.get() },
            refetchOnChanged({ prevRequest }) {
                return prevRequest.id !== id.get();
            },
            staleTime: 5000,
            meta: { getItem: testApi.getItem },
        });
        return <div></div>;
    });

    render(<Comp />);
    await wait(0);

    expect(getItem).toHaveBeenCalledTimes(1);

    id.set('different-test');
    await wait(0);

    expect(getItem).toHaveBeenCalledTimes(2);

    id2.set('different-test2');
    await wait(0);

    expect(getItem).toHaveBeenCalledTimes(2);

    configureMobx({ enforceActions: 'observed' });
});

test('refetchOnMount & refetchOnRequestChanged', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    let id = observable.box('test');

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: id.get() },
            refetchOnMount: 'always',
            refetchOnChanged: 'none',
            staleTime: 5000,
            meta: { getItem: testApi.getItem },
        });
        return <div></div>;
    });

    const { unmount } = render(<Comp />);
    await wait(0);
    unmount();

    render(<Comp />);
    await wait(0);

    expect(getItem).toHaveBeenCalledTimes(2);

    id.set('different-test');
    await wait(0);

    expect(getItem).toHaveBeenCalledTimes(2);

    configureMobx({ enforceActions: 'observed' });
});

test('abort - should not surface AbortError to the user', async () => {
    const { q } = setup();

    const abortEndpoint = ({ signal }: any) => {
        return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
                const err = new DOMException('The operation was aborted.', 'AbortError');
                reject(err);
            });
        });
    };

    const queryPromise = q.itemQuery.query({
        request: { id: 'test' },
        meta: { getItem: abortEndpoint },
    });

    // Abort the in-flight request
    q.itemQuery.__MstQueryHandler.abort();

    const { data, error } = await queryPromise;

    expect(error).toBeNull();
    expect(data).toBeNull();
    expect(q.itemQuery.__MstQueryHandler.error).toBeNull();
});

test('invalidate', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: id.get() },
            staleTime: 10,
            meta: { getItem: testApi.getItem },
        });
        return <div></div>;
    });

    const { unmount } = render(<Comp />);
    await wait(0);
    unmount();

    q.itemQuery.invalidate();
    expect(getItem).toHaveBeenCalledTimes(1);

    render(<Comp />);
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(2);

    q.itemQuery.data?.setDescription('new description');

    q.itemQuery.invalidate();
    expect(getItem).toHaveBeenCalledTimes(3);

    await wait(0);

    expect(q.itemQuery.data?.description).toBe('Test item');

    configureMobx({ enforceActions: 'observed' });
});

test('stable identity for hook callbacks', async () => {
    const { render, q } = setup();

    const runSideEffect = vi.fn();

    const Comp = observer(() => {
        const [add] = useMutation(q.addItemMutation);
        React.useEffect(() => {
            runSideEffect();
        }, [add]);
        return <div></div>;
    });

    render(<Comp />);
    await wait(0);

    q.addItemMutation.mutate({ request: { message: 'test', path: 'test' } });

    await wait(0);

    expect(runSideEffect).toHaveBeenCalledTimes(1);
});

test('imperative api - basic error', async () => {
    const { q } = setup();

    const { error } = await q.errorMutation.mutate({ request: {} });

    expect(error.message).toBe('Server side error');
});

test('render null when request changes', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');

    let dataStates: any[] = [];
    const sub = reaction(
        () => q.itemQuery.data,
        (data: any) => {
            dataStates.push(data);
        },
    );

    const Comp = observer(() => {
        const { data } = useQuery(q.itemQuery, {
            request: { id: id.get() },
        });
        return <div></div>;
    });

    render(<Comp />);
    await wait(0);

    expect(dataStates.length).toBe(1);

    id.set('different-test');
    await wait(0);

    expect(dataStates[1]).toBe(null);
    expect(dataStates[2].id).toBe('different-test');

    configureMobx({ enforceActions: 'observed' });
});

test('only fetch once in strict mode', async () => {
    const { q, render } = setup({ strictMode: true });

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: 'test' },
            meta: { getItem: testApi.getItem },
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(getItem).toHaveBeenCalledTimes(1);
});

test('initial data should only be set on mount', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    let trigger = observable.box(1);
    const initialDataResult = await api.getItems();
    const initialData = { ...initialDataResult, id: 'list-initial' };

    let renderCount = 0;
    const Comp = observer(() => {
        const { query } = useInfiniteQuery(q.listQuery, {
            initialData,
            staleTime: 10,
        });
        renderCount++;
        return (
            <div>
                <div>
                    {query.data?.items.map((item, index) => (
                        <div key={index}>{item.data?.name}</div>
                    ))}
                </div>
                <div>{trigger.get()}</div>
            </div>
        );
    });
    render(<Comp />);

    await wait(0);

    // This value is not stable but anything less than 4 is a good indication that the initial data is not set on every render
    expect(renderCount).toBeLessThan(4);

    configureMobx({ enforceActions: 'observed' });
});

test('union of array models', () => {
    const { queryClient } = setup();

    const data = {
        rules: [
            {
                id: '1',
                kind: 'FIXED',
                fixedValue: 'Fixed value',
            },
            {
                id: '2',
                kind: 'FORMAT',
                formatValue: 'Formatted value',
            },
        ],
    };
    const Model = types.model('UnionArrayTestModel', {
        rules: types.array(types.reference(UnionModel)),
    });
    const result = merge(data, Model, queryClient.config.env);
    expect(result.rules[0].fixedValue).toBe('Fixed value');
    expect(result.rules[1].formatValue).toBe('Formatted value');
});

test('mutations with same scope run sequentially', async () => {
    const { q } = setup();

    const executionOrder: string[] = [];
    let callCount = 0;

    const trackedEndpoint = async () => {
        const currentCall = ++callCount;
        executionOrder.push(`start-${currentCall}`);

        // First call takes longer
        const delay = currentCall === 1 ? 50 : 5;
        await wait(delay);

        executionOrder.push(`end-${currentCall}`);
        return {
            ...itemData,
            id: `item-${currentCall}`,
            description: `call ${currentCall}`,
        };
    };

    const testApi = {
        ...api,
        addItem: trackedEndpoint,
        removeItem: trackedEndpoint,
    };

    const promise1 = q.addItemMutation.mutate({
        request: { path: 'test1', message: 'first' },
        scope: { id: 'sequential-updates' },
        meta: { addItem: testApi.addItem },
    });

    // Wait a bit to ensure first mutation has started
    await wait(10);

    // Start second mutation with same scope - should wait for first to complete
    const promise2 = q.removeItemMutation.mutate({
        request: { id: 'test2' },
        // scope defined on definition
        meta: { removeItem: testApi.removeItem },
    });

    await Promise.all([promise1, promise2]);

    // If scopes work correctly, execution order should be: [start-1, end-1, start-2, end-2]
    // Without scopes, it would be: [start-1, start-2, end-2, end-1] (second starts and finishes before first ends)
    expect(executionOrder).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
});

test('mutations with different scopes run in parallel', async () => {
    const { q } = setup();

    const executionOrder: string[] = [];
    let callCount = 0;

    // Create a custom endpoint that tracks execution timing
    const trackedEndpoint = async () => {
        const currentCall = ++callCount;
        executionOrder.push(`start-${currentCall}`);

        // First call takes longer
        const delay = currentCall === 1 ? 50 : 5;
        await wait(delay);

        executionOrder.push(`end-${currentCall}`);
        return {
            ...itemData,
            id: `item-${currentCall}`,
            description: `call ${currentCall}`,
        };
    };

    const testApi = {
        ...api,
        addItem: trackedEndpoint,
    };

    // Start first mutation with scope A
    const promise1 = q.addItemMutation.mutate({
        request: { path: 'test1', message: 'first' },
        scope: { id: 'scope-a' },
        meta: { addItem: testApi.addItem },
    });

    // Wait a bit to ensure first mutation has started
    await wait(10);

    // Start second mutation with different scope B - should run in parallel
    const promise2 = q.addItemMutation.mutate({
        request: { path: 'test2', message: 'second' },
        scope: { id: 'scope-b' },
        meta: { addItem: testApi.addItem },
    });

    await Promise.all([promise1, promise2]);

    // With different scopes, mutations run in parallel: [start-1, start-2, end-2, end-1]
    // The fast mutation (2) finishes before the slow one (1)
    expect(executionOrder).toEqual(['start-1', 'start-2', 'end-2', 'end-1']);
});

test('createContext with custom context supports multiple nested providers', async () => {
    const CustomContext = React.createContext<QueryClient<any> | undefined>(undefined);

    const queryClient1 = new QueryClient({ RootStore: Root });
    queryClient1.init();

    const queryClient2 = new QueryClient({ RootStore: Root });
    queryClient2.init();

    const {
        QueryClientProvider: Provider1,
        useQueryClient: useQueryClient1,
    } = createContext(queryClient1);

    const {
        QueryClientProvider: Provider2,
        useQueryClient: useQueryClient2,
    } = createContext(queryClient2, { context: CustomContext });

    let client1: any;
    let client2: any;

    const Inner = observer(() => {
        client1 = useQueryClient1();
        client2 = useQueryClient2();
        return <div>inner</div>;
    });

    r(
        <Provider1>
            <Provider2>
                <Inner />
            </Provider2>
        </Provider1>,
    );

    await wait(0);

    expect(client1).toBe(queryClient1);
    expect(client2).toBe(queryClient2);
});

test('do not cancel queries with different variables', async () => {
    const { q } = setup();

    const getItem = async (args: any) => {
        await wait(20);
        return { ...itemData, id: args.request.id };
    };
    const meta = { getItem };

    const [first, second] = await Promise.all([
        q.itemQuery.query({ request: { id: 'test' }, meta }),
        q.itemQuery.query({ request: { id: 'different-test' }, meta }),
    ]);

    expect(first.data).not.toBe(null);
    expect(second.data).not.toBe(null);

    const [third, fourth] = await Promise.all([
        q.itemQuery2.query({ request: { id: 'test' }, meta }),
        q.itemQuery2.query({ request: { id: 'test' }, meta }),
    ]);

    expect(third.data).toBe(null);
    expect(fourth.data).not.toBe(null);
});

test('never cancel mutations', async () => {
    const { q } = setup();

    const addItem = async (args: any) => {
        await wait(20);
        return { ...itemData, id: `add-${args.request.message}` };
    };
    const meta = { addItem };

    const [first, second] = await Promise.all([
        q.addItemMutation.mutate({ request: { path: 'test', message: 'same' }, meta }),
        q.addItemMutation.mutate({ request: { path: 'test', message: 'same' }, meta }),
    ]);

    expect(first.data).not.toBe(null);
    expect(second.data).not.toBe(null);
});
