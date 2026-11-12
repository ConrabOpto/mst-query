import { types } from 'mobx-state-tree';
import { createModelStore, createQuery, createRootStore } from 'mst-query';

export const ItemModel = types.model('Item', {
    id: types.identifier,
    description: types.string,
    createdAt: types.Date,
});

export const ItemQuery = createQuery('ItemQuery', {
    data: types.reference(ItemModel),
    request: types.model({ id: types.string }),
    // fetchItem is only passed on the server, so any fetch from the client fails the build
    endpoint: ({ request, meta }) => meta.fetchItem(request.id),
});

const ItemStore = createModelStore('ItemStore', ItemModel).props({
    awaitedItemQuery: types.optional(ItemQuery, {}),
    streamedItemQuery: types.optional(ItemQuery, {}),
});

export const RootStore = createRootStore({
    itemStore: types.optional(ItemStore, {}),
});

const AdminStore = createModelStore('AdminStore', ItemModel).props({
    adminItemQuery: types.optional(ItemQuery, {}),
});

export const AdminRootStore = createRootStore({
    adminStore: types.optional(AdminStore, {}),
});
