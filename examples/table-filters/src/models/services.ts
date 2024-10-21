import { types, Instance, destroy, castToReferenceSnapshot } from 'mobx-state-tree';
import { onMutate } from 'mst-query';
import {
    InvoiceListQuery,
    InvoiceQuery,
    RemoveInvoiceFilterMutation,
    SaveInvoiceFilterMutation,
} from './queries';

export const InvoiceService = types
    .model({
        invoiceQuery: types.optional(InvoiceQuery, {}),
        invoiceListQuery: types.optional(InvoiceListQuery, {}),
        saveInvoiceFilterMutation: types.optional(SaveInvoiceFilterMutation, {}),
        removeInvoiceFilterMutation: types.optional(RemoveInvoiceFilterMutation, {}),
    })
    .views((self) => ({
        get isMutating() {
            return (
                self.saveInvoiceFilterMutation.isLoading ||
                self.removeInvoiceFilterMutation.isLoading
            );
        },
    }))
    .actions((self) => ({
        afterCreate() {
            onMutate(self.saveInvoiceFilterMutation, (data) => {
                const filter = self.invoiceListQuery.data?.filters.find((f) => f.id === data?.id);
                if (!filter) {
                    // filer not in list, add it
                    self.invoiceListQuery.data?.filters.push(castToReferenceSnapshot(data));
                } else {
                    // filter in list, just set hasChanged to false
                    filter.setHasChanged(false);
                }
            });
            onMutate(self.removeInvoiceFilterMutation, (data) => {
                if (data) {
                    destroy(data);
                }

                if (!self.invoiceListQuery.data?.filters.length) {
                    self.saveInvoiceFilterMutation.mutate({
                        request: { id: undefined, filter: '' },
                    });
                }
            });
        },
    }));

export type InvoiceServiceType = Instance<typeof InvoiceService>;
