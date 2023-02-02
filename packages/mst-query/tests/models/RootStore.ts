import { flow, getRoot, IAnyModelType, Instance, types } from 'mobx-state-tree';
import { createQuery } from '../../src/create';
import { MstQueryRef } from '../../src/MstQueryRef';
import { createModelStore, createRootStore } from '../../src/stores';
import { itemData } from '../api/data';
import { AddItemMutation } from './AddItemMutation';
import { ItemModel } from './ItemModel';
import { ItemQuery } from './ItemQuery';
import { ListModel } from './ListModel';
import { ListQuery } from './ListQuery';
import { SetDescriptionMutation } from './SetDescriptionMutation';
import { UserModel } from './UserModel';

export const DateModel = types.model('DateModel', {
    id: types.identifier,
    changed: types.model({
        at: types.Date,
    }),
});

const DeepModelC = types.model('DeepModelC', {
    id: types.identifier,
    a: types.maybe(types.string),
});
const DeepModelB = types.model('DeepModelB', {
    a: types.maybe(types.string),
    b: types.maybe(types.string),
});

export const DeepModelA = types.model('DeepModelA', {
    model: types.maybe(DeepModelB),
    ref: types.maybe(MstQueryRef(DeepModelC)),
});

const AmountTag = {
    Limited: 'Limited',
    Unlimited: 'Unlimited',
};

const AmountLimitModel = types.model('AmountLimit').props({
    tag: types.maybe(types.enumeration(Object.values(AmountTag))),
    content: types.maybeNull(
        types.map(
            types.model({
                tag: types.enumeration(Object.values(AmountTag)),
                content: types.maybeNull(types.string),
            })
        )
    ),
});

const TestModel = types.model({
    id: types.string,
    frozen: types.frozen(),
    prop: types.maybeNull(
        types.model({
            ids: types.array(types.model({ baha: types.string })),
        })
    ),
    folderPath: types.maybe(types.string),
    origin: types.union(types.string, types.undefined),
    amountLimit: types.maybe(AmountLimitModel),
});

const optional = <T extends IAnyModelType>(model: T) => types.optional(model, {});

const ItemServiceStore = types
    .model({
        itemQuery: optional(ItemQuery),
        itemQuery2: optional(ItemQuery),
        addItemMutation: optional(AddItemMutation),
        setDescriptionMutation: optional(SetDescriptionMutation),
        listQuery: optional(ListQuery)
    })
    .actions((self) => ({
        getItem: flow(function* ({ id }: { id: string }, options = {}) {
            const next = yield* self.itemQuery.query({ request: { id }, ...options });
            next();
        }),
        getItem2: flow(function* ({ id }) {
            const next = yield* self.itemQuery.query({ request: { id } });
            next();
        }),
        getItems: flow(function* (request, pagination = {}, options = {}) {
            const next = yield* self.listQuery.query({
                pagination: { offset: 0 },
                request,
                ...options,
            });
            next();
        }),
        getMoreItems: flow(function* (request, { offset }, options = {}) {
            const next = yield* self.listQuery.queryMore({
                pagination: { offset },
                request,
                ...options,
            });
            const { data } = next();
            self.listQuery.data?.addItems(data?.items);
        }),
        setDescription: flow(function* ({ id, description }) {
            const next = yield* self.setDescriptionMutation.mutate({
                request: { id, description },
            });
            next();
        }),
        addItem: flow(function* ({ path, message }: { path: string; message: string }) {
            const root = getRoot(self) as RootStoreType;

            const next = yield* self.addItemMutation.mutate({
                request: { path, message },
                optimisticUpdate: () => {
                    const optimistic = root.itemStore.merge({
                        ...itemData,
                        id: 'temp'
                    });
                    self.listQuery.data?.addItem(optimistic);
                },
            });
            const { data } = next();
            
            self.listQuery.data?.addItem(data);
        })
    }));

const ServiceStore = types.model({
    itemServiceStore: optional(ItemServiceStore),
    frozenQuery: optional(createQuery('FrozenQuery', { data: TestModel })),
});

export const Root = createRootStore({
    itemStore: optional(createModelStore(ItemModel)),
    userStore: optional(createModelStore(UserModel)),
    listStore: optional(createModelStore(ListModel)),
    dateStore: optional(createModelStore(DateModel)),
    deepModelCStore: optional(createModelStore(DeepModelC)),
    serviceStore: optional(ServiceStore),
});

export interface RootStoreType extends Instance<typeof Root> {}
