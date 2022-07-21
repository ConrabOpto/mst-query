import { types } from 'mobx-state-tree';
import { createQueryWithRun, MstQueryRef } from '../../src';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQueryWithRun('ItemQuery', {
    request: types.model({ id: types.string }),
    data: MstQueryRef(ItemModel),
});
