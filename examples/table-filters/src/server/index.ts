import { listData, listMoreData } from './data/acme';
import { baseData } from './data/data';

export const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

let filters = 2;

export const saveInvoiceFilter = async (id: string | undefined, filterStr: string) => {
    const filter = listData.filters.find((filter) => filter.id === id);
    await wait(200);
    if (filter) {
        return {
            ...filter,
            filter: filterStr,
        };
    }
    const newId = ++filters;
    const newFilter = {
        id: `filter-${newId}`,
        name: `Saved filter ${newId}`,
        filter: filterStr,
    };
    listData.filters.push(newFilter);
    listMoreData.filters.push(newFilter);
    return newFilter;
};

export const removeInvoiceFilter = async (id: string) => {
    listData.filters = listData.filters.filter((f) => f.id === id);
    listMoreData.filters = listMoreData.filters.filter((f) => f.id === id);
    await wait(1000);
    return id;
};

export const getInvoice = async (id: string) => {
    const invoice = [...listData.invoices, ...listMoreData.invoices].find(
        (invoice) => invoice.id === id
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
};

export const getInvoiceList = async (offset: number) => {
    await wait(200);
    if (offset >= 70) {
        return {
            ...listMoreData,
            invoices: [],
        };
    }
    if (offset > 0) {
        return listMoreData;
    }
    return listData;
};

export const getCompanies = async () => {
    await wait(50);
    return baseData;
};
