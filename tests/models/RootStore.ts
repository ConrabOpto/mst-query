import { types, IAnyModelType, destroy } from 'mobx-state-tree';
import { ItemModel } from './ItemModel';
import { ListModel } from './ListModel';
import { UserModel } from './UserModel';

const ItemStore = types
    .model({
        items: types.map(ItemModel),
    })
    .actions((self) => ({
        put(instance: any) {
            self.items.put(instance);
        },
        get(id: string) {
            return self.items.get(id);
        },
        delete(id: string) {
            self.items.delete(id);
        },
    }));

const UserStore = types
    .model({
        users: types.map(UserModel),
    })
    .actions((self) => ({
        put(instance: any) {
            self.users.put(instance);
        },
        get(id: string) {
            return self.users.get(id);
        },
        delete(id: string) {
            self.users.delete(id);
        },
    }));

const ListStore = types
    .model({
        lists: types.map(ListModel),
    })
    .actions((self) => ({
        put(instance: any) {
            self.lists.put(instance);
        },
        get(id: string) {
            return self.lists.get(id);
        },
        delete(id: string) {
            self.lists.delete(id);
        },
    }));

const getStoreName = (typeName: string) => {
    return `${typeName.replace(/Model$/, '').toLowerCase()}Store` as 'itemStore' | 'userStore';
};

export const RootStore = types
    .model('RootStore', {
        itemStore: types.optional(ItemStore, {}),
        userStore: types.optional(UserStore, {}),
        listStore: types.optional(ListStore, {}),
    })
    .views((self) => ({
        get models() {
            return new Map([
                ...(self.itemStore.items as any),
                ...self.userStore.users,
                ...self.listStore.lists,
            ]);
        },
    }))
    .actions((self) => ({
        put(type: IAnyModelType, _id: string, instance: any) {
            self[getStoreName(type.name)].put(instance);
        },
        get(type: IAnyModelType, id: string) {
            return self[getStoreName(type.name)].get(id);
        },
        delete(type: IAnyModelType, id: string, instance: any) {
            self[getStoreName(type.name)].delete(id);
            destroy(instance);
        },
    }));
