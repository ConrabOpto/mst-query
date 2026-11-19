import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
    cast,
    destroy,
    getType,
    IAnyModelType,
    IAnyStateTreeNode,
    isAlive,
    types,
} from 'mobx-state-tree';
import {
    createInfiniteQuery,
    createModelStore,
    createQuery,
    createRootStore,
    QueryClient,
} from '../src';

const Leaf = types.model('GcLeaf', { id: types.identifier });
const Entity = types.model('GcEntity', {
    id: types.identifier,
    child: types.maybe(types.reference(Leaf)),
});
const Form = types.model('GcForm', {
    id: types.identifier,
    selected: types.maybe(types.reference(Entity)),
    selections: types.array(types.reference(Entity)),
    lookup: types.map(types.reference(Entity)),
});
const Cycle: IAnyModelType = types.model('GcCycle', {
    next: types.reference(
        types.late(() => Cycle),
        {
            get: (_id, parent) => parent!,
            set: () => 'self',
        },
    ),
    selected: types.reference(Entity),
});
const Query = createQuery('GcQuery', {
    data: types.reference(Entity),
    request: types.model({ selected: types.maybe(types.reference(Entity)) }),
    endpoint: ({ meta }) => meta.execute(),
});
const WrappedQuery = createQuery('GcWrappedQuery', {
    data: types.model({ items: types.array(types.reference(Entity)) }),
});
const Infinite = createInfiniteQuery('GcInfinite', {
    data: types.reference(Entity),
    request: types.model({ selected: types.maybe(types.reference(Entity)) }),
    pagination: types.model({ selected: types.maybe(types.reference(Leaf)) }),
    endpoint: async () => null,
});
const Services = types
    .model('GcServices', {
        form: types.maybe(Form),
        forms: types.array(Form),
        cycle: types.maybe(Cycle),
    })
    .volatile(() => ({ held: null as IAnyStateTreeNode | null }));
const Root = createRootStore({
    entities: types.optional(
        createModelStore('GcEntityStore', Entity).props({
            pinned: types.maybe(types.reference(Leaf)),
        }),
        {},
    ),
    leaves: types.optional(createModelStore('GcLeafStore', Leaf), {}),
    services: types.optional(Services, {}),
    queries: types.map(Query),
    wrappedQueries: types.map(WrappedQuery),
    infiniteQueries: types.map(Infinite),
}).actions((self) => ({
    addQuery(id: string) {
        self.queries.set(id, {});
        return self.queries.get(id)!;
    },
    removeQuery(id: string) {
        self.queries.delete(id);
    },
    addWrappedQuery(id: string) {
        self.wrappedQueries.set(id, {});
        return self.wrappedQueries.get(id)!;
    },
    removeWrappedQuery(id: string) {
        self.wrappedQueries.delete(id);
    },
    addInfinite(id: string) {
        self.infiniteQueries.set(id, {});
        return self.infiniteQueries.get(id)!;
    },
    select(id?: string) {
        self.services.form = cast({ id: 'form', selected: id });
    },
    destroyForm() {
        self.services.form = undefined;
    },
    addForm(id: string, selected: string) {
        self.services.forms.push(cast({ id, selected }));
    },
    selectCollections(ids: string[]) {
        self.services.form = cast({ id: 'form', selections: [ids[0]], lookup: { second: ids[1] } });
    },
    createCycle(id: string) {
        self.services.cycle = cast({ next: 'self', selected: id });
    },
    holdVolatile(node: IAnyStateTreeNode) {
        self.services.held = node;
    },
    pinLeaf(id?: string) {
        self.entities.pinned = id ? self.leaves.models.get(id)! : undefined;
    },
}));

const cleanups: (() => void)[] = [];
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    cleanups
        .splice(0)
        .reverse()
        .forEach((cleanup) => cleanup());
    vi.clearAllTimers();
    vi.useRealTimers();
});
const setup = () => {
    const client = new QueryClient({ RootStore: Root, gcInterval: 1 }).init();
    cleanups.push(() => {
        if (isAlive(client.rootStore)) destroy(client.rootStore);
    });
    return client;
};
const collect = () => vi.advanceTimersByTimeAsync(1);
const seed = (client: ReturnType<typeof setup>, id: string, child?: string) =>
    client.rootStore.entities.merge({
        id,
        ...(child ? { child: { id: child } } : {}),
    });
const external = (client: ReturnType<typeof setup>, id: string) => {
    const External = types
        .model('GcExternal', {
            selected: types.reference(Entity, {
                get: (identifier) => client.rootStore.entities.models.get(String(identifier))!,
                set: (node) => node.id,
            }),
        })
        .actions((self) => ({
            select(id: string) {
                self.selected = client.rootStore.entities.models.get(id)!;
            },
        }));
    const root = External.create({ selected: id });
    cleanups.push(() => {
        if (isAlive(root)) destroy(root);
    });
    return root;
};

test.each(['clear', 'destroy'] as const)(
    'form references retain selected entities after query destruction until the form is %s',
    async (release) => {
        const client = setup();
        const selected = seed(client, 'selected', 'child');
        const unused = seed(client, 'unused');
        const query = client.rootStore.addQuery('select');
        query.setData(selected);
        client.rootStore.select('selected');
        client.rootStore.removeQuery('select');
        await collect();
        expect(client.rootStore.services.form!.selected === selected).toBe(true);
        expect(client.rootStore.services.form!.selected!.child!.id).toBe('child');
        expect(isAlive(unused)).toBe(false);
        if (release === 'clear') client.rootStore.select();
        else client.rootStore.destroyForm();
        await collect();
        expect(isAlive(selected)).toBe(false);
        expect(client.rootStore.leaves.models.size).toBe(0);
    },
);

test('service form arrays and maps protect their targets without retaining every model-store entry', async () => {
    const client = setup();
    seed(client, 'a');
    seed(client, 'b');
    const unused = seed(client, 'unused');
    client.rootStore.selectCollections(['a', 'b']);
    await collect();
    expect(client.rootStore.services.form!.selections[0].id).toBe('a');
    expect(client.rootStore.services.form!.lookup.get('second')!.id).toBe('b');
    expect(isAlive(unused)).toBe(false);
});

test('cycles through models without identifiers are visited once', async () => {
    const client = setup();
    const selected = seed(client, 'selected');
    const unused = seed(client, 'unused');
    client.rootStore.createCycle('selected');
    await collect();
    expect(isAlive(selected)).toBe(true);
    expect(isAlive(unused)).toBe(false);
});

test('distinct form instances with the same identifier are both scanned', async () => {
    const client = setup();
    const first = seed(client, 'a');
    const second = seed(client, 'b');
    client.rootStore.addForm('duplicate', 'a');
    client.rootStore.addForm('duplicate', 'b');
    await collect();
    expect(isAlive(first)).toBe(true);
    expect(isAlive(second)).toBe(true);
});

test('request and pagination references are marked independently of response data', async () => {
    const client = setup();
    const requested = seed(client, 'requested');
    const pagination = client.rootStore.leaves.merge({ id: 'page' });
    const query = client.rootStore.addInfinite('page');
    await query.query({ request: { selected: 'requested' }, pagination: { selected: 'page' } });
    expect(query.data).toBeNull();
    await collect();
    expect(query.variables.request!.selected === requested).toBe(true);
    expect(query.variables.pagination!.selected === pagination).toBe(true);
});

test('cached data is a root even when the query registry is empty', async () => {
    const client = setup();
    const selected = seed(client, 'selected', 'child');
    const unused = seed(client, 'unused');
    const query = client.rootStore.addQuery('cached');
    query.setData(selected, { cacheKey: 'cached', cacheTime: 1000 });
    client.rootStore.removeQuery('cached');
    await collect();
    expect(isAlive(selected)).toBe(true);
    expect(isAlive(unused)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await collect();
    expect(isAlive(selected)).toBe(false);
    expect(client.rootStore.leaves.models.size).toBe(0);
});

test('a cached wrapper survives destruction of its owner and can hydrate a new query', async () => {
    const client = setup();
    const selected = seed(client, 'selected', 'child');
    const query = client.rootStore.addWrappedQuery('cached');
    query.setData({ items: [selected] }, { cacheKey: 'cached', cacheTime: 1000 });
    const cached = client.queryStore.getQueryData(getType(query), 'cached')!;
    client.rootStore.removeWrappedQuery('cached');
    expect(isAlive(cached.data)).toBe(false);
    await collect();
    expect(isAlive(selected)).toBe(true);
    const replacement = client.rootStore.addWrappedQuery('replacement');
    replacement.setData(cached.data);
    expect(replacement.data!.items[0].child!.id).toBe('child');
    client.rootStore.removeWrappedQuery('replacement');
    await vi.advanceTimersByTimeAsync(1000);
    await collect();
    expect(isAlive(selected)).toBe(false);
});

test('cached wrapper roots follow mutations made after the response was cached', async () => {
    const client = setup();
    const first = seed(client, 'a');
    const second = seed(client, 'b');
    const query = client.rootStore.addWrappedQuery('cached');
    query.setData({ items: [first] }, { cacheKey: 'cached', cacheTime: 1000 });
    query.__MstQueryHandlerAction(() => {
        query.data!.items.push(second);
        query.data!.items.shift();
    });
    client.rootStore.removeWrappedQuery('cached');
    await collect();
    expect(isAlive(first)).toBe(false);
    expect(isAlive(second)).toBe(true);
});

test('cached model roots follow current transitive references without pinning old targets', async () => {
    const client = setup();
    const selected = seed(client, 'selected', 'old');
    const oldChild = selected.child!;
    const query = client.rootStore.addWrappedQuery('cached');
    query.setData({ items: [selected] }, { cacheKey: 'cached', cacheTime: 1000 });
    seed(client, 'selected', 'new');
    client.rootStore.removeWrappedQuery('cached');
    await collect();
    expect(selected.child!.id).toBe('new');
    expect(isAlive(oldChild)).toBe(false);
});

test('model-store ownership maps are skipped while custom store properties remain roots', async () => {
    const client = setup();
    const pinned = client.rootStore.leaves.merge({ id: 'pinned' });
    const unused = client.rootStore.leaves.merge({ id: 'unused' });
    client.rootStore.pinLeaf('pinned');
    await collect();
    expect(isAlive(pinned)).toBe(true);
    expect(isAlive(unused)).toBe(false);
    client.rootStore.pinLeaf();
    await collect();
    expect(isAlive(pinned)).toBe(false);
});

test('cache replacement releases the previous roots and cancels the old expiry', async () => {
    const client = setup();
    const first = seed(client, 'a');
    const query = client.rootStore.addQuery('cached');
    query.setData(first, { cacheKey: 'cached', cacheTime: 1000 });
    await vi.advanceTimersByTimeAsync(500);
    const second = seed(client, 'b');
    query.setData(second, { cacheKey: 'cached', cacheTime: 2000 });
    client.rootStore.removeQuery('cached');
    await collect();
    expect(isAlive(first)).toBe(false);
    expect(isAlive(second)).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    await collect();
    expect(isAlive(second)).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    await collect();
    expect(isAlive(second)).toBe(false);
});

test('manual cache removal releases its roots without expiring a later entry', async () => {
    const client = setup();
    const first = seed(client, 'a');
    const second = seed(client, 'b');
    const query = client.rootStore.addWrappedQuery('cached');
    query.setData({ items: [first] }, { cacheKey: 'cached', cacheTime: 1000 });
    client.queryStore.removeQueryData(getType(query), 'cached');
    query.setData({ items: [second] }, { cacheKey: 'cached', cacheTime: 2000 });
    client.rootStore.removeWrappedQuery('cached');
    await vi.advanceTimersByTimeAsync(1000);
    await collect();
    expect(isAlive(first)).toBe(false);
    expect(isAlive(second)).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    await collect();
    expect(isAlive(second)).toBe(false);
});

test('detached and volatile nodes are not roots, and detached requests do not postpone GC', async () => {
    const client = setup();
    const selected = seed(client, 'selected');
    external(client, 'selected');
    client.rootStore.holdVolatile(selected);
    const Detached = createQuery('DetachedGcQuery', { endpoint: () => new Promise(() => {}) });
    const query = Detached.create({}, client.config.env);
    cleanups.push(() => {
        if (isAlive(query)) destroy(query);
    });
    query.query();
    await collect();
    expect(isAlive(selected)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
});
