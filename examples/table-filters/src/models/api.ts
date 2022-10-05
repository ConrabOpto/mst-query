import { types, getRoot, Instance, flow } from 'mobx-state-tree';
import type { InvoiceFilterModelType } from './models';
import { InvoiceListQuery, InvoiceQuery, RemoveInvoiceFilterMutation, SaveInvoiceFilterMutation } from './queries';
import type { RootStoreType } from './stores';

export const InvoiceApiStore = types
    .model({
        invoiceQuery: types.optional(InvoiceQuery, {}),
        invoiceListQuery: types.optional(InvoiceListQuery, {}),
        saveInvoiceFilterMutation: types.optional(SaveInvoiceFilterMutation, {}),
        removeInvoiceFilterMutation: types.optional(RemoveInvoiceFilterMutation, {}),
    })
    .actions((self) => ({
        swapFilters(f1: InvoiceFilterModelType, f2: InvoiceFilterModelType) {
            const index = self.invoiceListQuery.data?.filters.indexOf(f1);
            if (index !== undefined && index > -1) {
                self.invoiceListQuery.data?.filters.splice(index, 1, f2.id);
            }
        },
        addFilter() {
            const root = getRoot<RootStoreType>(self);

            const optimistic = root.invoiceFilterStore.createModel({
                name: 'New filter',
                filter: '',
            });
            self.invoiceListQuery.data?.filters.push(optimistic);

            return optimistic;
        },
    }))
    .actions((self) => ({
        getInvoice: flow(function* (request) {
            const next = yield* self.invoiceQuery.query({ request });
            next();
        }),
        getInvoiceList: flow(function* (request, pagination) {
            const next = yield* self.invoiceListQuery.query({ request, pagination });
            next();
        }),
        getInvoiceListMore: flow(function* (request, pagination) {
            const next = yield* self.invoiceListQuery.queryMore({ request, pagination });
            const { data } = next();
            if (data) {
                self.invoiceListQuery.data?.invoices.push(...data?.invoices);
            }
        }),
        saveFilter: flow(function* (model: InvoiceFilterModelType, newFilter?: string) {
            const next = yield* self.saveInvoiceFilterMutation.mutate({
                request: {
                    id: model._originalId ?? model.id,
                    // id: model.id,
                    filter: newFilter ?? model.filter,
                }
            });
            const { data } = next();

            if (data && model._isClientModel) {
                self.swapFilters(model, data);
            }

            return data;
        }),
        async updateFilter(filterModel: InvoiceFilterModelType, newFilter: string) {
            if (filterModel._isClientModel) {
                filterModel.setFilter(newFilter);
                return;
            }

            const root = getRoot<RootStoreType>(self);
            const optimisticModel = root.invoiceFilterStore.createModel(filterModel);
            optimisticModel.setFilter(newFilter);

            self.swapFilters(filterModel, optimisticModel);

            return optimisticModel;
        },
        removeFilter: flow(function* (model: InvoiceFilterModelType) {
            if (model._isClientModel) {
                self.invoiceListQuery.data?.filters.remove(model);
                return;
            }

            const next = yield* self.removeInvoiceFilterMutation.mutate({
                request: {
                    id: model.id,
                },
            });
            next();
            
            self.invoiceListQuery.data?.filters.remove(model);
            if (!self.invoiceListQuery.data?.filters.length) {
                self.addFilter();
            }

            return self.invoiceListQuery.data?.filters[0];
        })
    }));

export type InvoiceApiStoreType = Instance<typeof InvoiceApiStore>;
