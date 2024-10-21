import { types, Instance } from 'mobx-state-tree';
import { createModelStore, createRootStore } from 'mst-query';
import { InvoiceService } from './services';
import { InvoiceFilterModel, InvoiceModel, CompanyModel, UserModel } from './models';
import { AppQuery } from './queries';

export const InvoiceModelStore = createModelStore('InvoiceModelStore', InvoiceModel);

export const InvoiceFilterModelStore = createModelStore(
    'InvoiceFilterModelStore',
    InvoiceFilterModel
);

export const CompanyModelStore = createModelStore('CompanyModelStore', CompanyModel);

export const UserModelStore = createModelStore('UserModelStore', UserModel);

export const RootStore = createRootStore({
    invoiceStore: types.optional(InvoiceModelStore, {}),
    invoiceFilterStore: types.optional(InvoiceFilterModelStore, {}),
    companyStore: types.optional(CompanyModelStore, {}),
    userStore: types.optional(UserModelStore, {}),
}).props({
    invoiceService: types.optional(InvoiceService, {}),
    baseQuery: types.optional(AppQuery, {}),
});

export type RootStoreType = Instance<typeof RootStore>;
