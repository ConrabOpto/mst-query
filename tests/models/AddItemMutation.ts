import { flow, getEnv, types } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';
import { ListQuery } from './ListQuery';
import { itemData } from '../api/data';
import { mergeOptimisticData } from '../../src/merge';

export const AddItemMutation = createMutation('AddMutation', {
    data: MstQueryRef(ItemModel),
})
    .props({
        env: types.frozen(),
    })
    .actions((self) => ({
        run: flow(function* (request: { path: string, message: string }) {
            const query = getEnv(self).queryClient.queryStore.find(
                ListQuery,
                (q: any) => {
                    return q.variables.request.id === 'test'
                }
            );

            const optimistic = mergeOptimisticData(ItemModel, itemData, getEnv(self));
            query?.addItem(optimistic);

            const next = yield* self.mutate(self.env.api.addItem, {
                request
            });
            const { data } = next();

            query?.removeItem(optimistic);
            query?.addItem(data);
        }),
    }));
