import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const ListQuery = createQuery('ListQuery', {
    data: types.model({ items: types.array(MstQueryRef(ItemModel)) }),
    request: types.frozen(),
    env: types.frozen(),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(self.env.api.getItems);
        return next();
    }),
    addItem(item: any) {
        self.data?.items.push(item);
    },
    fetchMore: flow(function* () {
        const next = yield* self.queryMore(self.env.api.getItems, { offset: 5 });
        const { data } = next<typeof ListQuery>();

        if (data?.items) {
            self.data?.items.push(...data.items);
        }
    }),
}));
