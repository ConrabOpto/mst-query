import { flow, getEnv } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';
import { ListQuery } from './ListQuery';
import { itemData } from '../api/data';
import { mergeOptimisticData } from '../../src/merge';

export const AddItemMutation = createMutation('AddMutation', {
    data: MstQueryRef(ItemModel),
}).actions((self) => ({
    run: flow(function* () {
        const query = getEnv(self).queryClient.queryStore.find(
            ListQuery,
            (q: any) => q.request.id === 'test'
        );
        const optimistic = mergeOptimisticData(ItemModel, itemData, getEnv(self));
        query?.addItem(optimistic);

        const next = yield* self.mutate(self.env.api.addItem);
        const { data } = next<typeof AddItemMutation>();

        query?.removeItem(optimistic);
        query?.addItem(data);
    })
}));
