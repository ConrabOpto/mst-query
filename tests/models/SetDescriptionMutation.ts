import { flow, types } from 'mobx-state-tree';
import { createMutation, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const SetDescriptionMutation = createMutation('SetDescriptionMutation', {
    data: MstQueryRef(ItemModel),
})
    .props({
        env: types.frozen(),
    })
    .actions((self) => ({
        run: flow(function* (request: { id: string; description: string }) {
            const next = yield* self.mutate(self.env.api.setDescription, {
                request,
            });
            next();
        }),
    }));
