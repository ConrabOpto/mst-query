import { types } from 'mobx-state-tree';
import { createQuery } from '../../src';
import { subscribe } from '../../src/MstQueryHandler';
import { api } from '../api/api';
import { ListModel } from './ListModel';

export const ListQuery = createQuery('ListQuery', {
    data: types.reference(ListModel),
    pagination: types.optional(types.model({ offset: 0 }), {}),
    endpoint: api.getItems,
}).actions((self) => ({
    afterCreate() {
        subscribe(self, {
            onQueryMore(data: any) {
                self.data?.addItems(data?.items);
            },
        });
    },
}));
