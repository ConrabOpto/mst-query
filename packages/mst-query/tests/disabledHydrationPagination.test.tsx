import * as React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { observer } from 'mobx-react';
import { types } from 'mobx-state-tree';
import { createInfiniteQuery, QueryClient, useInfiniteQuery } from '../src';
import { createContext } from '../src/QueryClientProvider';

afterEach(cleanup);

function setup() {
    const endpoint = vi.fn(async (_options: unknown) => ({ items: [] }));
    const Search = createInfiniteQuery('DisabledHydrationSearch', {
        data: types.frozen<{ items: string[] }>(),
        request: types.model({ path: types.string }),
        pagination: types.model({ offset: types.number }),
        endpoint,
    });
    const client = new QueryClient({
        RootStore: types.model({ search: types.optional(Search, {}) }),
        queryOptions: { retry: false },
    }).init();
    const { QueryClientProvider } = createContext(client);
    return { endpoint, search: client.rootStore.search, QueryClientProvider };
}

test('disabled initial-data hydration retains variables without fetching', () => {
    const { endpoint, search, QueryClientProvider } = setup();
    const Probe = observer(() => {
        useInfiniteQuery(search, {
            enabled: false,
            initialData: { items: [] },
            request: { path: 'relation' },
            pagination: { offset: 0 },
            staleTime: Infinity,
        });
        return null;
    });
    render(
        <QueryClientProvider>
            <Probe />
        </QueryClientProvider>,
    );
    expect(search.data).toEqual({ items: [] });
    expect(search.variables.request?.path).toBe('relation');
    expect(search.variables.pagination?.offset).toBe(0);
    expect(endpoint).not.toHaveBeenCalled();
});

test('child pagination on re-enable uses the hydrated request before parent effects run', async () => {
    const { endpoint, search, QueryClientProvider } = setup();
    const List = () => {
        React.useEffect(() => {
            void search.queryMore({ pagination: { offset: 25 } });
        }, []);
        return null;
    };
    const Probe = observer(({ enabled }: { enabled: boolean }) => {
        const { data } = useInfiniteQuery(search, {
            enabled,
            initialData: { items: [] },
            request: { path: 'relation' },
            pagination: { offset: 0 },
            refetchOnChanged: 'none',
            staleTime: Infinity,
        });
        return enabled && data ? <List /> : null;
    });
    const view = render(
        <QueryClientProvider>
            <Probe enabled={false} />
        </QueryClientProvider>,
    );
    expect(endpoint).not.toHaveBeenCalled();
    view.rerender(
        <QueryClientProvider>
            <Probe enabled />
        </QueryClientProvider>,
    );
    await waitFor(() => expect(search.isFetchingMore).toBe(false));
    expect(endpoint).toHaveBeenCalledTimes(1);
    expect(endpoint.mock.calls[0][0]).toMatchObject({
        request: { path: 'relation' },
        pagination: { offset: 25 },
    });
    expect(search.error).toBeNull();
});
