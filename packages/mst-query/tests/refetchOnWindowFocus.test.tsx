import * as React from 'react';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, getType, isAlive, types } from 'mobx-state-tree';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
    createContext,
    createInfiniteQuery,
    createQuery,
    createRootStore,
    QueryClient,
    useInfiniteQuery,
    useQuery,
    useVolatileQuery,
} from '../src';
import { subscribeToWindowFocus } from '../src/focus';

const disposers: (() => void)[] = [];
let setVisibility: (state: DocumentVisibilityState) => void;
beforeEach(() => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    setVisibility = (state) => {
        visibility.mockReturnValue(state);
    };
});
afterEach(() => {
    cleanup();
    disposers.splice(0).forEach((dispose) => dispose());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const settle = () => act(async () => {});
const notifyVisibility = async (state: DocumentVisibilityState) => {
    await act(async () => {
        setVisibility(state);
        fireEvent(document, new Event('visibilitychange', { bubbles: true }));
    });
};
const focus = async () => {
    await notifyVisibility('hidden');
    await notifyVisibility('visible');
};
const advance = (ms: number) =>
    act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });

const Query = createQuery('FocusQuery', {
    data: types.frozen<{ value: string }>(),
    request: types.model({ id: types.string }),
    endpoint: ({ request, meta, signal }) => meta.fetch(request, meta, signal),
});
const Root = createRootStore({
    first: types.optional(Query, {}),
    second: types.optional(Query, {}),
}).actions((self) => ({
    removeFirst() {
        destroy(self.first);
    },
}));
type Options = NonNullable<Parameters<typeof useQuery<ReturnType<typeof Query.create>>>[1]>;
type Defaults = ConstructorParameters<typeof QueryClient<typeof Root>>[0]['queryOptions'];
const setup = (queryOptions: Defaults = {}) => {
    const client = new QueryClient({ RootStore: Root, queryOptions }).init();
    disposers.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    const { QueryClientProvider: wrapper } = createContext(client);
    const fetch = vi.fn().mockResolvedValue({ value: 'Result' });
    const Comp = observer((options: Options) => {
        const { data, isRefetching } = useQuery(client.rootStore.first, {
            request: { id: 'first' },
            meta: { fetch },
            ...options,
        });
        return (
            <div>
                {isRefetching ? 'refetching:' : 'ready:'}
                {data?.value ?? 'empty'}
            </div>
        );
    });
    return { client, query: client.rootStore.first, wrapper, fetch, Comp };
};

test.each([false, true])(
    'defaults to refetching stale queries when the tab returns (strictMode=%s)',
    async (reactStrictMode) => {
        const { Comp, wrapper, fetch } = setup();
        render(<Comp />, { wrapper, reactStrictMode });
        await settle();
        expect(fetch).toHaveBeenCalledTimes(1);
        await notifyVisibility('hidden');
        expect(fetch).toHaveBeenCalledTimes(1);
        await notifyVisibility('visible');
        expect(fetch).toHaveBeenCalledTimes(2);
    },
);

test('honors staleTime and does not refetch fresh data', async () => {
    const { Comp, wrapper, fetch } = setup();
    render(<Comp staleTime={1000} />, { wrapper });
    await settle();
    await advance(999);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([false, true, 'always'] as const)(
    'handles refetchOnWindowFocus=%s with infinite staleTime',
    async (policy) => {
        const { Comp, wrapper, fetch } = setup();
        render(<Comp staleTime={Infinity} refetchOnWindowFocus={policy} />, { wrapper });
        await settle();
        await focus();
        expect(fetch).toHaveBeenCalledTimes(policy === 'always' ? 2 : 1);
    },
);

test('false disables stale refetches and bare window focus events do not trigger visibility refetching', async () => {
    const { Comp, wrapper, fetch } = setup();
    const { rerender } = render(<Comp refetchOnWindowFocus={false} />, { wrapper });
    await settle();
    await focus();
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender(<Comp refetchOnWindowFocus />);
    await act(async () => {
        fireEvent(window, new Event('focus'));
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('global defaults can be overridden per hook and undefined inherits the global option', async () => {
    const { Comp, wrapper, fetch } = setup({ refetchOnWindowFocus: false });
    const { rerender } = render(<Comp refetchOnWindowFocus={undefined} />, { wrapper });
    await settle();
    await focus();
    expect(fetch).toHaveBeenCalledTimes(1);
    rerender(<Comp refetchOnWindowFocus />);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
    rerender(<Comp refetchOnWindowFocus={undefined} />);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('global callbacks receive the current query node', async () => {
    const policy = vi.fn(() => 'always' as const);
    const { Comp, wrapper, query, fetch } = setup({
        staleTime: Infinity,
        refetchOnWindowFocus: policy,
    });
    render(<Comp />, { wrapper });
    await settle();
    await focus();
    expect(policy).toHaveBeenCalledWith(query);
    expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([
    { policy: false, staleTime: 0, calls: 1 },
    { policy: true, staleTime: Infinity, calls: 1 },
    { policy: true, staleTime: 0, calls: 2 },
    { policy: 'always' as const, staleTime: Infinity, calls: 2 },
])(
    'callback result $policy respects staleTime=$staleTime',
    async ({ policy, staleTime, calls }) => {
        const { Comp, wrapper, query, fetch } = setup();
        const callback = vi.fn((current: typeof query) => policy);
        render(<Comp staleTime={staleTime} refetchOnWindowFocus={callback} />, { wrapper });
        await settle();
        expect(callback).not.toHaveBeenCalled();
        await focus();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(query);
        expect(fetch).toHaveBeenCalledTimes(calls);
    },
);

test('callbacks read updated model data without requiring an observer rerender', async () => {
    const { query, wrapper, fetch } = setup();
    const policy = vi.fn((current: typeof query) =>
        current.data?.value === 'Force' ? ('always' as const) : false,
    );
    renderHook(
        () =>
            useQuery(query, {
                request: { id: 'first' },
                meta: { fetch },
                staleTime: Infinity,
                refetchOnWindowFocus: policy,
            }),
        { wrapper },
    );
    await settle();
    await focus();
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => {
        query.setData({ value: 'Force' });
    });
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('updated options and enabled state are used for subsequent focus events', async () => {
    const { Comp, wrapper, fetch } = setup();
    const { rerender } = render(<Comp staleTime={Infinity} refetchOnWindowFocus={false} />, {
        wrapper,
    });
    await settle();
    rerender(<Comp staleTime={Infinity} refetchOnWindowFocus="always" />);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
    rerender(<Comp enabled={false} refetchOnWindowFocus="always" />);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
    rerender(<Comp refetchOnWindowFocus="always" />);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(3);
});

test('does not fetch a disabled query even when focus policy is always', async () => {
    const { Comp, wrapper, fetch } = setup();
    render(<Comp enabled={false} refetchOnWindowFocus="always" />, { wrapper });
    await focus();
    expect(fetch).not.toHaveBeenCalled();
});

test('does not overlap a pending initial request or a pending focus refetch', async () => {
    const { Comp, wrapper, fetch } = setup();
    let resolve!: (value: { value: string }) => void;
    fetch.mockImplementation(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    const { container } = render(<Comp />, { wrapper });
    await focus();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
        resolve({ value: 'First' });
    });
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe('refetching:First');
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {
        resolve({ value: 'Second' });
    });
    expect(container.textContent).toBe('ready:Second');
});

test('retries an initial error on focus and clears the error after success', async () => {
    const { Comp, wrapper, query, fetch } = setup();
    const error = new Error('Initial error');
    fetch.mockRejectedValueOnce(error).mockResolvedValue({ value: 'Recovered' });
    render(<Comp />, { wrapper });
    await settle();
    expect(query.error).toBe(error);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(query.error).toBeNull();
    expect(query.data?.value).toBe('Recovered');
});

test('reports a failed focus request through query.error and can recover on later focus', async () => {
    const { Comp, wrapper, query, fetch } = setup();
    render(<Comp />, { wrapper });
    await settle();
    const error = new Error('Focus error');
    fetch.mockRejectedValueOnce(error);
    await focus();
    expect(query.error).toBe(error);
    await focus();
    expect(query.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
});

test('refetches with current variables and the latest meta, updating the response cache', async () => {
    const { Comp, wrapper, query, client, fetch } = setup();
    const firstMeta = { fetch, label: 'first' };
    const secondMeta = { fetch, label: 'second' };
    const { rerender } = render(<Comp meta={firstMeta} cacheKey="focus" cacheTime={10000} />, {
        wrapper,
    });
    await settle();
    rerender(
        <Comp request={{ id: 'second' }} meta={secondMeta} cacheKey="focus" cacheTime={10000} />,
    );
    await settle();
    fetch.mockResolvedValueOnce({ value: 'Focused' });
    await focus();
    expect(fetch).toHaveBeenLastCalledWith({ id: 'second' }, secondMeta, expect.any(AbortSignal));
    expect(client.queryStore.getQueryData(getType(query), 'focus')?.data.value).toBe('Focused');
});

test('shares one listener across queries and removes it after the last observer unmounts', async () => {
    const { Comp, wrapper, client, fetch } = setup();
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const Other = observer(() => {
        useQuery(client.rootStore.second, { request: { id: 'second' }, meta: { fetch } });
        return null;
    });
    const first = render(<Comp />, { wrapper });
    const second = render(<Other />, { wrapper });
    await settle();
    expect(add.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(1);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(4);
    first.unmount();
    expect(remove.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(0);
    second.unmount();
    expect(remove.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(1);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(4);
});

test.each(['destroy', 'reset'] as const)('removes the subscription on query %s', async (method) => {
    const { query, client, wrapper, fetch } = setup();
    renderHook(() => useQuery(query, { request: { id: 'first' }, meta: { fetch } }), { wrapper });
    await settle();
    act(() => {
        if (method === 'reset') client.reset();
        else client.rootStore.removeFirst();
    });
    await focus();
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('volatile queries support focus refetching', async () => {
    const { wrapper } = setup();
    const endpoint = vi.fn().mockResolvedValue({ value: 'Volatile' });
    renderHook(() => useVolatileQuery({ endpoint }), { wrapper });
    await settle();
    await focus();
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('switching query instances moves the focus subscription to the new node', async () => {
    const { client, query, wrapper, fetch } = setup();
    const { rerender } = renderHook(
        ({ current }) =>
            useQuery(current, {
                request: { id: current === query ? 'first' : 'second' },
                meta: { fetch },
            }),
        { initialProps: { current: query }, wrapper },
    );
    await settle();
    rerender({ current: client.rootStore.second });
    await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.filter(([request]) => request.id === 'first')).toHaveLength(1);
    expect(fetch.mock.calls.filter(([request]) => request.id === 'second')).toHaveLength(2);
});

test('infinite queries preserve their current pagination and avoid overlapping page requests', async () => {
    const fetch = vi.fn().mockResolvedValue({ value: 'Page' });
    const Infinite = createInfiniteQuery('FocusInfiniteQuery', {
        data: types.frozen<{ value: string }>(),
        request: types.model({ id: types.string }),
        pagination: types.model({ offset: types.number }),
        endpoint: ({ request, pagination, meta }) => fetch(request, pagination, meta),
    });
    const InfiniteRoot = createRootStore({ query: types.optional(Infinite, {}) });
    const client = new QueryClient({ RootStore: InfiniteRoot }).init();
    disposers.push(() => destroy(client.rootStore));
    const { QueryClientProvider: wrapper } = createContext(client);
    const query = client.rootStore.query;
    const meta = { label: 'pages' };
    renderHook(
        () =>
            useInfiniteQuery(query, { request: { id: 'page' }, pagination: { offset: 10 }, meta }),
        { wrapper },
    );
    await settle();
    await focus();
    expect(fetch).toHaveBeenLastCalledWith({ id: 'page' }, { offset: 10 }, meta);
    expect(fetch).toHaveBeenCalledTimes(2);
    let resolve!: (value: { value: string }) => void;
    fetch.mockImplementationOnce(
        () =>
            new Promise((done) => {
                resolve = done;
            }),
    );
    let page!: ReturnType<typeof query.queryMore>;
    act(() => {
        page = query.queryMore({ pagination: { offset: 20 } });
    });
    await focus();
    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => {
        await query.queryMore({ pagination: { offset: 30 } });
    });
    expect(query.isLoading).toBe(false);
    expect(query.isFetchingMore).toBe(true);
    await focus();
    expect(fetch).toHaveBeenCalledTimes(4);
    await act(async () => {
        resolve({ value: 'Next page' });
        await page;
    });
    await focus();
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenLastCalledWith({ id: 'page' }, { offset: 30 }, meta);
});

test('focus subscription is safe without browser globals', () => {
    const listener = vi.fn();
    vi.stubGlobal('document', undefined);
    expect(() => subscribeToWindowFocus(listener)()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
});
