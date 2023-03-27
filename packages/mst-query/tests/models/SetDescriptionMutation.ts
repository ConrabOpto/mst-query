import { types } from 'mobx-state-tree';
import { createMutation } from '../../src';
import { api } from '../api/api';
import { ItemModel } from './ItemModel';

export const SetDescriptionMutation = createMutation('SetDescriptionMutation', {
    data: types.reference(ItemModel),
    request: types.model({ id: types.string, description: types.string }),
    endpoint: api.setDescription
});
