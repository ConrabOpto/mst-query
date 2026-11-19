import * as React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, isAlive, types } from 'mobx-state-tree';
import {
    createContext,
    createInfiniteQuery,
    createMutation,
    createQuery,
    createRootStore,
    QueryClient,
    useInfiniteQuery,
    useMutation,
    useQuery,
} from '../src';

const endpoint = vi.fn();

const Data = types.model({ value: types.string });
const Request = types.model({ id: types.string });
const Item = createQuery('StatusItem', { data: Data, request: Request, endpoint });
const Pages = createInfiniteQuery('StatusPages', {
    data: types.model({ items: types.array(types.string) }),
    request: Request,
    pagination: types.model({ offset: types.number }),
    endpoint,
    onQueryMore({ query, data }) {
        query.data?.items.push(...data.items);
    },
});
const Save = createMutation('StatusSave', { data: Data, request: Request, endpoint });
const Root = createRootStore({
    item: types.optional(Item, {}),
    pages: types.optional(Pages, {}),
    save: types.optional(Save, {}),
});

const cleanups: (() => void)[] = [];
beforeEach(() => {
    endpoint.mockReset();
    endpoint.mockImplementation(async ({ request }) => ({ value: `item ${request.id}` }));
});
afterEach(() => {
    cleanup();
    cleanups.splice(0).forEach((dispose) => dispose());
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const setup = (config: any = {}) => {
    const client = new QueryClient({ RootStore: Root, gcInterval: Infinity, ...config }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    const { QueryClientProvider } = createContext(client);
    return {
        root: client.rootStore,
        render: (ui: React.ReactElement) => r(ui, { wrapper: QueryClientProvider as any }),
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

const flags = (source: any) => ({
    status: source.status,
    fetchStatus: source.fetchStatus,
    isPending: source.isPending,
    isLoading: source.isLoading,
    isFetching: source.isFetching,
    isRefetching: source.isRefetching,
    isSuccess: source.isSuccess,
    isError: source.isError,
});

test('queries retry three times with exponential backoff by default', async () => {
    vi.useFakeTimers();
    const { root } = setup();
    const error = new Error('Failed');
    endpoint.mockRejectedValue(error);

    const result = root.item.query({ request: { id: 'a' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(root.item.failureCount).toBe(1);
    expect(root.item.failureReason).toBe(error);
    expect(root.item.error).toBeNull();
    expect(root.item.isFetching).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(endpoint).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(endpoint).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(endpoint).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(endpoint).toHaveBeenCalledTimes(4);

    await expect(result).resolves.toMatchObject({ error });
    expect(root.item.error).toBe(error);
    expect(root.item.failureCount).toBe(4);
    expect(root.item.isFetching).toBe(false);
});

test('a successful retry clears the failure state', async () => {
    vi.useFakeTimers();
    const { root } = setup();
    endpoint.mockRejectedValueOnce(new Error('Flaky'));

    const result = root.item.query({ request: { id: 'a' } });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toMatchObject({ error: null });
    expect(root.item.data?.value).toBe('item a');
    expect(root.item.failureCount).toBe(0);
    expect(root.item.failureReason).toBeNull();
});

test.each([
    ['false', { retry: false }, 1],
    ['a number', { retry: 1 }, 2],
    ['a callback', { retry: (count: number) => count < 2 }, 3],
])('retry can be %s', async (_, options, calls) => {
    const { root } = setup({ queryOptions: { ...options, retryDelay: 0 } });
    endpoint.mockRejectedValue(new Error('Failed'));
    await root.item.query({ request: { id: 'a' } });
    expect(endpoint).toHaveBeenCalledTimes(calls);
    expect(root.item.failureCount).toBe(calls);
});

test('retryDelay can be a number or a callback of the failure count', async () => {
    vi.useFakeTimers();
    const retryDelay = vi.fn((count: number) => (count + 1) * 10);
    const { root } = setup({ queryOptions: { retry: 2, retryDelay } });
    endpoint.mockRejectedValue(new Error('Failed'));

    const result = root.item.query({ request: { id: 'a' } });
    await vi.advanceTimersByTimeAsync(10);
    expect(endpoint).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(20);
    expect(endpoint).toHaveBeenCalledTimes(3);
    await result;
    expect(retryDelay.mock.calls.map(([count]) => count)).toEqual([0, 1]);
});

test('hook retry options apply to the fetches the hook starts', async () => {
    const { root, render } = setup();
    endpoint.mockRejectedValue(new Error('Failed'));
    const Comp = observer(() => {
        const { error, failureCount } = useQuery(root.item, {
            request: { id: 'a' },
            retry: 1,
            retryDelay: 0,
        });
        return <div>{error ? `failed ${failureCount}` : 'loading'}</div>;
    });
    const { findByText } = render(<Comp />);
    await findByText('failed 2');
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('aborting a query stops its retries', async () => {
    vi.useFakeTimers();
    const { root } = setup();
    endpoint.mockRejectedValue(new Error('Failed'));

    void root.item.query({ request: { id: 'a' } });
    await vi.advanceTimersByTimeAsync(0);
    root.item.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(root.item.isFetching).toBe(false);
});

test('retries wait while the tab is hidden and resume when it becomes visible', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const show = () => {
        visibility.mockReturnValue('visible');
        document.dispatchEvent(new Event('visibilitychange'));
    };
    const { root, render } = setup();
    endpoint.mockRejectedValueOnce(new Error('Flaky'));
    let result: any;
    const Comp = observer(() => {
        result = useQuery(root.item, { request: { id: 'a' } });
        return null;
    });
    render(<Comp />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(flags(root.item)).toMatchObject({
        status: 'pending',
        fetchStatus: 'paused',
        isFetching: false,
        isLoading: false,
    });
    expect(result).toMatchObject({ fetchStatus: 'paused', isPaused: true, failureCount: 1 });

    await act(async () => show());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(endpoint).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'success', isPaused: false, fetchStatus: 'idle' });
    visibility.mockRestore();
});

test('aborting a paused retry stops it', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { root } = setup();
    endpoint.mockRejectedValue(new Error('Failed'));
    void root.item.query({ request: { id: 'a' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.item.isPaused).toBe(true);

    root.item.abort();
    expect(root.item.isPaused).toBe(false);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(endpoint).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
});

test('queries do not retry on the server', async () => {
    vi.stubGlobal('window', undefined);
    const { root } = setup();
    endpoint.mockRejectedValue(new Error('Failed'));
    await root.item.query({ request: { id: 'a' } });
    expect(endpoint).toHaveBeenCalledTimes(1);
});

test('mutations do not retry unless configured', async () => {
    const { root } = setup();
    endpoint.mockRejectedValue(new Error('Failed'));
    await root.save.mutate({ request: { id: 'a' } });
    expect(endpoint).toHaveBeenCalledTimes(1);

    await root.save.mutate({ request: { id: 'a' }, retry: 2, retryDelay: 0 });
    expect(endpoint).toHaveBeenCalledTimes(4);
    expect(root.save.failureCount).toBe(3);

    const configured = setup({ mutationOptions: { retry: 1, retryDelay: 0 } });
    endpoint.mockClear();
    await configured.root.save.mutate({ request: { id: 'a' } });
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('useQuery reports pending, success, background fetching and errors', async () => {
    const { root, render } = setup({ queryOptions: { retry: false } });
    const states: any[] = [];
    let result: any;
    const Comp = observer(() => {
        result = useQuery(root.item, { request: { id: 'a' } });
        states.push(flags(result));
        return null;
    });
    render(<Comp />);
    expect(states[0]).toEqual({
        status: 'pending',
        fetchStatus: 'fetching',
        isPending: true,
        isLoading: true,
        isFetching: true,
        isRefetching: false,
        isSuccess: false,
        isError: false,
    });
    await act(async () => {});
    expect(flags(result)).toMatchObject({
        status: 'success',
        fetchStatus: 'idle',
        isPending: false,
        isLoading: false,
        isFetching: false,
        isSuccess: true,
    });

    const refetch = createDeferred<any>();
    endpoint.mockReturnValueOnce(refetch.promise);
    act(() => {
        void root.item.refetch();
    });
    expect(flags(result)).toMatchObject({
        status: 'success',
        isLoading: false,
        isFetching: true,
        isRefetching: true,
    });
    await act(async () => refetch.reject(new Error('Failed')));
    expect(flags(result)).toMatchObject({
        status: 'error',
        isError: true,
        isSuccess: false,
        isFetching: false,
    });
    expect(result.data?.value).toBe('item a');
    expect(flags(root.item)).toEqual(flags(result));
});

test('loading more pages is not a refetch', async () => {
    const { root } = setup();
    endpoint.mockImplementation(async ({ pagination }) => ({
        items: [`page ${pagination?.offset ?? 0}`],
    }));
    await root.pages.query({ request: { id: 'a' }, pagination: { offset: 0 } });

    const page = createDeferred<any>();
    endpoint.mockReturnValueOnce(page.promise);
    const more = root.pages.queryMore({ pagination: { offset: 1 } });
    expect(root.pages.isFetchingMore).toBe(true);
    expect(root.pages.isFetching).toBe(true);
    expect(root.pages.isRefetching).toBe(false);
    page.resolve({ items: ['page 1'] });
    await more;
    expect(root.pages.data?.items).toEqual(['page 0', 'page 1']);
});

test('useInfiniteQuery returns the same status fields', async () => {
    const { root, render } = setup();
    endpoint.mockImplementation(async () => ({ items: ['page 0'] }));
    let result: any;
    const Comp = observer(() => {
        result = useInfiniteQuery(root.pages, { request: { id: 'a' } });
        return null;
    });
    render(<Comp />);
    expect(result.isLoading).toBe(true);
    await act(async () => {});
    expect(result.isSuccess).toBe(true);
    expect(result.isRefetching).toBe(false);
});

test('mutations report idle, pending, success and error', async () => {
    const { root, render } = setup();
    let result: any;
    let mutate: any;
    const Comp = observer(() => {
        [mutate, result] = useMutation(root.save);
        return null;
    });
    render(<Comp />);
    expect(result).toMatchObject({ status: 'idle', isIdle: true, isPending: false });

    const response = createDeferred<any>();
    endpoint.mockReturnValueOnce(response.promise);
    let pending!: Promise<any>;
    act(() => {
        pending = mutate({ request: { id: 'a' } });
    });
    expect(result).toMatchObject({ status: 'pending', isPending: true, isIdle: false });
    await act(async () => {
        response.resolve({ value: 'saved' });
        await pending;
    });
    expect(result).toMatchObject({ status: 'success', isSuccess: true, isPending: false });

    endpoint.mockRejectedValueOnce(new Error('Failed'));
    await act(() => mutate({ request: { id: 'a' } }));
    expect(result).toMatchObject({ status: 'error', isError: true, failureCount: 1 });
});
