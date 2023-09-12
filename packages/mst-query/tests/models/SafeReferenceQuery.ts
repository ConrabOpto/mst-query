import { types } from 'mobx-state-tree';
import { createQuery } from '../../src';
import { api } from '../api/api';
import { ItemModel } from './ItemModel';

export const SafeReferenceQuery = createQuery('ListQuery', {
    data: types.model({
        items: types.array(
            types.safeReference(ItemModel, {
                acceptsUndefined: false,
            })
        ),
    }),
    async endpoint(args) {
        const result = await api.getItems(args);
        return { items: result.items };
    },
});
