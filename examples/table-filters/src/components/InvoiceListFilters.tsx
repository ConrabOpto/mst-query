import { observer } from "mobx-react";
import { useState } from "react";
import { InvoiceFilterModelType } from "../models/models";

export const InvoiceListFilter = observer(
  ({ filter }: { filter: InvoiceFilterModelType }) => {
    const [filterText, setFilterText] = useState(filter.filter ?? "");
    return (
      <>
        <input
          type="text"
          value={filterText}
          onChange={(ev) => setFilterText(ev.target.value)}
          placeholder={"Filter min amount..."}
        />
        <button type="button" onClick={() => filter.setFilter(filterText)}>
          Search
        </button>
      </>
    );
  }
);

export const InvoiceListFilters = observer(
  ({ selectedFilter }: { selectedFilter: InvoiceFilterModelType }) => {
    return (
      <div className="invoice-list-filters">
        {selectedFilter && (
          <InvoiceListFilter key={selectedFilter.id} filter={selectedFilter} />
        )}
      </div>
    );
  }
);
