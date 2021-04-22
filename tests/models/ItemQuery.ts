import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQuery('ItemQuery', {
    data: MstQueryRef(ItemModel),
    request: types.model({ id: types.string }),
    env: types.frozen()
}).actions((self) => ({
    run: flow(function* () {
        const next = yield self.query(self.env.api.getItem, { id: self.request.id });
        next();
    })
}))