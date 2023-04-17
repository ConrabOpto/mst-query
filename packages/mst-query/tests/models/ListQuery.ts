import { types } from 'mobx-state-tree';
import { createQuery } from '../../src';
import { subscribe } from '../../src/MstQueryHandler';
import { api } from '../api/api';
import { wait } from '../utils';
import { ListModel } from './ListModel';

export const ListQuery = createQuery('ListQuery', {
    data: types.reference(ListModel),
    pagination: types.optional(types.model({ offset: 0 }), {}),
    async endpoint(args) {
        return args.meta.getItems ? args.meta.getItems(args) : api.getItems(args);
    }
}).actions((self) => ({
    afterCreate() {
        subscribe(self, {
            onQueryMore(data: any) {
                self.data?.addItems(data?.items);
            },
        });
    },
}));
