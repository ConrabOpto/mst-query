import * as React from 'react';
import { test, vi, expect } from 'vitest';
import { types, unprotect, applySnapshot, getSnapshot, getRoot, destroy } from 'mobx-state-tree';
import { useQuery, useMutation } from '../src';
import { configure as configureMobx, observable, reaction, when } from 'mobx';
import { collectSeenIdentifiers } from '../src/QueryStore';
import { merge } from '../src/merge';
import { fireEvent, render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { ItemQuery } from './models/ItemQuery';
import { itemData, listData } from './api/data';
import { api } from './api/api';
import { wait } from './utils';
import { QueryClient } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';
import { DateModel, DeepModelA, Root } from './models/RootStore';
import { useVolatileQuery } from '../src/hooks';

const setup = () => {
    const queryClient = new QueryClient({ RootStore: Root });
    const { QueryClientProvider } = createContext(queryClient);
    queryClient.init();
    const Wrapper = ({ children }: any) => <QueryClientProvider>{children}</QueryClientProvider>;
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
                types.array(types.model({ id: types.identifier, b: types.maybe(types.string) }))
            ),
        })
        .volatile(() => ({
            volatileProp: VolatileModel.create({ id: '2' }),
        }));
    const idents = new Set();
    collectSeenIdentifiers(
        ModelA.create({ id: '1', modelProp: 'hey', arr: [{ id: '3' }] }),
        idents
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
        }
    );

    const Comp = observer(() => {
        useQuery(q.itemQuery, {
            request: { id: 'test' },
        });
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(q.itemQuery.result).not.toBe(null);
    expect(loadingStates).toStrictEqual([false, true, false]);

    sub();
});

test('useMutation', async () => {
    const { render, q, rootStore } = setup();

    let loadingStates: boolean[] = [false];

    const sub = reaction(
        () => q.addItemMutation.isLoading,
        (isLoading) => {
            loadingStates.push(isLoading);
        }
    );

    const Comp = observer(() => {
        useQuery(q.listQuery);
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

test('useQueryMore', async () => {
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
        (isFetchingMore) => isFetchingMoreStates.push(isFetchingMore)
    );

    let offset = observable.box(0);

    const Comp = observer(() => {
        useQuery(q.listQuery, {
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
        const { query } = useQuery(q.listQuery, {
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
        queryClient.config.env
    );
    const result = merge(
        {
            id: 'test',
            changed: {
                at: new Date('2020-03-03'),
            },
        },
        DateModel,
        queryClient.config.env
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
        queryClient.config.env
    );
    applySnapshot(a, result);
    const result2 = merge(
        { model: { a: 'banana', b: 'apple' }, ref: { id: '1', a: 'orange' } },
        DeepModelA,
        queryClient.config.env
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
        })
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
        })
    ).not.toThrow();
});

test('findAll', () => {
    const { q, queryClient } = setup();

    q.itemQuery.query({ request: { id: 'test' } });

    const queries = queryClient.queryStore.getQueries(
        ItemQuery,
        (query) => !!query.variables.request?.id.includes('t')
    );
    expect(queries.length).toBe(1);

    const queries2 = queryClient.queryStore.getQueries(
        ItemQuery,
        (query) => !!query.variables.request?.id.includes('o')
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

// TODO: How should this work?
// test('hook - two useQuery on the same query', async () => {
//     const { render, q } = setup();

//     const getItem = vi.fn(() => Promise.resolve(itemData));
//     const testApi = {
//         ...api,
//         getItem: () => getItem(),
//     };

//     const Comp1 = observer(() => {
//         useQuery(q.listQuery, {
//             request: {},
//             endpoint: testApi.getItem
//         });
//         useQuery(q.listQuery, {
//             request: {},
//             endpoint: testApi.getItem
//         });
//         return <div></div>;
//     });
//     render(<Comp1 />);

//     await wait(0);

//     expect(getItem).toBeCalledTimes(1);
// });

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
        useQuery(q.listQuery, {
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
        const { query } = useQuery(q.listQuery, {
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
        'Limited'
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
        })
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

    expect((getItem.mock.calls[0][0] as any).request.filter).toBe(null);
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

    expect((getItem.mock.calls[0][0] as any).request.filter).toBe(null);
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

    const loadingStates: boolean[] = [];
    const Comp = observer(() => {
        const { query, isLoading } = useQuery(q.itemQuery, {
            initialData,
            request: { id: id.get() },
            staleTime: 10,
        });
        loadingStates.push(isLoading);
        return <div></div>;
    });
    render(<Comp />);

    await wait(0);

    expect(loadingStates).toEqual([false, false]);
    expect(q.itemQuery.data?.id).toBe('test');

    id.set('different-test');
    await wait(0);
    expect(q.itemQuery.data?.id).toBe('different-test');
    expect(q.itemQuery.variables.request?.id).toBe('different-test');

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
