import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { RequestModel } from '../../src/RequestModel';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQuery('ItemQuery', {
    data: MstQueryRef(ItemModel),
    request: types.optional(RequestModel.props({ id: '' }), {}),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(self.env.api.getItem);
        next();
    }),
}));
