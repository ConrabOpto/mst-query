import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cast, destroy, isAlive, types } from 'mobx-state-tree';
import {
    createInfiniteQueryMap,
    createModelStore,
    createQueryMap,
    createRootStore,
    QueryClient,
} from '../src';

const Leaf = types.model('MapGcLeaf', { id: types.identifier });
const Entity = types.model('MapGcEntity', {
    id: types.identifier,
    child: types.maybe(types.reference(Leaf)),
});
const Query = createQueryMap('MapGcQuery', { data: types.reference(Entity) });
const Infinite = createInfiniteQueryMap('MapGcInfinite', {
    data: types.reference(Entity),
    request: types.model({ selected: types.reference(Entity) }),
    pagination: types.model({ selected: types.reference(Leaf) }),
    endpoint: async () => null,
});
const Root = createRootStore({
    entities: types.optional(createModelStore('MapGcEntityStore', Entity), {}),
    leaves: types.optional(createModelStore('MapGcLeafStore', Leaf), {}),
    services: types.optional(
        types.model({
            form: types.maybe(types.model({ selected: types.reference(Entity) })),
        }),
        {},
    ),
    query: types.optional(Query, {}),
    infinite: types.optional(Infinite, {}),
}).actions((self) => ({
    select(id?: string) {
        self.services.form = id ? cast({ selected: id }) : undefined;
    },
}));

let client: QueryClient<typeof Root>;
beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    destroy(client.rootStore);
    vi.clearAllTimers();
    vi.useRealTimers();
});
const setup = (cacheTime = Infinity) => {
    client = new QueryClient({
        RootStore: Root,
        gcInterval: 1,
        queryOptions: { cacheTime },
    }).init();
    return client.rootStore;
};
const collect = () => vi.advanceTimersByTimeAsync(1);

// Generic reachability and response-cache cases are covered by gc.test.ts.
test('entry expiry releases response roots while an attached form retains its selection', async () => {
    const root = setup(10);
    const selected = root.entities.merge({ id: 'selected', child: { id: 'child' } });
    const unused = root.entities.merge({ id: 'unused' });
    root.query.setData(selected);
    const entry = root.query.get()!;
    root.select('selected');

    await vi.advanceTimersByTimeAsync(10);
    await collect();
    expect(root.query.entries.size).toBe(0);
    expect(isAlive(entry)).toBe(false);
    expect(isAlive(selected)).toBe(true);
    expect(root.services.form!.selected.child!.id).toBe('child');
    expect(isAlive(unused)).toBe(false);

    root.select();
    await collect();
    expect(isAlive(selected)).toBe(false);
    expect(root.leaves.models.size).toBe(0);
});

test('request and pagination references remain roots inside a query-map entry', async () => {
    const root = setup();
    const requested = root.entities.merge({ id: 'requested' });
    const pagination = root.leaves.merge({ id: 'page' });
    const { query } = await root.infinite.query({
        request: { selected: 'requested' },
        pagination: { selected: 'page' },
    });
    expect(query.data).toBeNull();
    await collect();
    expect(query.variables.request!.selected).toBe(requested);
    expect(query.variables.pagination!.selected).toBe(pagination);
});
