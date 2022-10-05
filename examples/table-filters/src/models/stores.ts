import { flow, types, Instance } from 'mobx-state-tree';
import { createModelStore, createRootStore } from 'mst-query';
import { InvoiceApiStore, InvoiceApiStoreType } from './api';
import { InvoiceFilterModel, InvoiceModel, CompanyModel, UserModel } from './models';
import { AppQuery, AppQueryType } from './queries';

export const InvoiceModelStore = createModelStore(InvoiceModel);
type InvoiceModelStoreType = Instance<typeof InvoiceModelStore>;

export const InvoiceFilterModelStore = createModelStore(InvoiceFilterModel);
type InvoiceFilterModelStoreType = Instance<typeof InvoiceFilterModelStore>;

export const CompanyModelStore = createModelStore(CompanyModel);
type CompanyModelStoreType = Instance<typeof CompanyModelStore>;

export const UserModelStore = createModelStore(UserModel);
type UserModelStoreType = Instance<typeof InvoiceModelStore>;

export const RootStore = createRootStore({
    invoiceStore: types.optional(InvoiceModelStore, {}),
    invoiceFilterStore: types.optional(InvoiceFilterModelStore, {}),
    companyStore: types.optional(CompanyModelStore, {}),
    userStore: types.optional(UserModelStore, {}),
})
    .props({
        invoiceApiStore: types.optional(InvoiceApiStore, {}),
        baseQuery: types.optional(AppQuery, {}),
    })
    .actions((self) => ({
        getBase: flow(function* () {
            const next = yield* self.baseQuery.query();
            next();
        })
    }));

export type RootStoreType = {
    invoiceStore: InvoiceModelStoreType;
    invoiceFilterStore: InvoiceFilterModelStoreType;
    companyStore: CompanyModelStoreType;
    userStore: UserModelStoreType;
    invoiceApiStore: InvoiceApiStoreType;
    baseQuery: AppQueryType;
    getBase: () => Promise<void>;
};
