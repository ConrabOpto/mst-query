import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { destroy, isAlive, types } from 'mobx-state-tree';
import { createModelStore, createQuery, createRootStore, QueryClient } from '../src';

const Entity = types.model('ScheduledGcEntity', { id: types.identifier });
const Query = createQuery('ScheduledGcQuery', {
    data: types.reference(Entity),
    endpoint: ({ meta }) => meta.execute(),
});
const Root = createRootStore({
    entities: types.optional(createModelStore('ScheduledGcStore', Entity), {}),
    selected: types.maybe(types.reference(Entity)),
    queries: types.map(Query),
}).actions((self) => ({
    select(id?: string) {
        self.selected = id ? self.entities.models.get(id)! : undefined;
    },
    addQuery() {
        self.queries.set('query', {});
        return self.queries.get('query')!;
    },
    removeQuery() {
        self.queries.delete('query');
    },
}));
const cleanup: (() => void)[] = [];
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    cleanup.splice(0).forEach((dispose) => dispose());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
const setup = (gcInterval?: number) => {
    const client = new QueryClient({ RootStore: Root, gcInterval }).init();
    cleanup.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    return client;
};

test('automatic collection defaults to five minutes and does not poll while idle', async () => {
    const client = setup();
    const model = client.rootStore.entities.merge({ id: 'unused' });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(isAlive(model)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isAlive(model)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(vi.getTimerCount()).toBe(0);
});

test('changes coalesce without postponing the batch and sweeps respect the interval', async () => {
    const client = setup(1000);
    const first = client.rootStore.entities.merge({ id: 'first' });
    client.rootStore.select('first');
    const unused = client.rootStore.entities.merge({ id: 'unused' });
    await vi.advanceTimersByTimeAsync(999);
    const late = client.rootStore.entities.merge({ id: 'late' });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(isAlive(first)).toBe(true);
    expect(isAlive(unused)).toBe(false);
    expect(isAlive(late)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    client.rootStore.select();
    await vi.advanceTimersByTimeAsync(999);
    expect(isAlive(first)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isAlive(first)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});

test('Infinity disables automatic GC and the collector is not public', async () => {
    const client = setup(Infinity);
    const model = client.rootStore.entities.merge({ id: 'unused' });
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(isAlive(model)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect('runGc' in client.rootStore).toBe(false);
    expect('runGc' in client.queryStore).toBe(false);
});

test('zero schedules collection after the action, without a self-triggering loop', async () => {
    const client = setup(0);
    const model = client.rootStore.entities.merge({ id: 'unused' });
    expect(isAlive(model)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(isAlive(model)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});

test('loading checks postpone a due sweep without collecting models', async () => {
    const client = setup(100);
    const model = client.rootStore.entities.merge({ id: 'unused' });
    const query = client.rootStore.addQuery();
    let resolve!: (value: null) => void;
    const pending = query.query({
        meta: {
            execute: () =>
                new Promise<null>((done) => {
                    resolve = done;
                }),
        },
    });
    await vi.advanceTimersByTimeAsync(1100);
    expect(isAlive(model)).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    resolve(null);
    await pending;
    await vi.advanceTimersByTimeAsync(1000);
    expect(isAlive(model)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});

test('cache expiry schedules collection even if there is no new root-store patch', async () => {
    const client = setup(100);
    const model = client.rootStore.entities.merge({ id: 'cached' });
    const query = client.rootStore.addQuery();
    query.setData(model, { cacheKey: 'cached', cacheTime: 200 });
    client.rootStore.removeQuery();
    await vi.advanceTimersByTimeAsync(100);
    expect(isAlive(model)).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(isAlive(model)).toBe(true);
    await vi.advanceTimersByTimeAsync(99);
    expect(isAlive(model)).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isAlive(model)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});

test('reset cancels the old batch and starts a fresh interval for the new root', async () => {
    const client = setup(100);
    client.rootStore.entities.merge({ id: 'old' });
    await vi.advanceTimersByTimeAsync(50);
    client.reset();
    expect(vi.getTimerCount()).toBe(0);
    const model = client.rootStore.entities.merge({ id: 'new' });
    await vi.advanceTimersByTimeAsync(50);
    expect(isAlive(model)).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(isAlive(model)).toBe(false);
});

test('destroying the root cancels its scheduled work', () => {
    const client = setup(100);
    client.rootStore.entities.merge({ id: 'unused' });
    expect(vi.getTimerCount()).toBe(1);
    destroy(client.rootStore);
    expect(vi.getTimerCount()).toBe(0);
});

test('automatic collection is disabled by default without a browser', () => {
    vi.stubGlobal('window', undefined);
    const client = setup();
    client.rootStore.entities.merge({ id: 'server' });
    expect(client.config.gcInterval).toBe(Infinity);
    expect(vi.getTimerCount()).toBe(0);
});

test.each([-1, NaN, -Infinity, 2 ** 31])('rejects an invalid gcInterval: %s', (gcInterval) => {
    expect(() => new QueryClient({ RootStore: Root, gcInterval })).toThrow('gcInterval');
});
