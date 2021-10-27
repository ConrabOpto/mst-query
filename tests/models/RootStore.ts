import { types } from 'mobx-state-tree';
import { createModelStore, createRootStore } from '../../src/RootStore';
import { ItemModel } from './ItemModel';
import { ListModel } from './ListModel';
import { UserModel } from './UserModel';

export const RootStore = createRootStore({
    itemStore: types.optional(createModelStore({ items: types.map(ItemModel) }), {}),
    userStore: types.optional(createModelStore({ users: types.map(UserModel) }), {}),
    listStore: types.optional(createModelStore({ lists: types.map(ListModel) }), {}),
});
