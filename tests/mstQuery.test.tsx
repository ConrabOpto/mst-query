import * as React from 'react';
import { types, unprotect, applySnapshot, getSnapshot } from 'mobx-state-tree';
import { createQuery, create, queryCache, MstQueryRef, createMutation, useQuery } from '../src';
import { configure as configureMobx, reaction } from 'mobx';
import { objMap } from '../src/MstQueryRef';
import { collectSeenIdentifiers } from '../src/cache';
import { merge } from '../src/merge';
import { render } from '@testing-library/react';
import { observer } from 'mobx-react';
import { ItemQuery } from './models/ItemQuery';
import { ListQuery } from './models/ListQuery';
import { itemData, listData, moreListData } from './data';
import { SetDescriptionMutation } from './models/SetDescriptionMutation';
import { AddItemMutation } from './models/AddItemMutation';

const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const api = {
    async getItem() {
        return itemData;
    },
    async getItems({ offset = 0 } = {}) {
        if (offset !== 0) {
            return moreListData;
        }
        return listData;
    },
    async setDescription({ description }: any) {
        return {
            ...itemData,
            description,
        };
    },
    async addItem() {
        return {
            ...itemData,
            id: 'add-test',
            description: 'add',
        };
    },
};

beforeEach(() => {
    queryCache.clear();
});

test('garbage collection', async () => {
    const q1 = create(ItemQuery, { request: { id: 'test' }, env: { api } });
    const q2 = create(ItemQuery, { request: { id: 'test2' }, env: { api } });
    const qc = create(ListQuery, { env: { api } });

    await q1.run();
    await q2.run();
    expect(objMap.size).toBe(2);

    await qc.run();
    expect(objMap.size).toBe(8);

    qc._updateData(null, { error: null, isLoading: false });
    q2._updateData(null, { error: null, isLoading: false });
    await wait();
    q2._updateData(itemData, { error: null, isLoading: false });
    qc._updateData(listData, { error: null, isLoading: false });
    await wait();
    queryCache.removeQuery(q1);
    expect(objMap.size).toBe(8);

    queryCache.removeQuery(qc);
    expect(objMap.size).toBe(2);

    queryCache.removeQuery(q2);
    expect(objMap.size).toBe(0);
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
    const itemQuery = create(ItemQuery, {
        request: { id: 'test' },
        env: { api },
    });
    await itemQuery.run();

    const setStatusMutation = create(SetDescriptionMutation, {
        request: { id: 'test', description: 'new' },
        env: { api },
    });
    await setStatusMutation.run();
    expect(itemQuery.data?.description).toBe('new');
});

test('isLoading state', async () => {
    const itemQuery = create(ItemQuery, {
        request: { id: 'test' },
        env: { api },
    });
    expect(itemQuery.isLoading).toBe(false);
    itemQuery.run();
    expect(itemQuery.isLoading).toBe(true);

    await itemQuery.whenIsDoneLoading();
    expect(itemQuery.isLoading).toBe(false);
});

test('useQuery', (done) => {
    let loadingStates: any[] = [];
    let renders = 0;
    let result = null as any;
    const Comp = observer((props: any) => {
        const { query, isLoading } = useQuery(ItemQuery, {
            request: { id: 'test' },
            env: { api },
        });
        renders++;
        loadingStates.push(isLoading);
        result = query.result;
        return <div></div>;
    });
    render(<Comp />);
    setTimeout(() => {
        expect(result).not.toBe(null);
        expect(loadingStates).toStrictEqual([true, false]);
        expect(renders).toBe(2);
        done();
    }, 0);
});

test('useQuery - with initial result', async () => {
    const getItem = jest.fn();
    const testApi = {
        ...api,
        getItem,
    };

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ItemQuery, {
            request: { id: 'test' },
            initialResult: itemData,
            env: { api: testApi },
        });
        q = query;
        return <div></div>;
    });
    render(<Comp />);

    await q.whenIsDoneLoading();

    expect(getItem).not.toBeCalled();
    expect(q.data.id).toBe('test');
});

test('useQuery - with error', (done) => {
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
            env: { api: apiWithError },
        });
        err = error;
        return <div></div>;
    });
    render(<Comp />);
    setTimeout(() => {
        expect(err).toEqual(customError);
        done();
    }, 0);
});

test('query more - with initial result', async () => {
    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ListQuery, {
            request: { id: 'test' },
            initialResult: listData,
            env: { api },
        });
        q = query;
        return <div></div>;
    });
    render(<Comp />);

    await q.whenIsDoneLoading();

    await q.fetchMore();

    expect(q.data.items.length).toBe(8);
});

test('refetching query', async () => {
    const itemQuery = create(ItemQuery, {
        request: { id: 'test' },
        env: { api },
    });
    await itemQuery.run();

    const mutation = create(SetDescriptionMutation, {
        request: { id: 'test', description: 'new' },
        env: { api },
    });
    await mutation.run();

    await itemQuery.refetch();
    expect(itemQuery.data?.description).toBe('Test item');
});

test('mutation updates query (with optimistic update)', async () => {
    const listQuery = create(ListQuery, {
        request: { id: 'test' },
        env: { api },
    });

    await listQuery.run();
    expect(listQuery.data?.items.length).toBe(4);

    let observeCount = 0;
    const dispose = reaction(
        () => listQuery.data?.items.map((i) => i.id),
        () => {
            observeCount++;
        }
    );

    const addItemMutation = create(AddItemMutation, {
        request: { path: 'test', message: 'testing' },
        env: { api },
    });
    await addItemMutation.run();

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
        new Set()
    );
    const result = merge(
        {
            id: 'test',
            changed: {
                at: new Date('2020-03-03'),
            },
        },
        ModelA,
        new Set()
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

    const a = ModelA.create({});
    unprotect(a);
    const result = merge(
        { model: { a: 'banana' }, ref: { id: '1', a: 'fruit' } },
        ModelA,
        new Set()
    );
    applySnapshot(a, getSnapshot(result));
    const result2 = merge(
        { model: { a: 'banana', b: 'apple' }, ref: { id: '1', a: 'orange' } },
        ModelA,
        new Set()
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
    q._updateData(
        { id: 'test', frozen: { data1: 'data1', data2: 'data2' } },
        { isLoading: false, error: null }
    );

    expect(() =>
        q._updateData(
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
    q._updateData(
        { id: 'test', prop: { ids: [{ baha: 'hey' }, { baha: 'hello' }] } },
        { isLoading: false, error: null }
    );
    q._updateData(
        { id: 'test', prop: { ids: [{ baha: 'hey2' }, { baha: 'hello2' }] } },
        { isLoading: false, error: null }
    );
    expect(q.data?.prop.ids[0].baha).toBe('hey2');
});

test('hasChanged mutation', () => {
    const RequestModel = types
        .model({
            text: types.string,
        })
        .actions((self) => ({
            setText(text: string) {
                self.text = text;
            },
        }));

    const MutationModel = createMutation('Mutation', {
        request: RequestModel,
    });
    const m = create(MutationModel, { request: { text: 'hi' } });
    expect(m.hasChanged).toBe(false);

    m.request.setText('hello');
    expect(m.hasChanged).toBe(true);

    m.reset();
    expect(m.hasChanged).toBe(false);
    expect(m.request.text).toBe('hi');

    m.request.setText('hi');
    expect(m.hasChanged).toBe(false);

    m.request.setText('hiya');
    m.commitChanges();
    expect(m.hasChanged).toBe(false);
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
        q._updateData({ folderPath: 'test', origin: undefined }, { isLoading: false, error: null })
    ).not.toThrow();
});

test('findAll', () => {
    const RequestModel = types
        .model({
            path: types.string,
            text: types.string,
        })
        .actions((self) => ({
            setText(text: string) {
                self.text = text;
            },
        }));

    const MutationModel = createMutation('Mutation', {
        request: RequestModel,
    });
    const m = create(MutationModel, { request: { path: 'test', text: 'hi' } });

    const queries = queryCache.findAll(MutationModel, (mutation) =>
        mutation.request.text.includes('h')
    );
    expect(queries.length).toBe(1);

    const queries2 = queryCache.findAll(MutationModel, (mutation) =>
        mutation.request.text.includes('o')
    );
    expect(queries2.length).toBe(0);
});

test('caching', async () => {
    const getItem = jest.fn(() => Promise.resolve(itemData));
    const testApi = {
        ...api,
        getItem,
    };

    let q: any;
    const Comp = observer((props: any) => {
        const { query } = useQuery(ItemQuery, {
            request: { id: 'test' },
            env: { api: testApi },
            cacheMaxAge: 1,
        });
        q = query;
        return <div></div>;
    });
    const { unmount } = render(<Comp />);
    await q.whenIsDoneLoading();

    unmount();

    const foundQuery = queryCache.find(ItemQuery, () => true);
    expect(foundQuery).toBe(undefined);

    render(<Comp />);
    await q.whenIsDoneLoading();

    expect(q.data.createdBy.name).toBe('Kim');
    expect(getItem).toBeCalledTimes(1);
});
