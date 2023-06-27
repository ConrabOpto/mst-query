import { types, getSnapshot, getRoot } from 'mobx-state-tree';
import { ItemModel } from './ItemModel';

export const ListModel = types
    .model('ListModel', {
        id: types.optional(types.identifier, () => 'optional-1'),
        items: types.array(types.reference(ItemModel)),
    })
    .actions((self) => ({
        addItems(items: any) {
            self.items.push(...getSnapshot(items) as any);
        },
        removeItem(item: any) {
            self.items.remove(item);
        },
        addItem(item: any) {
            self.items.push(item);
        },
    }));
