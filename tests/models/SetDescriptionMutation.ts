import { flow, types } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { RequestModel } from '../../src/RequestModel';
import { ItemModel } from './ItemModel';

export const SetDescriptionMutation = createMutation('SetDescriptionMutation', {
    data: MstQueryRef(ItemModel),
    request: RequestModel.props({ id: types.string, description: '' }),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.mutate(self.env.api.setDescription);
        next();
    }),
}));
