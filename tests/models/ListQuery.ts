import { types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from '../../src';
import { api } from '../api/api';
import { ListModel } from './ListModel';

export const ListQuery = createQuery('ListQuery', {
    data: MstQueryRef(ListModel),
    pagination: types.model({ offset: 0 }),
    endpoint: api.getItems
});