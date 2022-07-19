import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { ListModel } from './ListModel';

export const ListQuery = createQuery('ListQuery', {
    data: MstQueryRef(ListModel),
})
    .props({
        env: types.frozen(),
    })
    .actions((self) => ({
        run: flow(function* (
            request: { id: string },
            pagination: { offset: number } = { offset: 0 }
        ) {
            const next = yield* self.query(self.env.api.getItems, {
                request,
                pagination,
            });
            return next();
        }),
        addItem(item: any) {
            self.data?.addItem(item);
        },
        removeItem(item: any) {
            self.data?.removeItem(item);
        },
        fetchMore: flow(function* (offset: number) {
            const next = yield* self.queryMore(self.env.api.getItems, {
                request: self.variables.request,
                pagination: { offset }
            });
            const { data } = next();
            if (data?.items) {
                self.data?.addItems(data.items);
            }
        }),
    }));
