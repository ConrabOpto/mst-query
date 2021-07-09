import { types } from 'mobx-state-tree';
import { MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const ListModel = types.model('ListModel', {
    id: types.optional(types.identifier, () => 'optional-1'),
    items: types.array(MstQueryRef(ItemModel)),
});
