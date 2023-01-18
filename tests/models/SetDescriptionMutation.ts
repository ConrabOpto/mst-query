import { types } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { api } from '../api/api';
import { ItemModel } from './ItemModel';

export const SetDescriptionMutation = createMutation('SetDescriptionMutation', {
    data: MstQueryRef(ItemModel),
    request: types.model({ id: types.string, description: types.string }),
    endpoint: api.setDescription
});
