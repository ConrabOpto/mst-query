import * as React from 'react';
import { beforeEach, afterEach, test, vi, expect } from 'vitest';
import { types, unprotect, applySnapshot, getSnapshot } from 'mobx-state-tree';
import { createQuery, MstQueryRef, useQuery, useSubscription } from '../src';
import { configure as configureMobx, observable, reaction, runInAction, when } from 'mobx';
import { collectSeenIdentifiers } from '../src/QueryStore';
import { merge } from '../src/merge';
import { gc } from '../src/gc';
import { render as r } from '@testing-library/react';
import { observer } from 'mobx-react';
import { ItemQuery } from './models/ItemQuery';
import { ListQuery } from './models/ListQuery';
import { itemData, listData } from './api/data';
import { SetDescriptionMutation } from './models/SetDescriptionMutation';
import { AddItemMutation } from './models/AddItemMutation';
import { api } from './api/api';
import { wait } from './utils';
import { QueryClient } from '../src/QueryClient';
import { createContext } from '../src/QueryClientProvider';
import { RootStore } from '../src/RootStore';
import { ItemSubscription } from './models/ItemSubscription';
import { useEffect } from 'react';

const env = {};

const queryClient = new QueryClient({ RootStore });

const { QueryClientProvider, createOptimisticData, prefetch, create } = createContext(queryClient);
queryClient.init(env);

const Wrapper = ({ children }: any) => {
    return (
        <QueryClientProvider client={queryClient} env={env}>
            {children}
        </QueryClientProvider>
    );
};

const render = (ui: React.ReactElement, options?: any) =>
    r(ui, {
        wrapper: Wrapper,
        ...options,
    });

beforeEach(() => {
    queryClient.queryStore.clear();
});

afterEach(() => {
    vi.useRealTimers();
});

test('garbage collection', async () => {
    const q1 = await prefetch(ItemQuery, {
        request: { id: 'test' },
        queryFn: api.getItem,
        cacheTime: 0,
    });
    const q2 = await prefetch(ItemQuery, {
        request: { id: 'test2' },
        queryFn: api.getItem,
        cacheTime: 0,
    });
    expect(queryClient.rootStore.models.size).toBe(2);

    const qc = await prefetch(ListQuery, {
        request: { id: 'test' },
        queryFn: api.getItems,
        cacheTime: 0,
    });
    expect(queryClient.rootStore.models.size).toBe(9);

    qc.__MstQueryHandler.updateData(null, { error: null, isLoading: false });
    q2.__MstQueryHandler.updateData(null, { error: null, isLoading: false });
    await wait();
    q2.__MstQueryHandler.updateData(itemData, { error: null, isLoading: false });
    qc.__MstQueryHandler.updateData(listData, { error: null, isLoading: false });
    await wait();
    await gc(q1);
    expect(queryClient.rootStore.models.size).toBe(9);

    await gc(qc);
    expect(queryClient.rootStore.models.size).toBe(2);

    await gc(q2);
    expect(queryClient.rootStore.models.size).toBe(0);
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
    const itemQuery = await prefetch(ItemQuery, { request: { id: 'test' }, queryFn: api.getItem });

    await prefetch(SetDescriptionMutation, {
        request: { id: 'test', description: 'new' },
        queryFn: api.setDescription
    });

    expect(itemQuery.data?.description).toBe('new');
});

test('isLoading state', async () => {
    const itemQuery = create(ItemQuery, { queryFn: api.getItem });
    expect(itemQuery.isLoading).toBe(false);
    itemQuery.run({ id: 'test' });
    expect(itemQuery.isLoading).toBe(true);

    await when(() => !itemQuery.isLoading);
    expect(itemQuery.isLoading).toBe(false);
});

test('useQuery', async () => {
    let loadingStates: any[] = [];
    let renders = 0;
    let result = null as any;
    const Comp = observer((props: any) => {
        const { query, isLoading } = useQuery(ItemQuery, {
            request: { id: 'test' },
            queryFn: api.getItem,
        });
        renders++;
        loadingStates.push(isLoading);
        result = query.__MstQueryHandler.result;
        return <div></div>;
    });
    render(<Comp />);
    
    await wait(0);
    
    expect(result).not.toBe(null);
    expect(loadingStates).toStrictEqual([true, false]);
    expect(renders).toBe(2);
});

test.only('useQuery - reactive request', async () => {
    configureMobx({ enforceActions: 'never' });

    let id = observable.box('test');
    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ItemQuery, {
            request: { id: id.get() },
            queryFn: api.getItem,
        });
        q = query;
        return <div></div>;
    });
    render(<Comp />);
    
    await wait(0);
    expect(q.data.id).toBe('test');
    
    id.set('different-test');
    await wait(0);
    expect(q.data.id).toBe('different-test');
    expect(q.variables.request.id).toBe('different-test');

    configureMobx({ enforceActions: 'observed' });
});

test('query more - with initial result', async () => {
    const customApi = {
        ...api,
        async getItems(options: any, query: any) {
            if (!query.isFetched) {
                return listData;
            }
            return api.getItems(options);
        },
    };

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            pagination: { offset: 0 },
            queryFn: customApi.getItems,
        });
        q = query;
        return <div></div>;
    });
    render(<Comp />);

    await when(() => !q.isLoading);

    await q.fetchMore(4);

    expect(q.data.items.length).toBe(7);
});

test('useQuery - with error', async () => {
    let err: any = null;
    const customError = new Error();
    const apiWithError = {
        async getItem() {
            throw customError;
        },
    };
    const Comp = observer((props: any) => {
        const { error } = useQuery(ItemQuery, {
            request: { id: 'test ' },
            queryFn: apiWithError.getItem,
        });
        err = error;
        return <div></div>;
    });
    render(<Comp />);
    
    await wait(0);

    expect(err).toEqual(customError);
});

test('model with optional identifier', async () => {
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

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            queryFn: customApi.getItems,
        });
        q = query;
        return <div></div>;
    });
    render(<Comp />);

    await when(() => !q.isLoading);

    const model = queryClient.rootStore.models.get('ListModel:optional-1');
    expect(model).not.toBe(undefined);
});

test('refetching query', async () => {
    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };
    const itemQuery = create(ItemQuery, {
        queryFn: testApi.getItem,
        staleTime: 1,
    });
    await itemQuery.run({ id: 'test' });

    const mutation = create(SetDescriptionMutation, {
        queryFn: testApi.setDescription
    });
    await mutation.run({ id: 'test', description: 'new' });

    await itemQuery.refetch();

    expect(itemQuery.data?.description).toBe('Test item');
    expect(getItem).toHaveBeenCalledTimes(2);
});

test('mutation updates query (with optimistic update)', async () => {
    const listQuery = create(ListQuery, {
        queryFn: api.getItems,
    });

    await listQuery.run({ id: 'test' });
    expect(listQuery.data?.items.length).toBe(4);

    let observeCount = 0;
    const dispose = reaction(
        () => listQuery.data?.items.map((i) => i.id),
        () => {
            observeCount++;
        }
    );

    const addItemMutation = create(AddItemMutation, {
        queryFn: api.addItem
    });
    await addItemMutation.run({ path: 'test', message: 'testing' });

    expect(observeCount).toBe(2);
    expect(listQuery.data?.items.length).toBe(5);

    dispose();
});

test('merge of date objects', () => {
    configureMobx({ enforceActions: 'never' });

    const ModelA = types.model({
        id: types.identifier,
        changed: types.model({
            at: types.Date,
        }),
    });
    const a = ModelA.create({
        id: 'test',
        changed: {
            at: new Date('2020-01-01'),
        },
    });
    unprotect(a);
    merge(
        {
            id: 'test',
            changed: {
                at: new Date('2020-02-02'),
            },
        },
        ModelA,
        queryClient.config.env
    );
    const result = merge(
        {
            id: 'test',
            changed: {
                at: new Date('2020-03-03'),
            },
        },
        ModelA,
        queryClient.config.env
    );
    expect((getSnapshot(result) as any).changed.at).toBe(1583193600000);

    configureMobx({ enforceActions: 'observed' });
});

test('deep update of object', () => {
    configureMobx({ enforceActions: 'never' });

    const ModelC = types.model({
        id: types.identifier,
        a: types.maybe(types.string),
    });
    const ModelB = types.model({
        a: types.maybe(types.string),
        b: types.maybe(types.string),
    });
    const ModelA = types.model({
        model: types.maybe(ModelB),
        ref: types.maybe(MstQueryRef(ModelC)),
    });

    const a = ModelA.create({}, queryClient.config.env);
    unprotect(a);
    const result = merge(
        { model: { a: 'banana' }, ref: { id: '1', a: 'fruit' } },
        ModelA,
        queryClient.config.env
    );
    applySnapshot(a, getSnapshot(result));
    const result2 = merge(
        { model: { a: 'banana', b: 'apple' }, ref: { id: '1', a: 'orange' } },
        ModelA,
        queryClient.config.env
    );
    applySnapshot(a, getSnapshot(result2));

    expect(a.model?.a).toBe('banana');
    expect(a.model?.b).toBe('apple');
    expect(a.ref?.a).toBe('orange');

    configureMobx({ enforceActions: 'observed' });
});

test('merge frozen type', () => {
    const ModelWithFrozenProp = types.model({
        id: types.string,
        frozen: types.frozen(),
    });

    const QueryModel = createQuery('FrozenQuery', {
        data: ModelWithFrozenProp,
    });
    const q = create(QueryModel, { request: { path: 'test' } });
    q.__MstQueryHandler.updateData(
        { id: 'test', frozen: { data1: 'data1', data2: 'data2' } },
        { isLoading: false, error: null }
    );

    expect(() =>
        q.__MstQueryHandler.updateData(
            { id: 'test', frozen: { data1: 'data1', data2: 'data2' } },
            { isLoading: false, error: null }
        )
    ).not.toThrow();
});

test('replace arrays on sub properties', () => {
    const Model = types.model({
        id: types.identifier,
        prop: types.model({
            ids: types.array(types.model({ baha: types.string })),
        }),
    });

    const QueryModel = createQuery('FrozenQuery', {
        data: Model,
    });
    const q = create(QueryModel, { request: { path: 'test' } });
    q.__MstQueryHandler.updateData(
        { id: 'test', prop: { ids: [{ baha: 'hey' }, { baha: 'hello' }] } },
        { isLoading: false, error: null }
    );
    q.__MstQueryHandler.updateData(
        { id: 'test', prop: { ids: [{ baha: 'hey2' }, { baha: 'hello2' }] } },
        { isLoading: false, error: null }
    );
    expect(q.data?.prop.ids[0].baha).toBe('hey2');
});

test('merge with undefined data and union type', () => {
    const Model = types.model({
        folderPath: types.string,
        origin: types.union(types.string, types.undefined),
    });

    const QueryModel = createQuery('TestQuery', {
        data: Model,
    });
    const q = create(QueryModel, { request: { path: 'test' } });

    expect(() =>
        q.__MstQueryHandler.updateData(
            { folderPath: 'test', origin: undefined },
            { isLoading: false, error: null }
        )
    ).not.toThrow();
});

test('findAll', () => {
    const itemQuery = prefetch(ItemQuery, {
        request: { id: 'test' },
        queryFn: api.getItem
    });

    const queries = queryClient.queryStore.findAll(
        ItemQuery,
        (query) => !!query.variables.request?.id.includes('t')
    );
    expect(queries.length).toBe(1);

    const queries2 = queryClient.queryStore.findAll(
        ItemQuery,
        (query) => !!query.variables.request?.id.includes('o')
    );
    expect(queries2.length).toBe(0);
});

test('caching - item', async () => {
    configureMobx({ enforceActions: 'never' });

    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ItemQuery, {
            request: { id: 'test' },
            queryFn: testApi.getItem,
            cacheTime: 1,
            staleTime: 1,
        });
        q = query;
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
    await when(() => !q.isLoading);

    show.set(false);
    await wait(0);
    show.set(true);

    expect(q.data.createdBy.name).toBe('Kim');
    expect(getItem).toBeCalledTimes(1);

    configureMobx({ enforceActions: 'observed' });
});

test('caching - list', async () => {
    let q1: any;
    const Comp1 = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            queryFn: api.getItems,
            pagination: { offset: 0 },
            staleTime: 1,
        });
        q1 = query;
        return <div></div>;
    });
    render(<Comp1 />);

    await when(() => !q1.isLoading);

    await q1.fetchMore(4);
    expect(q1.data.items.length).toBe(7);

    let q2: any;
    const Comp2 = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            pagination: { offset: 0 },
            queryFn: api.getItems,
            staleTime: 1,
        });
        q2 = query;
        return <div></div>;
    });
    render(<Comp2 />);

    await when(() => !q2.isLoading);

    expect(q1.data.items.length).toBe(7);
    expect(q2.data.items.length).toBe(7);
});

test('caching - hit cached request', async () => {
    const getItems = vi.fn(() => Promise.resolve(listData));
    const testApi = {
        ...api,
        getItems: () => getItems(),
    };

    let id = observable.box('test');

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: id.get() },
            pagination: { offset: 0 },
            queryFn: testApi.getItems,
            staleTime: 1,
        });
        q = query;
        if (q.isLoading || !q.data) {
            return <div>loading</div>;
        }
        return <div></div>;
    });

    render(<Comp />);
    await when(() => !q.isLoading);

    runInAction(() => id.set('test2'));
    await when(() => !q.isLoading);

    runInAction(() => id.set('test'));
    await when(() => !q.isLoading);

    expect(getItems).toBeCalledTimes(2);
});

test('caching - dont cache different query functions', async () => {
    let q1: any;
    const Comp1 = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            pagination: { offset: 0 },
            queryFn: api.getItems,
            staleTime: 1,
        });
        q1 = query;
        return <div></div>;
    });
    render(<Comp1 />);

    await when(() => !q1.isLoading);

    const getItems = vi.fn(() => Promise.resolve(listData));

    const differentApi = {
        getItems: () => getItems(),
    };

    let q2: any;
    const Comp2 = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            pagination: { offset: 0 },
            queryFn: differentApi.getItems,
            staleTime: 1,
        });
        q2 = query;
        return <div></div>;
    });
    render(<Comp2 />);

    await when(() => !q2.isLoading);

    expect(getItems).toBeCalledTimes(1);
});

test('caching - cache time', async () => {
    configureMobx({ enforceActions: 'never' });

    const getItems = vi.fn(() => Promise.resolve(listData));
    const testApi = {
        ...api,
        getItems: () => getItems(),
    };

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            pagination: { offset: 0 },
            queryFn: testApi.getItems,
            cacheTime: 0.01,
        });
        q = query;
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
    await when(() => !q.isLoading);

    show.set(false);
    expect(q.__MstQueryHandler.isDisposed).toBe(false);

    await wait(20);

    expect(q.__MstQueryHandler.isDisposed).toBe(true);

    configureMobx({ enforceActions: 'observed' });
});

test('hook - onSuccess callback called', async () => {
    const onSuccess = vi.fn();
    const getItems = vi.fn(() => Promise.resolve(listData));
    const testApi = {
        ...api,
        getItems: () => getItems(),
    };

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            pagination: { offset: 0 },
            queryFn: testApi.getItems,
            cacheTime: 0.01,
            onSuccess: onSuccess,
        });
        q = query;
        return <div></div>;
    });

    render(<Comp />);
    await when(() => !q.isLoading);

    expect(onSuccess).toBeCalledTimes(1);
});

test('subscription', () => {
    const Comp = observer((props: any) => {
        useSubscription(ItemSubscription);
        return <div></div>;
    });

    render(<Comp />);
});

test('support map type', () => {
    const AmountTag = {
        Limited: 'Limited',
        Unlimited: 'Unlimited',
    };

    const AmountLimitModel = types.model('AmountLimit').props({
        tag: types.maybe(types.enumeration(Object.values(AmountTag))),
        content: types.maybeNull(
            types.map(
                types.model({
                    tag: types.enumeration(Object.values(AmountTag)),
                    content: types.maybeNull(types.string),
                })
            )
        ),
    });

    const QueryModel = createQuery('QueryWithMap', {
        data: AmountLimitModel,
    });
    const q = create(QueryModel);
    q.__MstQueryHandler.updateData(
        {
            tag: 'Limited',
            content: {
                native: {
                    tag: 'Limited',
                    content: '1000000',
                },
            },
        },
        { isLoading: false, error: null }
    );

    expect(q.data?.content?.get('native')?.tag).toBe('Limited');
});

test('merge with partial data', () => {
    const Model = types.model({
        id: types.string,
        a: types.string,
    });

    const QueryModel = createQuery('ModelQuery', {
        data: Model,
    });
    const q = create(QueryModel, { request: { path: 'test' } });

    expect(() =>
        q.__MstQueryHandler.updateData(
            {
                id: 'test',
                a: 'a',
                optionalProps1: 'optional',
                optionalProps2: ['optional'],
                optionalProps3: { a: 'a' },
            },
            { isLoading: false, error: null }
        )
    ).not.toThrow();
    expect(q.data?.id).toBe('test');
    expect(q.data?.a).toBe('a');
    expect(q.data).not.toHaveProperty('optionalProps1');
    expect(q.data).not.toHaveProperty('optionalProps2');
    expect(q.data).not.toHaveProperty('optionalProps3');
});

test('very large stale time exceeds setTimeout limit', async () => {
    vi.useFakeTimers();
    const getItem = vi.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem: () => getItem(),
    };
    const itemQuery = await prefetch(ItemQuery, {
        staleTime: 0x7fffffff / 1000 + 1,
        queryFn: testApi.getItem,
        request: { id: 'test' }
    });

    expect(getItem).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10);

    await itemQuery.run({ id: 'test' });

    expect(getItem).toHaveBeenCalledTimes(1);
});
