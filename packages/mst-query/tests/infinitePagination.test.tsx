import * as React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, cleanup, render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, isAlive, types } from 'mobx-state-tree';
import {
    createContext,
    createInfiniteQuery,
    createRootStore,
    QueryClient,
    useInfiniteQuery,
} from '../src';

const endpoint = vi.fn();

const Pages = createInfiniteQuery('PaginationSourcePages', {
    data: types.model({ items: types.array(types.string) }),
    request: types.model({ id: types.string }),
    pagination: types.model({ offset: types.number }),
    endpoint,
    onQueryMore({ query, data }) {
        query.data?.items.push(...data.items);
    },
});
const Root = createRootStore({ pages: types.optional(Pages, {}) });

const cleanups: (() => void)[] = [];
beforeEach(() => {
    endpoint.mockReset();
    endpoint.mockImplementation(async ({ request, pagination }) => ({
        items: [`${request.id}@${pagination?.offset ?? 0}`],
    }));
});
afterEach(() => {
    cleanup();
    cleanups.splice(0).forEach((dispose) => dispose());
    vi.restoreAllMocks();
});

const setup = () => {
    const client = new QueryClient({ RootStore: Root, gcInterval: Infinity }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    const { QueryClientProvider } = createContext(client);
    let result: any;
    const Comp = observer((props: { id?: string; offset?: number; options?: any }) => {
        result = useInfiniteQuery(client.rootStore.pages, {
            request: { id: props.id ?? 'a' },
            ...(props.offset === undefined ? {} : { pagination: { offset: props.offset } }),
            ...props.options,
        });
        return <div>{result.data?.items.join(',') ?? 'loading'}</div>;
    });
    return {
        root: client.rootStore,
        Comp,
        result: () => result,
        render: (ui: React.ReactElement) => r(ui, { wrapper: QueryClientProvider as any }),
    };
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
    state = { error: null as any };
    static getDerivedStateFromError(error: any) {
        return { error };
    }
    render() {
        return this.state.error ? <div>{this.state.error.message}</div> : this.props.children;
    }
}

const sourceError =
    /both by changing the pagination option of useInfiniteQuery and by calling queryMore/;

test('a fixed pagination option is an initial value that queryMore can move on from', async () => {
    const { result, render, Comp } = setup();
    const { findByText, rerender } = render(<Comp offset={0} />);
    await findByText('a@0');

    await act(() => result().queryMore({ pagination: { offset: 1 } }));
    rerender(<Comp offset={0} />);
    await findByText('a@0,a@1');
    await act(() => result().queryMore({ pagination: { offset: 2 } }));
    await findByText('a@0,a@1,a@2');
    expect(endpoint).toHaveBeenCalledTimes(3);
});

test('omitting the pagination option leaves paging to queryMore', async () => {
    const { result, render, Comp } = setup();
    const { findByText } = render(<Comp />);
    await findByText('a@0');

    await act(() => result().queryMore({ pagination: { offset: 1 } }));
    await findByText('a@0,a@1');
});

test('queryMore is rejected after the pagination option has loaded pages', async () => {
    const { root, result, render, Comp } = setup();
    const { findByText, rerender } = render(<Comp offset={0} />);
    await findByText('a@0');
    rerender(<Comp offset={1} />);
    await findByText('a@0,a@1');

    await expect(result().queryMore({ pagination: { offset: 2 } })).rejects.toThrow(sourceError);
    await expect(root.pages.queryMore({ pagination: { offset: 2 } })).rejects.toThrow(
        sourceError,
    );
    expect(root.pages.isFetchingMore).toBe(false);

    rerender(<Comp offset={2} />);
    await findByText('a@0,a@1,a@2');
    expect(endpoint).toHaveBeenCalledTimes(3);
});

test('changing the pagination option after queryMore throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, render, Comp } = setup();
    const ui = (offset: number) => (
        <ErrorBoundary>
            <Comp offset={offset} />
        </ErrorBoundary>
    );
    const { findByText, rerender } = render(ui(0));
    await findByText('a@0');
    await act(() => result().queryMore({ pagination: { offset: 1 } }));

    rerender(ui(2));
    await findByText(sourceError);
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test("refetchOnChanged 'request' ignores pagination option changes, so queryMore stays allowed", async () => {
    const { result, render, Comp } = setup();
    const options = { refetchOnChanged: 'request' };
    const { findByText, rerender } = render(<Comp offset={0} options={options} />);
    await findByText('a@0');
    rerender(<Comp offset={5} options={options} />);

    await act(() => result().queryMore({ pagination: { offset: 1 } }));
    await findByText('a@0,a@1');
    expect(endpoint).toHaveBeenCalledTimes(2);
});

test('a new request lets its pages be loaded the other way', async () => {
    const { result, render, Comp } = setup();
    const { findByText, rerender } = render(<Comp offset={0} />);
    await findByText('a@0');
    rerender(<Comp offset={1} />);
    await findByText('a@0,a@1');

    rerender(<Comp id="b" offset={1} />);
    await findByText('b@1');
    await act(() => result().queryMore({ pagination: { offset: 2 } }));
    await findByText('b@1,b@2');
});

test('queryMore is allowed again once the hook unmounts', async () => {
    const { root, render, Comp } = setup();
    const view = render(<Comp offset={0} />);
    await view.findByText('a@0');
    view.rerender(<Comp offset={1} />);
    await view.findByText('a@0,a@1');
    view.unmount();

    await root.pages.queryMore({ pagination: { offset: 2 } });
    expect(root.pages.data?.items).toEqual(['a@0', 'a@1', 'a@2']);
});
