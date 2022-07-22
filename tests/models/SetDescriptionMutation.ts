import { types } from 'mobx-state-tree';
import { createMutationWithRun, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const SetDescriptionMutation = createMutationWithRun('SetDescriptionMutation', {
    data: MstQueryRef(ItemModel),
    request: types.model({ id: types.string, description: types.string })
});
