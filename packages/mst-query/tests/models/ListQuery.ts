import { types } from 'mobx-state-tree';
import { api } from '../api/api';
import { ListModel } from './ListModel';
import { createInfiniteQuery } from '../../src/create';

export const ListQuery = createInfiniteQuery('ListQuery', {
    data: types.reference(ListModel),
    pagination: types.optional(types.model({ offset: 0 }), {}),
    async endpoint(args) {
        return args.meta.getItems ? args.meta.getItems(args) : api.getItems(args);
    },
    onQueryMore({ data, query }) {
        query.data?.addItems(data?.items);
    },
});
