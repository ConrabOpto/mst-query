import { observer } from "mobx-react";
import { useState } from "react";
import { useRootStore } from "../context";
import { InvoiceApiStoreType } from "../models/api";
import { InvoiceFilterModelType } from "../models/models";

export const InvoiceListFilter = observer(
    (props: {
        filter: InvoiceFilterModelType;
        onFilterUpdate: (filter: InvoiceFilterModelType, filterText: string) => void;
    }) => {
        const { filter, onFilterUpdate } = props;
        const [filterText, setFilterText] = useState(filter.filter ?? '');
        return (
            <>
                <input
                    type="text"
                    value={filterText}
                    onChange={(ev) => setFilterText(ev.target.value)}
                    placeholder={'Filter min amount...'}
                />
                <button type="button" onClick={() => onFilterUpdate(filter, filterText)}>
                    Search
                </button>
            </>
        );
    }
);

export const InvoiceListFilters = observer(
    (props: {
        selectedFilter: InvoiceFilterModelType;
        onSelectedFilter: (filter: InvoiceFilterModelType) => void;
    }) => {
        const { selectedFilter, onSelectedFilter } = props;
        const rootStore = useRootStore();
        const handleFilterUpdate = async (filter: InvoiceFilterModelType, filterText: string) => {
            const invoiceApiStore = rootStore.invoiceApiStore as InvoiceApiStoreType;
            const modelToSelect = await invoiceApiStore.updateFilter(filter, filterText);
            if (modelToSelect) {
                onSelectedFilter(modelToSelect);
            }
        };
        return (
            <div className="invoice-list-filters">
                {selectedFilter && (
                    <InvoiceListFilter
                        key={selectedFilter.id}
                        filter={selectedFilter}
                        onFilterUpdate={handleFilterUpdate}
                    />
                )}
            </div>
        );
    }
);
