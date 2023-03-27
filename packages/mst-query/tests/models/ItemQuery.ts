import { types } from 'mobx-state-tree';
import { createQuery } from '../../src';
import { api } from '../api/api';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQuery('ItemQuery', {
    request: types.model({ id: types.string }),
    data: types.reference(ItemModel),
    endpoint: api.getItem,
});

export const SubscriptionItemQuery = createQuery('SubscriptionItemQuery', {
    data: types.reference(ItemModel),
    request: types.model({ id: types.string })
});
