import { flow, getSnapshot, types } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const SetDescriptionMutation = createMutation('SetDescriptionMutation', {
    data: MstQueryRef(ItemModel),
    request: types.model({ id: types.string, description: types.string }),
    env: types.frozen(),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.mutate(self.env.api.setDescription, getSnapshot(self.request));
        next();
    }),
}));
