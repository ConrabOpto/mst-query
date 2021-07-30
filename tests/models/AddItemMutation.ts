import { flow } from 'mobx-state-tree';
import { createMutation, createOptimisticData, MstQueryRef, queryCache } from '../../src';
import { ItemModel } from './ItemModel';
import { ListQuery } from './ListQuery';
import { itemData } from '../api/data';

export const AddItemMutation = createMutation('AddMutation', {
    data: MstQueryRef(ItemModel),
}).actions((self) => ({
    run: flow(function* () {
        const query = queryCache.find(ListQuery, (q) => q.request.id === 'test');
        const optimistic = createOptimisticData(ItemModel, itemData);
        query?.addItem(optimistic);

        const next = yield* self.mutate(self.env.api.addItem);
        const { data } = next<typeof AddItemMutation>();

        query?.removeItem(optimistic);
        query?.addItem(data);
    }),
}));
