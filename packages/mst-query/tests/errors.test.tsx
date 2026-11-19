import * as React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, isAlive, types } from 'mobx-state-tree';
import {
    createContext,
    createMutation,
    createQuery,
    createQueryMap,
    createRootStore,
    QueryClient,
    QueryErrorResetBoundary,
    useQuery,
    useSuspenseQuery,
} from '../src';
import { wait } from './utils';

const endpoint = vi.fn();

const Data = types.model({ value: types.string });
const Request = types.model({ id: types.string });
const Item = createQuery('ErrorItem', { data: Data, request: Request, endpoint });
const ItemMap = createQueryMap('ErrorItemMap', { data: Data, request: Request, endpoint });
const Save = createMutation('ErrorSave', { data: Data, request: Request, endpoint });
const Root = createRootStore({
    item: types.optional(Item, {}),
    items: types.optional(ItemMap, {}),
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
    vi.restoreAllMocks();
});

const setup = (queryOptions: any = {}) => {
    const client = new QueryClient({
        RootStore: Root,
        gcInterval: Infinity,
        queryOptions: { retry: false, ...queryOptions },
    }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    const { QueryClientProvider } = createContext(client);
    return {
        root: client.rootStore,
        render: (ui: React.ReactElement) => r(ui, { wrapper: QueryClientProvider as any }),
    };
};

class ErrorBoundary extends React.Component<
    { children: React.ReactNode; onReset?: () => void },
    { error: any }
> {
    state = { error: null as any };
    static getDerivedStateFromError(error: any) {
        return { error };
    }
    render() {
        if (!this.state.error) return this.props.children;
        return (
            <button
                onClick={() => {
                    this.props.onReset?.();
                    this.setState({ error: null });
                }}>
                boundary: {this.state.error.message}
            </button>
        );
    }
}

const silenceErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

test('a failed refetch keeps the data of the same request', async () => {
    const { root, render } = setup();
    let result: any;
    const Comp = observer(() => {
        result = useQuery(root.item, { request: { id: 'a' } });
        return <div>{result.data?.value ?? 'none'}</div>;
    });
    const { findByText, getByText } = render(<Comp />);
    await findByText('item a');
    expect(result.isRefetchError).toBe(false);

    endpoint.mockRejectedValueOnce(new Error('Failed'));
    await act(async () => {
        await root.item.refetch();
    });
    getByText('item a');
    expect(root.item.data?.value).toBe('item a');
    expect(result.error.message).toBe('Failed');
    expect(result.isRefetchError).toBe(true);
    expect(result.isLoadingError).toBe(false);

    await act(async () => {
        await root.item.refetch();
    });
    expect(result.error).toBeNull();
});

test('a failed request clears data that belongs to a previous request', async () => {
    const { root } = setup();
    await root.item.query({ request: { id: 'a' } });

    endpoint.mockRejectedValueOnce(new Error('Failed'));
    const { error } = await root.item.query({ request: { id: 'b' } });
    expect(error.message).toBe('Failed');
    expect(root.item.data).toBeNull();
    expect(root.item.variables.request?.id).toBe('b');
});

test('a failed request clears placeholder data', async () => {
    const { root, render } = setup();
    let result: any;
    const Comp = observer(({ id }: { id: string }) => {
        result = useQuery(root.item, {
            request: { id },
            placeholderData: (previous) => previous,
        });
        return <div>{result.data?.value ?? 'none'}</div>;
    });
    const { findByText, rerender } = render(<Comp id="a" />);
    await findByText('item a');

    endpoint.mockRejectedValueOnce(new Error('Failed'));
    rerender(<Comp id="b" />);
    await findByText('none');
    expect(result.isLoadingError).toBe(true);
});

test('a query map entry keeps its data when a refetch fails', async () => {
    const { root } = setup();
    const { query: entry } = await root.items.query({ request: { id: 'a' } });

    endpoint.mockRejectedValueOnce(new Error('Failed'));
    const { error } = await root.items.refetch({ request: { id: 'a' } });
    expect(error.message).toBe('Failed');
    expect(entry.data?.value).toBe('item a');
    expect(entry.error.message).toBe('Failed');
});

test('a failed mutation clears its data', async () => {
    const { root } = setup();
    await root.save.mutate({ request: { id: 'a' } });
    expect(root.save.data?.value).toBe('item a');

    endpoint.mockRejectedValueOnce(new Error('Failed'));
    const { error } = await root.save.mutate({ request: { id: 'b' } });
    expect(error.message).toBe('Failed');
    expect(root.save.data).toBeNull();
});

test('useQuery returns errors instead of throwing them by default', async () => {
    const { root, render } = setup();
    endpoint.mockRejectedValueOnce(new Error('Failed'));
    const Comp = observer(() => {
        const { error, isLoadingError } = useQuery(root.item, { request: { id: 'a' } });
        return <div>{isLoadingError ? `inline: ${error.message}` : 'ok'}</div>;
    });
    const { findByText } = render(
        <ErrorBoundary>
            <Comp />
        </ErrorBoundary>,
    );
    await findByText('inline: Failed');
});

test.each([
    ['the hook', {}, { throwOnError: true }],
    ['the client', { throwOnError: true }, {}],
])('throwOnError set on %s throws to the error boundary', async (_, clientOptions, hookOptions) => {
    silenceErrors();
    const { root, render } = setup(clientOptions);
    endpoint.mockRejectedValueOnce(new Error('Failed'));
    const Comp = observer(() => {
        const { data } = useQuery(root.item, { request: { id: 'a' }, ...hookOptions });
        return <div>{data?.value ?? 'none'}</div>;
    });
    const { findByText } = render(
        <ErrorBoundary>
            <Comp />
        </ErrorBoundary>,
    );
    await findByText('boundary: Failed');
});

test('a throwOnError callback decides per error and query', async () => {
    silenceErrors();
    const { root, render } = setup();
    const throwOnError = vi.fn((_error: any, query: any) => query.data == null);
    const Comp = observer(({ id }: { id: string }) => {
        const { data, isRefetchError } = useQuery(root.item, {
            request: { id },
            throwOnError,
        });
        return <div>{`${data?.value ?? 'none'}${isRefetchError ? ' (stale)' : ''}`}</div>;
    });
    const { findByText, rerender } = render(
        <ErrorBoundary>
            <Comp id="a" />
        </ErrorBoundary>,
    );
    await findByText('item a');

    const error = new Error('Background');
    endpoint.mockRejectedValueOnce(error);
    await act(async () => {
        await root.item.refetch();
    });
    await findByText('item a (stale)');
    expect(throwOnError).toHaveBeenCalledWith(error, root.item);

    endpoint.mockRejectedValueOnce(new Error('No data'));
    rerender(
        <ErrorBoundary>
            <Comp id="b" />
        </ErrorBoundary>,
    );
    await findByText('boundary: No data');
});

test('a failed query without data retries when its hook mounts again', async () => {
    const { root, render } = setup();
    const Comp = observer(({ id }: { id: string }) => {
        const { data, error } = useQuery(root.item, { request: { id }, staleTime: Infinity });
        return <div>{data?.value ?? error?.message ?? 'loading'}</div>;
    });
    const view = render(<Comp id="a" />);
    await view.findByText('item a');
    endpoint.mockRejectedValueOnce(new Error('Failed'));
    view.rerender(<Comp id="b" />);
    await view.findByText('Failed');
    view.unmount();

    const remount = render(<Comp id="b" />);
    await remount.findByText('item b');
    expect(endpoint).toHaveBeenCalledTimes(3);
});

test.each([
    ['useQuery with throwOnError', false],
    ['useSuspenseQuery', true],
])('QueryErrorResetBoundary lets %s retry', async (_, suspense) => {
    silenceErrors();
    const { root, render } = setup();
    endpoint.mockRejectedValueOnce(new Error('Failed'));
    endpoint.mockRejectedValueOnce(new Error('Failed again'));
    const Comp = observer(() => {
        const { data } = suspense
            ? useSuspenseQuery(root.item, { request: { id: 'a' } })
            : useQuery(root.item, { request: { id: 'a' }, throwOnError: true });
        return <div>{data?.value ?? 'loading'}</div>;
    });
    const App = ({ withReset }: { withReset: boolean }) => (
        <QueryErrorResetBoundary>
            {({ reset }) => (
                <ErrorBoundary onReset={withReset ? reset : undefined}>
                    <React.Suspense fallback={<div>loading</div>}>
                        <Comp />
                    </React.Suspense>
                </ErrorBoundary>
            )}
        </QueryErrorResetBoundary>
    );

    const { findByText, getByText, rerender } = render(<App withReset={false} />);
    await findByText('boundary: Failed');

    // Without a reset, remounting rethrows the error instead of refetching.
    fireEvent.click(getByText('boundary: Failed'));
    await findByText('boundary: Failed');
    await act(() => wait(10));
    expect(endpoint).toHaveBeenCalledTimes(1);

    rerender(<App withReset />);
    fireEvent.click(getByText('boundary: Failed'));
    await findByText('boundary: Failed again');
    expect(endpoint).toHaveBeenCalledTimes(2);

    fireEvent.click(getByText('boundary: Failed again'));
    await findByText('item a');
    expect(endpoint).toHaveBeenCalledTimes(3);
});

test('useSuspenseQuery keeps rendering data when a background refetch fails', async () => {
    silenceErrors();
    const { root, render } = setup();
    let result: any;
    const Comp = observer(() => {
        result = useSuspenseQuery(root.item, { request: { id: 'a' } });
        return <div>{result.data.value}</div>;
    });
    const { findByText, getByText } = render(
        <ErrorBoundary>
            <React.Suspense fallback={<div>loading</div>}>
                <Comp />
            </React.Suspense>
        </ErrorBoundary>,
    );
    await findByText('item a');

    endpoint.mockRejectedValueOnce(new Error('Background'));
    await act(async () => {
        await root.item.refetch();
    });
    getByText('item a');
    expect(result.error.message).toBe('Background');
    expect(result.isRefetchError).toBe(true);
});
