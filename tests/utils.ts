import { IAnyModelType, Instance } from 'mobx-state-tree';
import { create, queryCache } from '../src';

export const createAndCache = <T extends IAnyModelType>(
    query: T,
    options: any
): Instance<T> & { run: unknown } => {
    const q = create(query, options);
    queryCache.setQuery(q);
    return q;
};

export const wait = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
