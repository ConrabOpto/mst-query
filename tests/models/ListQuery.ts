import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { ListModel } from './ListModel';

export const ListQuery = createQuery('ListQuery', {
    data: MstQueryRef(ListModel),
    request: types.optional(types.model({ id: '' }), {}),
    pagination: types.optional(types.model({ offset: types.optional(types.number, 0) }), {}),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(self.env.api.getItems);
        return next();
    }),
    addItem(item: any) {
        self.data?.addItem(item);
    },
    removeItem(item: any) {
        self.data?.removeItem(item);
    },
    fetchMore: flow(function* () {
        self.pagination.offset += 4;

        const next = yield* self.queryMore(self.env.api.getItems);
        const { data } = next();
        if (data?.items) {
            self.data?.addItems(data.items);
        }
    }),
}));
