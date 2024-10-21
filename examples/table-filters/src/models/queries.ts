import { Instance, types } from 'mobx-state-tree';
import { createMutation, createQuery, createInfiniteQuery } from 'mst-query';
import { CompanyModel, InvoiceFilterModel, InvoiceListModel, InvoiceModel } from './models';
import * as api from '../server';

export const SaveInvoiceFilterMutation = createMutation('SaveInvoiceFilterMutation', {
    data: types.safeReference(InvoiceFilterModel),
    request: types.model({
        id: types.maybe(types.string),
        filter: types.string,
    }),
    endpoint({ request }) {
        return api.saveInvoiceFilter(request.id, request.filter);
    },
});

export const RemoveInvoiceFilterMutation = createMutation('SaveInvoiceFilterMutation', {
    data: types.safeReference(InvoiceFilterModel),
    request: types.model({ id: types.string }),
    endpoint({ request }) {
        return api.removeInvoiceFilter(request.id);
    },
});

export const InvoiceQuery = createQuery('InvoiceQuery', {
    data: types.safeReference(InvoiceModel),
    request: types.model({ id: types.string }),
    endpoint({ request }) {
        return api.getInvoice(request.id);
    },
});

export const InvoiceListQuery = createInfiniteQuery('InvoiceListQuery', {
    data: InvoiceListModel,
    request: types.model({ id: types.string }),
    pagination: types.model({ offset: 0 }),
    onQueryMore({ query, data }) {
        query.data?.invoices.push(...data.invoices);
    },
    async endpoint({ request, pagination }) {
        return api.getInvoiceList(pagination.offset);
    },
});

export const AppQuery = createQuery('AppQuery', {
    data: types.array(types.reference(CompanyModel)),
    async endpoint() {
        return api.getCompanies();
    },
});

export type AppQueryType = Instance<typeof AppQuery>;
