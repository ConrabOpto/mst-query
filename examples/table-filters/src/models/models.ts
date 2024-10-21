import { IAnyModelType, Instance, types } from 'mobx-state-tree';

export const UserModel = types.model('UserModel', {
    id: types.identifier,
    name: types.maybe(types.string),
    shortName: types.maybe(types.string),
    approver: types.maybe(types.reference(types.late((): IAnyModelType => UserModel))),
});

export type UserModelType = Instance<typeof UserModel>;

export const InvoiceModel = types.model('InvoiceModel', {
    id: types.identifier,
    company: types.maybe(types.string),
    amount: types.number,
    dueDate: types.maybe(types.Date),
    createdBy: types.reference(UserModel),
});

export type InvoiceModelType = Instance<typeof InvoiceModel>;

export const InvoiceFilterModel = types
    .model('InvoiceFilterModel', {
        id: types.identifier,
        name: types.string,
        filter: types.maybe(types.string),
    })
    .volatile((self) => ({
        hasChanged: false,
    }))
    .views((self) => ({
        get filterMinAmount() {
            if (!self.filter) {
                return 0;
            }
            const parsed = parseFloat(self.filter);
            return Number.isNaN(parsed) ? 0 : parsed;
        },
    }))
    .actions((self) => ({
        setFilter(filter: string) {
            self.filter = filter;

            if (!self.hasChanged) {
                self.hasChanged = true;
            }
        },
    }))
    .actions((self) => ({
        setHasChanged(hasChanged: boolean) {
            self.hasChanged = hasChanged;
        },
    }));

export type InvoiceFilterModelType = Instance<typeof InvoiceFilterModel>;

export const InvoiceListModel = types.model('InvoiceListModel', {
    filters: types.array(
        types.safeReference(InvoiceFilterModel, {
            acceptsUndefined: false,
        })
    ),
    invoices: types.array(
        types.safeReference(InvoiceModel, {
            acceptsUndefined: false,
        })
    ),
});

export type InvoiceListModelType = Instance<typeof InvoiceListModel>;

export const CompanyModel = types.model('CompanyModel', {
    id: types.identifier,
    name: types.string,
    invoiceList: types.maybe(InvoiceListModel),
});

export type CompanyModelType = Instance<typeof CompanyModel>;
