import { expect, test } from 'vitest';
import { destroy, getSnapshot, types } from 'mobx-state-tree';
import { QueryClient, createModelStore, createRootStore } from '../src';
import { merge } from '../src/merge';

test('detached copies preserve partial nested data without reconciling unresolved references', () => {
    const Item = types.model('CloneItem', { id: types.identifier });
    const Page = types.model('ClonePage', {
        id: types.identifier,
        title: types.string,
        details: types.model({ title: types.string, status: types.maybe(types.string) }),
        items: types.array(types.reference(Item)),
    });
    const Root = createRootStore({
        itemStore: types.optional(createModelStore('CloneItemStore', Item), {}),
        pageStore: types.optional(createModelStore('ClonePageStore', Page), {}),
    });
    const client = new QueryClient({ RootStore: Root }).init();
    const original = client.rootStore.pageStore.merge({
        id: 'page',
        title: 'Original page',
        details: { title: 'Original details', status: 'ready' },
        items: [{ id: 'first' }],
    });
    const before = getSnapshot(original);

    const copy = merge(
        { id: 'page', details: { title: 'New details' }, items: [{ id: 'second' }] },
        Page,
        client.config.env,
        true,
    );

    expect(copy === original).toBe(false);
    expect(getSnapshot(copy)).toEqual({
        ...before,
        details: { title: 'New details', status: 'ready' },
        items: ['second'],
    });
    expect(getSnapshot(original)).toEqual(before);
    expect(original.items[0].id).toBe('first');
    expect(client.rootStore.pageStore.models.get('page')).toBe(original);
    destroy(client.rootStore);
});
