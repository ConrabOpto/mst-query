import { observer } from 'mobx-react';
import { useQuery } from 'mst-query';
import { useRootStore } from "../context";
import { InvoiceApiStoreType } from "../models/api";
import { InvoiceModelType } from '../models/models';

const useInvoiceQuery = (id: string, initialData: any) => {
    const rootStore = useRootStore();
    const invoiceApiStore = rootStore.invoiceApiStore as InvoiceApiStoreType;
    return useQuery(invoiceApiStore.invoiceQuery, invoiceApiStore.getInvoice, {
        request: { id },
        initialData,
        staleTime: 5000
    });
};

export const InvoiceEditor = observer((props: { invoice: InvoiceModelType }) => {
    const { invoice } = props;
    const { isLoading } = useInvoiceQuery(invoice.id, invoice);
    return (
        <div>
            <div style={{ color: 'red' }}>{isLoading && `Loading invoice...`}</div>
            <h3>Invoice id</h3>
            <div>{invoice.id}</div>
            <h3>Amount</h3>
            <div>{invoice.amount}</div>
            <h3>Due date</h3>
            <div>{invoice.dueDate?.toDateString()}</div>
            <h3>Created by</h3>
            <div>{invoice.createdBy?.name}</div>
            <h3>Approver</h3>
            <div>{invoice.createdBy?.approver?.name}</div>
        </div>
    );
});
