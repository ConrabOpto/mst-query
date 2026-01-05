import { types } from 'mobx-state-tree';
import { createMutation } from '../../src';
import { ItemModel } from './ItemModel';
import { api } from '../api/api';

export const RemoveItemMutation = createMutation('RemoveMutation', {
    data: types.reference(ItemModel),
    request: types.model({ id: types.string }),
    scope: { id: 'sequential-updates' },
    async endpoint(args) {
        return args.meta.removeItem ? args.meta.removeItem(args) : api.removeItem(args);
    },
});
