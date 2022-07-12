import { reaction } from 'mobx';
import { destroy, flow, types } from 'mobx-state-tree';
import { AddItemMutation } from './models/AddItemMutation';
import { ListQuery } from './models/ListQuery';
import { api } from './api/api';
import { wait } from './utils';
import { RootStore } from './models/RootStore';
import { itemData, listData } from './api/data';
import { ItemQuery } from './models/ItemQuery';
import { QueryClient } from '../src/QueryClient';
import { createContext } from '../src';
import { gc } from '../src/gc';
import { SetDescriptionMutation } from './models/SetDescriptionMutation';

const env = {};
const queryClient = new QueryClient({ RootStore });
queryClient.init(env);

const { create } = createContext(queryClient);

beforeEach(() => {
    queryClient.queryStore.clear();
});

test('custom query store', async () => {
    const NewRootStore = RootStore.named('NewRootStore')
        .props({
            itemQuery: types.optional(ItemQuery, { env: { api } }),
            listQuery: types.optional(ListQuery, { env: { api } }),
            setDescriptionMutation: types.optional(SetDescriptionMutation, { env: { api } }),
        })
        .views((self) => ({
            get items() {
                return self.listQuery.data?.items ?? [];
            },
        }))
        .actions((self) => ({
            afterCreate() {
                self.listQuery.setOptions({ cacheTime: 1 });
                self.itemQuery.setOptions({ cacheTime: 1 });
                self.listQuery.run();
            },
            cleanup: flow(function* () {
                yield gc(self);
                destroy(self);
            }),
        }));

    const qc = new QueryClient({ RootStore: NewRootStore });
    qc.init();
    
    const store = qc.rootStore;

    await wait();
    expect(store.items.length).toBe(4);
    expect(store.items[0].data).toBe(undefined);

    store.itemQuery.run();
    await wait();
    expect(store.items[0].data?.name).toBe('test');

    expect(qc.queryStore.models.size).toBe(9);
    await store.cleanup();
    expect(qc.queryStore.models.size).toBe(0);

    qc.queryStore.clear();
});

test('query & mutation', async () => {
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

test('garbage collection', async () => {
    const q1 = create(ItemQuery, { request: { id: 'test' }, env: { api } });
    const q2 = create(ItemQuery, { request: { id: 'test2' }, env: { api } });
    const qc = create(ListQuery, { request: { id: 'test' }, env: { api } });

    await q1.run();
    await q2.run();
    expect(queryClient.rootStore.itemStore.items.size).toBe(1);
    expect(queryClient.rootStore.userStore.users.size).toBe(1);
    expect(queryClient.rootStore.listStore.lists.size).toBe(0);

    await qc.run();
    expect(queryClient.rootStore.itemStore.items.size).toBe(4);
    expect(queryClient.rootStore.userStore.users.size).toBe(4);
    expect(queryClient.rootStore.listStore.lists.size).toBe(1);

    expect(queryClient.queryStore.models.size).toBe(9);

    qc.__MstQueryHandler.updateData(null, { error: null, isLoading: false });
    q2.__MstQueryHandler.updateData(null, { error: null, isLoading: false });
    await wait();
    q2.__MstQueryHandler.updateData(itemData, { error: null, isLoading: false });
    qc.__MstQueryHandler.updateData(listData, { error: null, isLoading: false });
    await wait();
    queryClient.queryStore.removeQuery(q1);
    expect(queryClient.queryStore.models.size).toBe(9);

    queryClient.queryStore.removeQuery(qc);
    expect(queryClient.queryStore.models.size).toBe(2);

    queryClient.queryStore.removeQuery(q2);
    expect(queryClient.queryStore.models.size).toBe(0);
});
