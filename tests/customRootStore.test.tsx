import * as React from 'react';
import { config, configure, queryCache } from '../src';
import { reaction } from 'mobx';
import { AddItemMutation } from './models/AddItemMutation';
import { ListQuery } from './models/ListQuery';
import { api } from './api/api';
import { createAndCache, wait } from './utils';
import { RootStore } from './models/RootStore';
import { itemData, listData } from './api/data';
import { ItemQuery } from './models/ItemQuery';
import { models } from '../src/QueryCache';

beforeAll(() => {
    const env = {};
    configure({ env, rootStore: RootStore.create({}, env) });
});

beforeEach(() => {
    queryCache.clear();
});

test('query & mutation', async () => {
    const listQuery = createAndCache(ListQuery, {
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

    const addItemMutation = createAndCache(AddItemMutation, {
        request: { path: 'test', message: 'testing' },
        env: { api },
    });
    await addItemMutation.run();

    expect(observeCount).toBe(2);
    expect(listQuery.data?.items.length).toBe(5);

    dispose();
});

test('garbage collection', async () => {
    const q1 = createAndCache(ItemQuery, { request: { id: 'test' }, env: { api } });
    const q2 = createAndCache(ItemQuery, { request: { id: 'test2' }, env: { api } });
    const qc = createAndCache(ListQuery, { request: { id: 'test' }, env: { api } });

    await q1.run();
    await q2.run();
    expect(config.rootStore.itemStore.items.size).toBe(1);
    expect(config.rootStore.userStore.users.size).toBe(1);
    expect(config.rootStore.listStore.lists.size).toBe(0);

    await qc.run();
    expect(config.rootStore.itemStore.items.size).toBe(4);
    expect(config.rootStore.userStore.users.size).toBe(4);
    expect(config.rootStore.listStore.lists.size).toBe(1);

    expect(models.size).toBe(9);

    qc.__MstQueryHandler.updateData(null, { error: null, isLoading: false });
    q2.__MstQueryHandler.updateData(null, { error: null, isLoading: false });
    await wait();
    q2.__MstQueryHandler.updateData(itemData, { error: null, isLoading: false });
    qc.__MstQueryHandler.updateData(listData, { error: null, isLoading: false });
    await wait();
    queryCache.removeQuery(q1);
    expect(models.size).toBe(9);

    queryCache.removeQuery(qc);
    expect(models.size).toBe(2);

    queryCache.removeQuery(q2);
    expect(models.size).toBe(0);
});
