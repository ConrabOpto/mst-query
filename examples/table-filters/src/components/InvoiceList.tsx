import { observer } from 'mobx-react';
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQueryMore, useMutation } from 'mst-query';
import { useRootStore } from '../context';
import { InvoiceModelType, InvoiceFilterModelType } from '../models/models';
import { InvoiceEditor } from './InvoicePreview';
import { InvoiceListFilters } from './InvoiceListFilters';

const List = observer(
    (props: {
        items: InvoiceModelType[];
        onRowClick: (item: InvoiceModelType) => void;
        minAmount: number;
        selectedItemId?: string;
    }) => {
        const { items, minAmount, onRowClick, selectedItemId } = props;
        return (
            <>
                {items
                    .filter((invoice) => invoice.amount > minAmount)
                    .map((invoice) => (
                        <tr
                            key={invoice.id}
                            onClick={() => onRowClick(invoice)}
                            style={{
                                background: selectedItemId === invoice.id ? '#eee' : undefined,
                            }}>
                            <td>{invoice.id}</td>
                            <td>{invoice.amount}</td>
                            <td>{invoice.createdBy.shortName}</td>
                        </tr>
                    ))}
            </>
        );
    }
);

export const InvoiceList = observer(() => {
    const rootStore = useRootStore();
    const invoiceApiStore = rootStore.invoiceApiStore;
    const invoiceStore = rootStore.invoiceStore;

    const { companyId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const [offset, setOffset] = useState(0);
    const [previewId, setPreviewId] = useState<string | undefined>();

    const { data, isLoading, isFetchingMore, isRefetching, refetch } = useQueryMore(
        invoiceApiStore.invoiceListQuery,
        invoiceApiStore.getInvoiceList,
        invoiceApiStore.getInvoiceListMore,
        {
            request: { id: companyId! },
            pagination: { offset: offset }
        }
    );

    const [remove, { isLoading: isRemovingFilter }] = useMutation(
        invoiceApiStore.removeInvoiceFilterMutation,
        invoiceApiStore.removeFilter
    );

    useEffect(() => {
        if (data) {
            setSearchParams({ filter: data.filters[0].id });
        }
    }, [data]);

    const handleOnSelectedFilter = (filter: InvoiceFilterModelType) => {
        setSearchParams({ filter: filter.id });
    };
    const saveFilter = async (filter: InvoiceFilterModelType) => {
        const savedFilter = await filter.save();
        setSearchParams({ filter: savedFilter.id });
    };
    const removeFilter = async (filter: InvoiceFilterModelType) => {
        const filterToSelect = await remove(filter);
        setSearchParams({ filter: filterToSelect?.id! });
    }
    const loadMore = async () => {
        const offset = (data?.invoices.length ?? 0) + 1;
        setOffset(offset);
    };
    const reset = async () => {
        setOffset(0);
        refetch({ request: { id: companyId }, pagination: { offset: 0 } });
    };

    const selectedFilter = data?.filters.find((filter) => filter.id === searchParams.get('filter'));
    const preview = previewId && invoiceStore.models.get(previewId);
    if (!data || !selectedFilter) {
        return <div>Loading invoices...</div>;
    }
    return (
        <div className="invoice-list">
            <div>
                <InvoiceListFilters
                    selectedFilter={selectedFilter}
                    onSelectedFilter={handleOnSelectedFilter}
                />
            </div>
            <div className="invoice-list-buttons">
                <select
                    value={selectedFilter.id}
                    onChange={(ev) =>
                        handleOnSelectedFilter(
                            data.filters.find((filter: any) => filter.id === ev.target.value)!
                        )
                    }>
                    {data.filters.map((filter) => (
                        <option key={filter.id} value={filter.id}>
                            {`${filter._isClientModel ? '*' : ''} ${filter.name}`}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() => {
                        const optimistic = invoiceApiStore.addFilter();
                        setSearchParams({ filter: optimistic.id });
                    }}>
                    Add
                </button>
                <button disabled={isRemovingFilter} onClick={() => saveFilter(selectedFilter)}>Save</button>
                <button disabled={isRemovingFilter} onClick={() => removeFilter(selectedFilter)}>
                    Remove
                </button>
                <button onClick={() => reset()}>Refetch</button>
                <button onClick={() => loadMore()}>Load more</button>
                <button
                    onClick={() =>
                        rootStore.runGc()
                    }>{`GC: ${invoiceStore.models.size} invoices in store`}</button>
            </div>
            <div>
                <div>isLoading:{`${isLoading}`}</div>
                <div>isRefetching:{`${isRefetching}`}</div>
                <div>isFetchingMore:{`${isFetchingMore}`}</div>
            </div>
            <div className="invoice-list-result">
                <div className="invoice-list-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Invoice id</th>
                                <th>Amount</th>
                                <th>Created by</th>
                            </tr>
                        </thead>
                        <tbody>
                            <List
                                items={data.invoices}
                                minAmount={selectedFilter.filterMinAmount}
                                onRowClick={(item: InvoiceModelType) =>
                                    setPreviewId((id) => (id === item.id ? undefined : item.id))
                                }
                                selectedItemId={previewId}
                            />
                        </tbody>
                    </table>
                </div>
                <div className="invoice-list-preview">
                    {preview && <InvoiceEditor invoice={preview} />}
                </div>
            </div>
        </div>
    );
});
