import { Instance, types } from 'mobx-state-tree';
import { createMutation, createQuery, MstQueryRef } from 'mst-query';
import { baseData as appData } from '../data/data';
import { listData, listMoreData } from '../data/acme';
import { CompanyModel, InvoiceFilterModel, InvoiceListModel, InvoiceModel } from './models';

export const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

let filters = 2;

export const SaveInvoiceFilterMutation = createMutation('SaveInvoiceFilterMutation', {
    data: MstQueryRef(InvoiceFilterModel),
    request: types.model({ id: types.string, filter: types.string }),
    async endpoint({ request }) {
        const filter = listData.filters.find((filter) => filter.id === request.id);
        await wait(200);
        if (filter) {
            return {
                ...filter,
                filter: request.filter,
            };
        }
        const id = ++filters;
        const newFilter = {
            id: `filter-${id}`,
            name: `Saved filter ${id}`,
            filter: request.filter,
        };
        listData.filters.push(newFilter);
        listMoreData.filters.push(newFilter);
        return newFilter;
    },
});

export const RemoveInvoiceFilterMutation = createMutation('SaveInvoiceFilterMutation', {
    data: MstQueryRef(InvoiceFilterModel),
    request: types.model({ id: types.string }),
    async endpoint({ request }) {
        listData.filters = listData.filters.filter((f) => f.id === request.id);
        listMoreData.filters = listMoreData.filters.filter((f) => f.id === request.id);
        await wait(1000);
        return;
    },
});

export const InvoiceQuery = createQuery('InvoiceQuery', {
    data: MstQueryRef(InvoiceModel),
    request: types.model({ id: types.string }),
    async endpoint({ request }) {
        const invoice = [...listData.invoices, ...listMoreData.invoices].find(
            (invoice) => invoice.id === request.id
        );
        await wait(2000);
        return {
            ...invoice,
            dueDate: new Date('2022-10-27T12:46:40.706Z'),
            createdBy: {
                id: 'user-1',
                name: 'Kim Ode',
                approver: {
                    id: 'user-2',
                    name: 'Johan Andersson',
                    shortName: 'JA',
                },
            },
        };
    },
});

export const InvoiceListQuery = createQuery('InvoiceListQuery', {
    data: InvoiceListModel,
    request: types.model({ id: types.string }),
    pagination: types.model({ offset: 0 }),
    async endpoint({ request, pagination }: any) {
        await wait(200);
        if (pagination.offset > 0) {
            return listMoreData;
        }
        return listData;
    },
});

export const AppQuery = createQuery('AppQuery', {
    data: types.array(MstQueryRef(CompanyModel)),
    async endpoint() {
        await wait(50);
        return appData;
    },
});

export type AppQueryType = Instance<typeof AppQuery>;
