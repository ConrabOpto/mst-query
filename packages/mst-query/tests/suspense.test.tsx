import * as React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, isAlive, types } from 'mobx-state-tree';
import {
    createContext,
    createInfiniteQuery,
    createInfiniteQueryMap,
    createQuery,
    createQueryMap,
    createRootStore,
    QueryClient,
    useSuspenseInfiniteQuery,
    useSuspenseQuery,
} from '../src';
import { wait } from './utils';

const endpoint = vi.fn();
const pageEndpoint = vi.fn();

const Data = types.model({ value: types.string });
const Request = types.model({ id: types.string });
const Item = createQuery('SuspenseItem', { data: Data, request: Request, endpoint });
const ItemMap = createQueryMap('SuspenseItemMap', { data: Data, request: Request, endpoint });
const ShortItemMap = createQueryMap('SuspenseShortItemMap', {
    data: Data,
    request: Request,
    endpoint,
    cacheTime: 0,
});
const pageOptions = {
    data: types.model({ items: types.array(types.string) }),
    request: Request,
    pagination: types.model({ offset: types.number }),
    endpoint: pageEndpoint,
    onQueryMore({ query, data }: any) {
        query.data?.items.push(...data.items);
    },
};
const Pages = createInfiniteQuery('SuspensePages', pageOptions);
const PageMap = createInfiniteQueryMap('SuspensePageMap', pageOptions);
const Root = createRootStore({
    item: types.optional(Item, {}),
    items: types.optional(ItemMap, {}),
    shortItems: types.optional(ShortItemMap, {}),
    pages: types.optional(Pages, {}),
    pageMap: types.optional(PageMap, {}),
});

const cleanups: (() => void)[] = [];
beforeEach(() => {
    endpoint.mockReset();
    endpoint.mockImplementation(async ({ request }) => {
        await wait(5);
        return { value: `item ${request.id}` };
    });
    pageEndpoint.mockReset();
    pageEndpoint.mockImplementation(async ({ request, pagination }) => {
        await wait(5);
        return { items: [`${request.id}@${pagination?.offset ?? 0}`] };
    });
});
afterEach(() => {
    cleanup();
    cleanups.splice(0).forEach((dispose) => dispose());
});

const setup = () => {
    const client = new QueryClient({ RootStore: Root, gcInterval: Infinity }).init();
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

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
    state = { error: null as any };
    static getDerivedStateFromError(error: any) {
        return { error };
    }
    render() {
        return this.state.error ? <div>error: {this.state.error.message}</div> : this.props.children;
    }
}

const suspended = (ui: React.ReactNode) => (
    <React.Suspense fallback={<div>loading</div>}>{ui}</React.Suspense>
);

test('a suspended component only observes the query once it mounts', async () => {
    const { root, render } = setup();
    const Comp = observer(() => {
        const { data } = useSuspenseQuery(root.item, { request: { id: 'a' } });
        return <div>{data.value}</div>;
    });

    const { findByText, unmount } = render(suspended(<Comp />));
    expect(root.item.__MstQueryHandler.queryObservers).toHaveLength(0);
    await findByText('item a');
    expect(root.item.__MstQueryHandler.queryObservers).toHaveLength(1);
    expect(endpoint).toHaveBeenCalledTimes(1);

    unmount();
    expect(root.item.__MstQueryHandler.queryObservers).toHaveLength(0);
});

test('remounting within the minimum staleTime does not refetch', async () => {
    const { root, render } = setup();
    const Comp = observer(() => {
        const { data } = useSuspenseQuery(root.items, { request: { id: 'a' }, staleTime: 10 });
        return <div>{data.value}</div>;
    });

    const view = render(suspended(<Comp />));
    await view.findByText('item a');
    view.unmount();
    await act(() => wait(50));

    const remount = render(suspended(<Comp />));
    remount.getByText('item a');
    await act(() => wait(20));
    expect(endpoint).toHaveBeenCalledTimes(1);
});

test('switching the request of a query map suspends on the new entry', async () => {
    const { root, render } = setup();
    const Comp = observer(({ id }: { id: string }) => {
        const { data } = useSuspenseQuery(root.items, { request: { id } });
        return <div>{data.value}</div>;
    });

    const { findByText, getByText, rerender } = render(suspended(<Comp id="a" />));
    await findByText('item a');
    rerender(suspended(<Comp id="b" />));
    getByText('loading');
    await findByText('item b');

    rerender(suspended(<Comp id="a" />));
    getByText('item a');
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('a map entry with cacheTime 0 survives until its suspended component mounts', async () => {
    const { root, render } = setup();
    const slow = createDeferred<any>();
    endpoint.mockImplementation(({ request }) =>
        request.id === 'slow' ? slow.promise : Promise.resolve({ value: `item ${request.id}` }),
    );
    const Comp = observer(({ id }: { id: string }) => {
        const { data } = useSuspenseQuery(root.shortItems, { request: { id } });
        return <div>{data.value}</div>;
    });

    // The boundary only commits once both entries have data.
    const { findByText, getByText } = render(
        suspended(
            <>
                <Comp id="fast" />
                <Comp id="slow" />
            </>,
        ),
    );
    await act(() => wait(20));
    getByText('loading');

    await act(async () => slow.resolve({ value: 'item slow' }));
    await findByText('item fast');
    getByText('item slow');
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('remounting after an error rethrows it until the query is retried', async () => {
    const { root, render } = setup();
    endpoint.mockRejectedValueOnce(new Error('Failed'));
    const Comp = observer(() => {
        const { data } = useSuspenseQuery(root.item, { request: { id: 'a' } });
        return <div>{data.value}</div>;
    });
    const App = ({ attempt }: { attempt: number }) => (
        <ErrorBoundary key={attempt}>{suspended(<Comp />)}</ErrorBoundary>
    );

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { findByText, getByText, rerender } = render(<App attempt={0} />);
    await findByText('error: Failed');

    rerender(<App attempt={1} />);
    getByText('error: Failed');
    await act(() => wait(20));
    expect(endpoint).toHaveBeenCalledTimes(1);

    await act(async () => {
        root.item.refetch();
    });
    rerender(<App attempt={2} />);
    getByText('loading');
    await findByText('item a');
    expect(endpoint).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
});

test('an error after switching requests reaches the error boundary without refetching', async () => {
    const { root, render } = setup();
    const Comp = observer(({ id }: { id: string }) => {
        const { data } = useSuspenseQuery(root.item, { request: { id } });
        return <div>{data.value}</div>;
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { findByText, rerender } = render(<ErrorBoundary>{suspended(<Comp id="a" />)}</ErrorBoundary>);
    await findByText('item a');

    endpoint.mockRejectedValueOnce(new Error('Failed b'));
    rerender(<ErrorBoundary>{suspended(<Comp id="b" />)}</ErrorBoundary>);
    await findByText('error: Failed b');
    await act(() => wait(20));
    expect(endpoint).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
});

test('setting data while the fetch is in flight releases suspense', async () => {
    const { root, render } = setup();
    const response = createDeferred<any>();
    endpoint.mockReturnValueOnce(response.promise);
    const Comp = observer(() => {
        const { data } = useSuspenseQuery(root.item, { request: { id: 'a' } });
        return <div>{data.value}</div>;
    });

    const { findByText, getByText } = render(suspended(<Comp />));
    await act(() => wait(0));
    getByText('loading');

    await act(async () => {
        root.item.setData({ value: 'manual' });
    });
    await findByText('manual');

    await act(async () => response.resolve({ value: 'fetched' }));
    await findByText('fetched');
    expect(endpoint).toHaveBeenCalledTimes(1);
});

test('an endpoint that streams with setData releases suspense on the first chunk', async () => {
    const { root, render } = setup();
    const rest = createDeferred<void>();
    endpoint.mockImplementationOnce(async ({ setData }) => {
        setData({ value: 'chunk' });
        await rest.promise;
        return { value: 'complete' };
    });
    const Comp = observer(() => {
        const { data } = useSuspenseQuery(root.items, { request: { id: 'a' } });
        return <div>{data.value}</div>;
    });

    const { findByText } = render(suspended(<Comp />));
    await findByText('chunk');

    await act(async () => rest.resolve());
    await findByText('complete');
    expect(endpoint).toHaveBeenCalledTimes(1);
});

test('useSuspenseInfiniteQuery suspends on an infinite query and loads more pages without suspending', async () => {
    const { root, render } = setup();
    let result: any;
    // Singleton infinite queries load more pages when the pagination prop changes.
    const Comp = observer(({ offset }: { offset: number }) => {
        result = useSuspenseInfiniteQuery(root.pages, {
            request: { id: 'a' },
            pagination: { offset },
        });
        return <div>{result.data.items.join(',')}</div>;
    });

    const { findByText, getByText, rerender } = render(suspended(<Comp offset={0} />));
    getByText('loading');
    await findByText('a@0');

    rerender(suspended(<Comp offset={1} />));
    getByText('a@0');
    expect(result.isFetchingMore).toBe(true);
    await findByText('a@0,a@1');
    expect(pageEndpoint).toHaveBeenCalledTimes(2);
});

test('useSuspenseInfiniteQuery suspends on an infinite query map and loads more pages without suspending', async () => {
    const { root, render } = setup();
    let result: any;
    const Comp = observer(() => {
        result = useSuspenseInfiniteQuery(root.pageMap, {
            request: { id: 'a' },
            pagination: { offset: 0 },
        });
        return <div>{result.data.items.join(',')}</div>;
    });

    const { findByText, getByText } = render(suspended(<Comp />));
    getByText('loading');
    await findByText('a@0');
    expect(result.isFetchingMore).toBe(false);

    let more!: Promise<unknown>;
    act(() => {
        more = result.queryMore({ pagination: { offset: 1 } });
    });
    getByText('a@0');
    expect(result.isFetchingMore).toBe(true);
    await act(() => more);
    getByText('a@0,a@1');
    expect(pageEndpoint).toHaveBeenCalledTimes(2);
});

test('useSuspenseInfiniteQuery suspends again when the request of a map changes', async () => {
    const { root, render } = setup();
    const Comp = observer(({ id }: { id: string }) => {
        const { data } = useSuspenseInfiniteQuery(root.pageMap, {
            request: { id },
            pagination: { offset: 0 },
        });
        return <div>{data.items.join(',')}</div>;
    });

    const { findByText, getByText, rerender } = render(suspended(<Comp id="a" />));
    await findByText('a@0');
    rerender(suspended(<Comp id="b" />));
    getByText('loading');
    await findByText('b@0');
    expect(pageEndpoint).toHaveBeenCalledTimes(2);
});

test('a failed page keeps the loaded pages of useSuspenseInfiniteQuery on screen', async () => {
    const { root, render } = setup();
    let result: any;
    const Comp = observer(() => {
        result = useSuspenseInfiniteQuery(root.pageMap, {
            request: { id: 'a' },
            pagination: { offset: 0 },
        });
        return <div>{result.data.items.join(',')}</div>;
    });

    const { findByText, getByText } = render(suspended(<Comp />));
    await findByText('a@0');

    pageEndpoint.mockRejectedValueOnce(new Error('Page failed'));
    await act(async () => {
        await result.queryMore({ pagination: { offset: 1 } });
    });
    getByText('a@0');
    expect(result.error.message).toBe('Page failed');
});

test('useSuspenseInfiniteQuery rejects queries without pagination', () => {
    const { root, render } = setup();
    const Comp = observer(() => {
        useSuspenseInfiniteQuery(root.item as any);
        return null;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(suspended(<Comp />))).toThrow(
        'useInfiniteQuery should be used with a query that has pagination',
    );
    vi.restoreAllMocks();
});
