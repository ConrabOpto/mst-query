import { describe, expect, test } from 'vitest';
import { getSnapshot, types, type IAnyModelType } from 'mobx-state-tree';
import { createQuery, createRootStore, QueryClient } from '../src';

describe('late type normalization', () => {
    test.each([
        {
            name: 'union containing a late model',
            wrap: (model: IAnyModelType) =>
                types.union(
                    types.undefined,
                    types.late(() => model),
                ),
        },
        {
            name: 'optional late model',
            wrap: (model: IAnyModelType) =>
                types.optional(
                    types.late(() => model),
                    { value: 'default' },
                ),
        },
        {
            name: 'late type resolving to a union',
            wrap: (model: IAnyModelType) => types.late(() => types.union(types.undefined, model)),
        },
        {
            name: 'optional late type resolving to a union',
            wrap: (model: IAnyModelType) =>
                types.optional(
                    types.late(() => types.union(types.undefined, model)),
                    {
                        value: 'default',
                    },
                ),
        },
    ])('normalizes query data with $name', ({ wrap }) => {
        const Child = types.model({ value: types.string });
        const Query = createQuery('LateTypeQuery', {
            data: types.model({ child: wrap(Child) }),
        });
        const client = new QueryClient({
            RootStore: createRootStore({ query: types.optional(Query, {}) }),
        }).init();

        client.rootStore.query.setData({ child: { value: 'loaded' } });

        expect(getSnapshot(client.rootStore.query.data!)).toEqual({
            child: { value: 'loaded' },
        });
    });
});
