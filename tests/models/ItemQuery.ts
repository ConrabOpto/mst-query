import { types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { api } from '../api/api';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQuery('ItemQuery', {
    request: types.model({ id: types.string }),
    data: MstQueryRef(ItemModel),
    endpoint: api.getItem
});
