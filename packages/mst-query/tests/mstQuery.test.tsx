import * as React from 'react';
import { test, vi, expect } from 'vitest';
import { types, unprotect, applySnapshot, getSnapshot } from 'mobx-state-tree';
import { useQuery, useQueryMore, useMutation, MstQueryRef, createQuery } from '../src';
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

    await q.getItem({ id: 'test ' });
    await q.getItem2({ id: 'test2' });
    expect(queryClient.rootStore.itemStore.models.size).toBe(1);
    expect(queryClient.rootStore.userStore.models.size).toBe(1);
    expect(queryClient.rootStore.listStore.models.size).toBe(0);

    await q.getItems({ id: 'test' });
    expect(queryClient.rootStore.itemStore.models.size).toBe(4);
    expect(queryClient.rootStore.userStore.models.size).toBe(4);
    expect(queryClient.rootStore.listStore.models.size).toBe(1);

    expect(queryClient.queryStore.models.size).toBe(9);

    q.listQuery.__MstQueryHandler.updateData(null);
    q.itemQuery2.__MstQueryHandler.updateData(null);
    await wait();
    q.itemQuery2.__MstQueryHandler.updateData(itemData);
    q.listQuery.__MstQueryHandler.updateData(listData);
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

    await q.getItem({ id: 'test' });

    await q.setDescription({ id: 'test', description: 'new' });

    expect(q.itemQuery.data?.description).toBe('new');
});

test('isLoading state', async () => {
    const { q, queryClient } = setup();

    expect(q.itemQuery.isLoading).toBe(false);
    q.getItem({ id: 'test' });
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
        useQuery(q.itemQuery, q.getItem, {
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
    const { render, q } = setup();

    let loadingStates: boolean[] = [false];

    const sub = reaction(
        () => q.addItemMutation.isLoading,
        (isLoading) => {
            loadingStates.push(isLoading);
        }
    );

    const Comp = observer(() => {
        useQuery(q.listQuery, q.getItems);
        const [add] = useMutation(q.addItemMutation, q.addItem);
        return (
            <div>
                <button
                    type="button"
                    data-testid="add"
                    onClick={() => {
                        add({ path: 'test', message: 'new message' });
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
        const { query } = useQuery(q.itemQuery, q.getItem, {
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

    const queryAction = (request: any, pagination: any) =>
        q.getItems(request, {}, { endpoint: customApi.getItems });
    const queryMoreAction = (request: any, pagination: any) =>
        q.getMoreItems(request, pagination, { endpoint: customApi.getItems });

    const Comp = observer(() => {
        useQueryMore(q.listQuery, queryAction, queryMoreAction, {
            pagination: { offset: offset.get() },
        });
        return <div></div>;
    });
    render(<Comp />);

    await when(() => q.listQuery.isFetched);

    // offset.set(4);
    // await wait(0);
    // await when(() => !q.listQuery.isFetchingMore);
    // expect(q.listQuery.isLoading).toBe(false);

    // expect(isFetchingMoreStates).toEqual([false, true, false]);
    // expect(q.listQuery.data?.items.length).toBe(7);

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

    const queryAction = (request: { id: string }) =>
        q.getItem(request, { endpoint: apiWithError.getItem });

    const Comp = observer(() => {
        useQuery(q.itemQuery, queryAction, {
            request: { id: 'test' },
            onError(error) {
                err = error;
            },
        });
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

    const queryAction = (request: any) => q.getItems(request, {}, { endpoint: customApi.getItems });
    const Comp = observer(() => {
        const { query } = useQuery(q.listQuery, queryAction, {
            request: { id: 'test' },
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

    await q.getItem({ id: 'test' }, { endpoint: testApi.getItem });

    await q.setDescription({ id: 'test', description: 'new' });
    await q.itemQuery.refetch({ endpoint: testApi.getItem });

    expect(getItem).toHaveBeenCalledTimes(2);
    expect(q.itemQuery.data?.description).toBe('Test item');
});

test('mutation updates query (with optimistic update)', async () => {
    const { q } = setup();

    await q.getItems({ id: 'test' });
    expect(q.listQuery.data?.items.length).toBe(4);

    let observeCount = 0;
    const dispose = reaction(
        () => q.listQuery.data?.items.map((i) => i.id),
        () => {
            observeCount++;
        }
    );

    await q.addItem({ path: 'test', message: 'testing' });

    expect(observeCount).toBe(2);
    expect(q.listQuery.data?.items.length).toBe(5);

    dispose();
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
    const { queryClient } = setup();

    configureMobx({ enforceActions: 'never' });

    const a = DeepModelA.create({}, queryClient.config.env);
    unprotect(a);
    const result = merge(
        { model: { a: 'banana' }, ref: { id: '1', a: 'fruit' } },
        DeepModelA,
        queryClient.config.env
    );
    applySnapshot(a, getSnapshot(result));
    const result2 = merge(
        { model: { a: 'banana', b: 'apple' }, ref: { id: '1', a: 'orange' } },
        DeepModelA,
        queryClient.config.env
    );
    applySnapshot(a, getSnapshot(result2));

    expect(a.model?.a).toBe('banana');
    expect(a.model?.b).toBe('apple');
    expect(a.ref?.a).toBe('orange');

    configureMobx({ enforceActions: 'observed' });
});

test('merge frozen type', () => {
    const { rootStore } = setup();

    rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
        id: 'test',
        frozen: { data1: 'data1', data2: 'data2' },
    });

    expect(() =>
        rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
            id: 'test',
            frozen: { data1: 'data1', data2: 'data2' },
        })
    ).not.toThrow();
});

test('replace arrays on sub properties', () => {
    const { rootStore } = setup();

    rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
        id: 'test',
        prop: { ids: [{ baha: 'hey' }, { baha: 'hello' }] },
    });
    rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
        id: 'test',
        prop: { ids: [{ baha: 'hey2' }, { baha: 'hello2' }] },
    });
    expect(rootStore.serviceStore.frozenQuery.data?.prop?.ids[0].baha).toBe('hey2');
});

test('merge with undefined data and union type', () => {
    const { rootStore } = setup();

    expect(() =>
        rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
            id: 'test',
            folderPath: 'test',
            origin: undefined,
        })
    ).not.toThrow();
});

test('findAll', () => {
    const { q, queryClient } = setup();

    q.getItem({ id: 'test' });

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

    const queryAction = (request: any) => q.getItem(request, { endpoint: testApi.getItem });

    const Comp = observer(() => {
        const { query } = useQuery(q.itemQuery, queryAction, {
            request: { id: 'test' },
            staleTime: 1,
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

test('hook - two useQuery on the same query', async () => {
    const { render, q } = setup();

    const onSuccess1 = vi.fn();
    const onSuccess2 = vi.fn();

    const Comp1 = observer(() => {
        const { query: q1 } = useQuery(q.listQuery, q.getItems, {
            request: {},
            onSuccess: onSuccess1,
        });
        const { query: q2 } = useQuery(q.listQuery, q.getItems, {
            request: {},
            onSuccess: onSuccess2,
        });
        return <div></div>;
    });
    render(<Comp1 />);

    await wait(0);

    expect(onSuccess1).toBeCalledTimes(1);
    expect(onSuccess2).toBeCalledTimes(1);
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

    const queryAction = (request: any) => q.getItems(request, {}, { endpoint: testApi.getItems });

    let id = observable.box('test');

    const Comp = observer(() => {
        useQuery(q.listQuery, queryAction, {
            request: { id: id.get() },
        });
        return <div></div>;
    });
    render(<Comp />);

    id.set('test2');

    await wait(2);

    expect(q.listQuery.data?.items.length).toBe(0);

    configureMobx({ enforceActions: 'observed' });
});

test('hook - onSuccess callback called', async () => {
    const { render, q } = setup();

    const onSuccess = vi.fn();
    const getItems = vi.fn(() => Promise.resolve(listData));
    const testApi = {
        ...api,
        getItems: () => getItems(),
    };

    const queryAction = (request: any) => q.getItems(request, {}, { endpoint: testApi.getItems });

    const Comp = observer(() => {
        const { query } = useQuery(q.listQuery, queryAction, {
            request: {},
            onSuccess: onSuccess,
        });
        return <div></div>;
    });

    render(<Comp />);
    await when(() => !q.listQuery.isLoading);

    expect(onSuccess).toBeCalledTimes(1);
});

test('hook - enabled prop', async () => {
    const { render, q } = setup();

    configureMobx({ enforceActions: 'never' });

    const enabled = observable.box(false);

    const Comp = observer(() => {
        const { query } = useQuery(q.listQuery, q.getItems, {
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

test('support map type', () => {
    const { rootStore } = setup();

    rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
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
        rootStore.serviceStore.frozenQuery.__MstQueryHandler.updateData({
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

    const onUpdate = (url: string, callback: any) => (data: any) => callback(data);
    let updater: any;
    await q.getItemSubscription({ id: 'test' }, { 
        async endpoint({ request, setData }: any) {
            updater = onUpdate(`item/${request.id}`, (data: any) => {
                setData(data);
            });
        }
    });
    expect(q.subscriptionQuery.isLoading).toBe(false);

    updater(itemData);
    expect(q.subscriptionQuery.data?.count).toBe(4);

    updater({
        ...itemData,
        count: 5
    });

    expect(q.subscriptionQuery.data?.count).toBe(5);
});
