import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQuery('ItemQuery', {
    request: types.model({ id: types.string }),
    data: MstQueryRef(ItemModel),
})
    .props({
        env: types.frozen(),
    })
    .actions((self) => ({
        run: flow(function* (request: { id: string }) {
            const next = yield* self.query(self.env.api.getItem, {
                request,
            });
            next();
        }),
    }));