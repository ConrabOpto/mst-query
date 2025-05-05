import { destroy, IAnyModelType, Instance, types } from 'mobx-state-tree';
import { createQuery } from '../../src/create';
import { onMutate } from '../../src/MstQueryHandler';
import { createModelStore, createRootStore } from '../../src/stores';
import { AddItemMutation } from './AddItemMutation';
import { ItemModel } from './ItemModel';
import { ItemQuery, SubscriptionItemQuery } from './ItemQuery';
import { ItemQueryWithOptionalRequest } from './ItemQueryWithOptionalRequest';
import { ListModel } from './ListModel';
import { ListQuery } from './ListQuery';
import { SetDescriptionMutation } from './SetDescriptionMutation';
import { UserModel } from './UserModel';
import { ArrayQuery } from './ArrayQuery';
import { SafeReferenceQuery } from './SafeReferenceQuery';
import { RemoveItemMutation } from './RemoveItemMutation';
import { ErrorMutation } from './ErrorMutation';
import { FixedModel, FormatModel } from './UnionModel';

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
    ref: types.maybe(types.reference(DeepModelC)),
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
            }),
        ),
    ),
});

const TestModel = types.model({
    id: types.string,
    frozen: types.frozen(),
    prop: types.maybeNull(
        types.model({
            ids: types.array(types.model({ baha: types.string })),
        }),
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
        removeItemMutation: optional(RemoveItemMutation),
        setDescriptionMutation: optional(SetDescriptionMutation),
        listQuery: optional(ListQuery),
        arrayQuery: optional(ArrayQuery),
        safeReferenceQuery: optional(SafeReferenceQuery),
        subscriptionQuery: optional(SubscriptionItemQuery),
        itemQueryWihthOptionalRequest: optional(ItemQueryWithOptionalRequest),
        errorMutation: optional(ErrorMutation),
    })
    .actions((self) => ({
        afterCreate() {
            onMutate(self.addItemMutation, (data) => {
                self.listQuery.data?.addItem(data);
            });
            onMutate(self.removeItemMutation, (data) => {
                destroy(data);
            });
        },
    }));

const ServiceStore = types.model({
    itemServiceStore: optional(ItemServiceStore),
    frozenQuery: optional(createQuery('FrozenQuery', { data: TestModel })),
    deepModelA: types.maybe(DeepModelA),
});

export const Root = createRootStore({
    itemStore: optional(createModelStore('ItemStore', ItemModel)),
    userStore: optional(createModelStore('UserStore', UserModel)),
    listStore: optional(createModelStore('ListStore', ListModel)),
    dateStore: optional(createModelStore('DateStore', DateModel)),
    deepModelCStore: optional(createModelStore('DeepModelCStore', DeepModelC)),
    fixedModelStore: optional(createModelStore('FixedModelStore', FixedModel)),
    formatModelStore: optional(createModelStore('FixedModelStore', FormatModel)),
    serviceStore: optional(ServiceStore),
});

export interface RootStoreType extends Instance<typeof Root> {}
