import { expect, test, vi } from 'vitest';
import {
    destroy,
    detach,
    getLivelinessChecking,
    isAlive,
    setLivelinessChecking,
    types,
} from 'mobx-state-tree';
import { createModelStore, createQuery, createRootStore, QueryClient } from '../src';
import { getKey } from '../src/QueryStore';

const Item = types.model('SafeReferenceItem', {
    id: types.identifier,
    name: types.string,
});
const ItemReference = types.safeReference(Item, { acceptsUndefined: false });
const List = types.model('SafeReferenceList', {
    id: types.identifier,
    items: types.array(ItemReference),
});
const ListQuery = createQuery('SafeReferenceListQuery', { data: types.reference(List) });
const ArrayQuery = createQuery('SafeReferenceArrayQuery', { data: types.array(ItemReference) });
const MapQuery = createQuery('SafeReferenceMapQuery', {
    data: types.model({ items: types.map(ItemReference) }),
});
const NestedMapQuery = createQuery('SafeReferenceNestedMapQuery', {
    data: types.map(types.array(ItemReference)),
});
const Root = createRootStore({
    items: types.optional(createModelStore('SafeReferenceItemStore', Item), {}),
    lists: types.optional(createModelStore('SafeReferenceListStore', List), {}),
    listQuery: types.optional(ListQuery, {}),
    arrayQuery: types.optional(ArrayQuery, {}),
    mapQuery: types.optional(MapQuery, {}),
    nestedMapQuery: types.optional(NestedMapQuery, {}),
}).actions((self) => ({
    removeItem(id: string) {
        self.items.models.delete(id);
    },
    detachItem(id: string) {
        return detach(self.items.models.get(id)!);
    },
}));
const data = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
const setup = (gcInterval = Infinity) => new QueryClient({ RootStore: Root, gcInterval }).init();

test('normalizing an identified model preserves its safe-reference array', () => {
    const client = setup();
    try {
        client.rootStore.listQuery.setData({ id: 'list', items: data });
        expect(client.rootStore.items.models.size).toBe(3);
        expect(client.rootStore.listQuery.data!.items.map((item) => item.id)).toEqual([
            'a',
            'b',
            'c',
        ]);
    } finally {
        destroy(client.rootStore);
    }
});

test('refetching a safe-reference array recreates an invalidated target with the same identifier', () => {
    const client = setup();
    const previousLiveliness = getLivelinessChecking();
    setLivelinessChecking('warn');
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const query = client.rootStore.arrayQuery;
        query.setData(data);
        const original = query.data![1];
        client.rootStore.removeItem('b');
        expect(isAlive(original)).toBe(false);
        expect(client.queryStore.models.has(getKey(Item, 'b'))).toBe(false);
        expect(query.data!.map((item) => item.id)).toEqual(['a', 'c']);

        expect(() => query.setData([{ ...data[1], name: 'Returned' }, data[2]])).not.toThrow();
        expect(query.data!.map((item) => item.id)).toEqual(['b', 'c']);
        expect(query.data![0].name).toBe('Returned');
        expect(query.data![0] === original).toBe(false);
        expect(warnings).not.toHaveBeenCalled();
    } finally {
        destroy(client.rootStore);
        warnings.mockRestore();
        setLivelinessChecking(previousLiveliness);
    }
});

test('GC retains targets reachable through a live query safe-reference map', async () => {
    vi.useFakeTimers();
    const client = setup(0);
    try {
        client.rootStore.items.merge(data[0]);
        client.rootStore.items.merge(data[1]);
        const query = client.rootStore.mapQuery;
        query.setData({ items: { a: 'a', b: 'b' } });
        expect([...query.data!.items.values()].map((item) => item.id)).toEqual(['a', 'b']);

        await vi.advanceTimersByTimeAsync(0);
        expect([...query.data!.items.keys()]).toEqual(['a', 'b']);
        expect([...client.rootStore.items.models.keys()]).toEqual(['a', 'b']);
    } finally {
        destroy(client.rootStore);
        vi.useRealTimers();
    }
});

test('safe-reference lists preserve their contents when refetched after invalidation', () => {
    const client = setup();
    try {
        const query = client.rootStore.listQuery;
        query.setData({ id: 'list', items: data });
        const list = query.data;
        client.rootStore.removeItem('b');
        expect(query.data!.items.map((item) => item.id)).toEqual(['a', 'c']);
        query.setData({ id: 'list', items: [data[2], { ...data[1], name: 'Returned' }, data[0]] });
        expect(query.data === list).toBe(true);
        expect(query.data!.items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
        expect(query.data!.items[1].name).toBe('Returned');
    } finally {
        destroy(client.rootStore);
    }
});

test('generated identifiers do not require detached creation of safe-reference models', () => {
    let generated = 0;
    const GeneratedList = List.named('GeneratedSafeReferenceList').props({
        id: types.optional(types.identifier, () => `list-${++generated}`),
    });
    const GeneratedQuery = createQuery('GeneratedSafeReferenceQuery', {
        data: types.reference(GeneratedList),
    });
    const GeneratedRoot = createRootStore({
        items: types.optional(createModelStore('GeneratedItemStore', Item), {}),
        lists: types.optional(createModelStore('GeneratedListStore', GeneratedList), {}),
        query: types.optional(GeneratedQuery, {}),
    });
    const client = new QueryClient({ RootStore: GeneratedRoot }).init();
    try {
        client.rootStore.query.setData({ items: data });
        expect(client.rootStore.query.data!.id).toBe('list-1');
        expect(client.rootStore.query.data!.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
        expect(generated).toBe(1);
        expect(client.queryStore.models.has(getKey(GeneratedList, 'list-1'))).toBe(true);
    } finally {
        destroy(client.rootStore);
    }
});

test('refetching replaces a detached target without deleting the replacement cache entry', () => {
    const client = setup();
    client.rootStore.arrayQuery.setData(data);
    const detached = client.rootStore.detachItem('b');
    try {
        const query = client.rootStore.arrayQuery;
        expect(query.data!.map((item) => item.id)).toEqual(['a', 'c']);
        query.setData([{ ...data[1], name: 'Returned' }]);
        expect(query.data!.map((item) => item.id)).toEqual(['b']);
        expect(query.data![0] === detached).toBe(false);
        destroy(detached);
        expect(client.queryStore.models.get(getKey(Item, 'b')) === query.data![0]).toBe(true);
    } finally {
        if (isAlive(detached)) destroy(detached);
        destroy(client.rootStore);
    }
});

test('GC follows safe references through nested maps and arrays while collecting unused models', async () => {
    vi.useFakeTimers();
    const client = setup(0);
    try {
        data.forEach((item) => client.rootStore.items.merge(item));
        const query = client.rootStore.nestedMapQuery;
        query.setData({ first: ['a'], second: ['b'] });
        await vi.advanceTimersByTimeAsync(0);
        expect(query.data!.get('first')!.map((item) => item.id)).toEqual(['a']);
        expect(query.data!.get('second')!.map((item) => item.id)).toEqual(['b']);
        expect(client.rootStore.items.models.has('c')).toBe(false);
    } finally {
        destroy(client.rootStore);
        vi.useRealTimers();
    }
});
