import { types } from 'mobx-state-tree';
import { createModelStore, createRootStore } from '../../src/RootStore';
import { ItemModel } from './ItemModel';
import { ListModel } from './ListModel';
import { UserModel } from './UserModel';

export const RootStore = createRootStore({
    itemStore: createModelStore({ items: types.map(ItemModel) }),
    userStore: createModelStore({ users: types.map(UserModel) }),
    listStore: createModelStore({ lists: types.map(ListModel) }),
});
