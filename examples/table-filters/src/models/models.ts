import { getRoot, IAnyModelType, Instance, types } from 'mobx-state-tree';
import { MstQueryModel, MstQueryRef } from 'mst-query';

export const UserModel = MstQueryModel.named('UserModel').props({
    id: types.identifier,
    name: types.maybe(types.string),
    shortName: types.maybe(types.string),
    approver: types.maybe(MstQueryRef(types.late((): IAnyModelType => UserModel))),
});

export type UserModelType = Instance<typeof UserModel>;

export const InvoiceModel = MstQueryModel.named('InvoiceModel').props({
    id: types.identifier,
    company: types.maybe(types.string),
    amount: types.number,
    dueDate: types.maybe(types.Date),
    createdBy: MstQueryRef(UserModel),
});

export type InvoiceModelType = Instance<typeof InvoiceModel>;

export const InvoiceFilterModel = MstQueryModel.named('InvoiceFilterModel')
    .props({
        id: types.identifier,
        name: types.string,
        filter: types.maybe(types.string),
    })
    .views(self => ({
        get filterMinAmount() {
            if (!self.filter) {
                return 0;
            }
            const parsed = parseFloat(self.filter);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
    }))
    .actions(self => ({
        setFilter(filter: string) {
            self.filter = filter;
        },
        async save() {
            const root = getRoot<any>(self);
            return root.invoiceApiStore.saveFilter(self);
        }
    }));    

export type InvoiceFilterModelType = Instance<typeof InvoiceFilterModel>;

export const InvoiceListModel = MstQueryModel.named('InvoiceListModel').props({
    filters: types.array(MstQueryRef(InvoiceFilterModel)),
    invoices: types.array(MstQueryRef(InvoiceModel)),
});

export type InvoiceListModelType = Instance<typeof InvoiceListModel>;

export const CompanyModel = MstQueryModel.named('CompanyModel').props({
    id: types.identifier,
    name: types.string,
    invoiceList: types.maybe(InvoiceListModel),
});

export type CompanyModelType = Instance<typeof CompanyModel>;
