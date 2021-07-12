import { flow, types } from 'mobx-state-tree';
import { createQuery } from '../../src';
import { ListModel } from './ListModel';

export const ListQuery = createQuery('ListQuery', {
    data: ListModel,
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(self.env.api.getItems);
        return next();
    }),
    addItem(item: any) {
        self.data?.items.push(item);
    },
    removeItem(item: any) {
        self.data?.items.remove(item);
    },
    fetchMore: flow(function* () {
        const next = yield* self.queryMore(self.env.api.getItems, null, {
            variables: { offset: 5 },
        });
        const { data } = next<typeof ListQuery>();
        if (data?.items) {
            self.data?.items.push(...data.items);
        }
    }),
}));
