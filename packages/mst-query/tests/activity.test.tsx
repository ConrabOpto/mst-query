import * as React from 'react';
import { Activity } from 'react';
import { test, vi, expect, afterEach } from 'vitest';
import { act, cleanup, render as r, configure } from '@testing-library/react';
import { observer } from 'mobx-react';
import { configure as configureMobx } from 'mobx';
import { useInfiniteQuery, useMutation, useQuery } from '../src';
import { QueryClient } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';
import { Root } from './models/RootStore';
import { itemData, listData } from './api/data';
import { wait } from './utils';

const setup = ({ strictMode = false } = {}) => {
    const queryClient = new QueryClient({ RootStore: Root });
    queryClient.init();
    const { QueryClientProvider } = createContext(queryClient);
    configure({ reactStrictMode: strictMode });

    return {
        q: queryClient.rootStore.serviceStore.itemServiceStore,
        render: (ui: React.ReactElement) => r(ui, { wrapper: QueryClientProvider }),
    };
};

afterEach(() => {
    cleanup();
    configure({ reactStrictMode: false });
});

const renderInActivity = (
    render: (ui: React.ReactElement) => ReturnType<typeof r>,
    Comp: React.ComponentType,
) => {
    const ui = (mode: 'visible' | 'hidden') => (
        <Activity mode={mode}>
            <Comp />
        </Activity>
    );
    const result = render(ui('visible'));
    return {
        ...result,
        hide: () => act(() => result.rerender(ui('hidden'))),
        show: () => act(() => result.rerender(ui('visible'))),
    };
};

test('useQuery refetches on resume when invalidated while hidden', async () => {
    const { render, q } = setup();
    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: 'test' },
            staleTime: 60_000,
            meta: { getItem },
        });
        return null;
    });

    const { hide, show } = renderInActivity(render, Comp);
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);

    await hide();
    expect(q.itemQuery.__MstQueryHandler.queryObservers).toHaveLength(0);

    q.itemQuery.invalidate();
    expect(getItem).toHaveBeenCalledTimes(1);

    await show();
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(2);
    expect(q.itemQuery.__MstQueryHandler.queryObservers).toHaveLength(1);
});

test('useQuery applies staleTime on resume', async () => {
    const { render, q } = setup();
    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQuery, { request: { id: 'test' }, meta: { getItem } });
        return null;
    });

    const { hide, show } = renderInActivity(render, Comp);
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);

    await hide();
    await show();
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(2);
});

test('useQuery does not refetch fresh data on resume', async () => {
    const { render, q } = setup();
    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: 'test' },
            staleTime: 60_000,
            meta: { getItem },
        });
        return null;
    });

    const { hide, show } = renderInActivity(render, Comp);
    await wait(0);

    await hide();
    await show();
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);
});

test('useQuery respects refetchOnMount never on resume', async () => {
    const { render, q } = setup();
    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: 'test' },
            refetchOnMount: 'never',
            meta: { getItem },
        });
        return null;
    });

    const { hide, show } = renderInActivity(render, Comp);
    await wait(0);

    await hide();
    q.itemQuery.invalidate();
    await show();
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);
});

test('useQuery in strict mode fetches once on mount', async () => {
    const { render, q } = setup({ strictMode: true });
    const getItem = vi.fn(() => Promise.resolve(itemData));

    const Comp = observer(() => {
        useQuery(q.itemQuery, { request: { id: 'test' }, meta: { getItem } });
        return null;
    });

    render(<Comp />);
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(q.itemQuery.__MstQueryHandler.queryObservers).toHaveLength(1);
});

test('useQuery in strict mode refetches stale data once on mount', async () => {
    const { render, q } = setup({ strictMode: true });
    const getItem = vi.fn(() => Promise.resolve(itemData));
    await q.itemQuery.query({ request: { id: 'test' }, meta: { getItem } });
    getItem.mockClear();

    const Comp = observer(() => {
        useQuery(q.itemQuery, { request: { id: 'test' }, meta: { getItem } });
        return null;
    });

    render(<Comp />);
    await wait(0);
    expect(getItem).toHaveBeenCalledTimes(1);
});

test('useInfiniteQuery keeps its subscription across renders', async () => {
    const { render, q } = setup();
    const getItems = vi.fn(() => Promise.resolve(listData));
    const removeQueryObserver = vi.spyOn(q.listQuery.__MstQueryHandler, 'removeQueryObserver');

    let setCount: (count: number) => void = () => {};
    const Comp = observer(() => {
        const [count, set] = React.useState(0);
        setCount = set;
        useInfiniteQuery(q.listQuery, { staleTime: 60_000, meta: { getItems, count } });
        return null;
    });

    render(<Comp />);
    await wait(0);

    await act(async () => setCount(1));
    await act(async () => setCount(2));

    expect(removeQueryObserver).not.toHaveBeenCalled();
    expect(q.listQuery.__MstQueryHandler.queryObservers).toHaveLength(1);
    expect(getItems).toHaveBeenCalledTimes(1);
});

test('useInfiniteQuery refetches on resume when invalidated while hidden', async () => {
    const { render, q } = setup();
    const getItems = vi.fn(() => Promise.resolve(listData));

    const Comp = observer(() => {
        useInfiniteQuery(q.listQuery, { staleTime: 60_000, meta: { getItems } });
        return null;
    });

    const { hide, show } = renderInActivity(render, Comp);
    await wait(0);
    expect(getItems).toHaveBeenCalledTimes(1);

    await hide();
    expect(q.listQuery.__MstQueryHandler.queryObservers).toHaveLength(0);

    q.listQuery.invalidate();
    expect(getItems).toHaveBeenCalledTimes(1);

    await show();
    await wait(0);
    expect(getItems).toHaveBeenCalledTimes(2);
});

test('useMutation stops receiving onMutate while hidden and after unmount', async () => {
    configureMobx({ enforceActions: 'never' });
    const { render, q } = setup();
    await q.itemQuery.query({ request: { id: 'test' } });

    const onMutate = vi.fn();
    let mutate: any;
    const Comp = observer(() => {
        [mutate] = useMutation(q.setDescriptionMutation, { onMutate });
        return null;
    });

    const { hide, show, unmount } = renderInActivity(render, Comp);
    const handler = q.setDescriptionMutation.__MstQueryHandler;
    expect(handler.queryObservers).toHaveLength(1);

    await hide();
    expect(handler.queryObservers).toHaveLength(0);
    await q.setDescriptionMutation.mutate({ request: { id: 'test', description: 'a' } });
    expect(onMutate).not.toHaveBeenCalled();

    await show();
    expect(handler.queryObservers).toHaveLength(1);
    await act(() => mutate({ request: { id: 'test', description: 'b' } }));
    expect(onMutate).toHaveBeenCalledTimes(1);

    unmount();
    expect(handler.queryObservers).toHaveLength(0);
    configureMobx({ enforceActions: 'observed' });
});
