import * as React from 'react';
import { PassThrough } from 'node:stream';
import { test, expect, vi, afterEach } from 'vitest';
import { renderToPipeableStream } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from '@testing-library/react';
import { observer } from 'mobx-react';
import { QueryClient, DehydratedState } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';
import { HydrationBoundary } from '../src/HydrationBoundary';
import { useSuspenseQuery } from '../src/hooks';
import { Root } from './models/RootStore';
import { itemData } from './api/data';
import { wait } from './utils';

afterEach(() => {
    document.body.innerHTML = '';
});

const { QueryClientProvider } = createContext(new QueryClient({ RootStore: Root }));

const prefetchStreamed = () => {
    const server = new QueryClient({ RootStore: Root }).init();
    let resolve!: (value: any) => void;
    const response = new Promise((res) => {
        resolve = res;
    });
    server.prefetchQuery(server.rootStore.serviceStore.itemServiceStore.itemQuery, {
        request: { id: 'test' },
        meta: { getItem: () => response },
    });
    return { state: server.dehydrate(), resolve: () => resolve(itemData) };
};

const Item = observer(
    ({ client, getItem }: { client: QueryClient<typeof Root>; getItem: () => any }) => {
        const { data } = useSuspenseQuery(client.rootStore.serviceStore.itemServiceStore.itemQuery, {
            request: { id: 'test' },
            meta: { getItem },
        });
        return <p>{data.description}</p>;
    },
);

const App = ({
    client,
    state,
    getItem,
}: {
    client: QueryClient<typeof Root>;
    state: DehydratedState;
    getItem: () => any;
}) => (
    // Fizz holds back a shell that has no host element outside the Suspense boundary
    <main>
        <QueryClientProvider client={client}>
            <HydrationBoundary state={state}>
                <React.Suspense fallback={<p>loading</p>}>
                    <Item client={client} getItem={getItem} />
                </React.Suspense>
            </HydrationBoundary>
        </QueryClientProvider>
    </main>
);

const renderToHtml = (element: React.ReactElement, waitForAll: boolean) => {
    const chunks: string[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk) => chunks.push(chunk.toString()));
    const done = new Promise<string>((resolve) => stream.on('end', () => resolve(chunks.join(''))));

    const shell = new Promise<void>((resolve, reject) => {
        const { pipe } = renderToPipeableStream(element, {
            onShellReady() {
                if (!waitForAll) {
                    pipe(stream);
                }
                resolve();
            },
            onAllReady() {
                if (waitForAll) {
                    pipe(stream);
                }
            },
            onShellError: reject,
        });
    });

    return { shell, done, html: () => chunks.join('') };
};

test('server rendering streams the fallback and then the hydrated data', async () => {
    const { state, resolve } = prefetchStreamed();
    const getItem = vi.fn();

    const result = renderToHtml(
        <App client={new QueryClient({ RootStore: Root })} state={state} getItem={getItem} />,
        false,
    );

    await result.shell;
    await vi.waitFor(() => expect(result.html()).toContain('loading'));
    expect(result.html()).not.toContain(itemData.description);

    resolve();
    expect(await result.done).toContain(itemData.description);
    expect(getItem).not.toHaveBeenCalled();
});

test('server rendered html hydrates in the browser without refetching or mismatches', async () => {
    const { state, resolve } = prefetchStreamed();
    resolve();

    const ssrGetItem = vi.fn();
    const html = await renderToHtml(
        <App client={new QueryClient({ RootStore: Root })} state={state} getItem={ssrGetItem} />,
        true,
    ).done;
    expect(html).toContain(itemData.description);

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const browserGetItem = vi.fn();
    const onRecoverableError = vi.fn();
    const browserClient = new QueryClient({ RootStore: Root });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
        hydrateRoot(
            container,
            <App client={browserClient} state={state} getItem={browserGetItem} />,
            { onRecoverableError },
        );
    });
    await act(() => wait(0));
    // Server and browser renderers share a process here, which React only warns about in tests
    const errors = consoleError.mock.calls.filter(
        ([message]) => !String(message).includes('Detected multiple renderers'),
    );
    consoleError.mockRestore();

    expect(errors).toEqual([]);
    expect(container.textContent).toBe(itemData.description);
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(ssrGetItem).not.toHaveBeenCalled();
    expect(browserGetItem).not.toHaveBeenCalled();
    expect(browserClient.rootStore.itemStore.models.get('test')?.description).toBe(
        itemData.description,
    );
});

test('concurrent server renders keep their data separate', async () => {
    const first = prefetchStreamed();
    const second = prefetchStreamed();
    const firstClient = new QueryClient({ RootStore: Root });
    const secondClient = new QueryClient({ RootStore: Root });
    const getItem = vi.fn();

    const firstRender = renderToHtml(
        <App client={firstClient} state={first.state} getItem={getItem} />,
        true,
    );
    const secondRender = renderToHtml(
        <App client={secondClient} state={second.state} getItem={getItem} />,
        true,
    );

    first.resolve();
    await firstRender.done;
    expect(firstClient.rootStore.serviceStore.itemServiceStore.itemQuery.data).toBeTruthy();
    expect(secondClient.rootStore.serviceStore.itemServiceStore.itemQuery.data).toBeNull();

    second.resolve();
    await secondRender.done;
    expect(secondClient.rootStore.serviceStore.itemServiceStore.itemQuery.data).toBeTruthy();
    expect(getItem).not.toHaveBeenCalled();
});
