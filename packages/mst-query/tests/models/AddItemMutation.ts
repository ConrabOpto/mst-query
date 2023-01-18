import { types } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';
import { api } from '../api/api';

export const AddItemMutation = createMutation('AddMutation', {
    data: MstQueryRef(ItemModel),
    request: types.model({ path: types.string, message: types.string }),
    endpoint: api.addItem
});
