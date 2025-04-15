import {
    Instance,
    IAnyModelType,
    isStateTreeNode,
    isAlive,
    getType,
    isArrayType,
    getIdentifier,
    IAnyComplexType,
} from 'mobx-state-tree';
import { observable, action, makeObservable } from 'mobx';

export const getKey = (type: IAnyComplexType, id: string | number) => {
    return `${type.name}:${id}`;
};

type QueryCacheEntry = {
    cachedAt: number;
    data: any;
    timeout: number;
};

export class QueryStore {
    #scheduledGc = null as null | number;
    #queryClient: any;
    #queryData = new Map() as Map<string, QueryCacheEntry>;
    #cache = new Map() as Map<string, any>;

    models = new Map() as Map<string, any>;

    constructor(queryClient: any) {
        makeObservable(this, {
            setQuery: action,
            removeQuery: action,
            clear: action,
        });

        this.#queryClient = queryClient;
    }

    getQueryData(type: IAnyComplexType, key: string) {
        return this.#queryData.get(getKey(type, key));
    }

    setQueryData(
        type: IAnyComplexType,
        key: string,
        model: Instance<IAnyModelType>,
        cacheTime: number = 0,
    ) {
        const existingEntry = this.#queryData.get(getKey(type, key));
        if (existingEntry) {
            window.clearTimeout(existingEntry.timeout);
        }

        const cacheEntry = {
            cachedAt: Date.now(),
            data: model.data,
            timeout: window.setTimeout(() => {
                this.removeQueryData(type, key);
            }, cacheTime),
        };
        this.#queryData.set(getKey(type, key), cacheEntry);
    }

    removeQueryData(type: IAnyComplexType, key: string) {
        this.#queryData.delete(getKey(type, key));
    }

    getQueries<T extends IAnyModelType>(
        queryDef: T,
        matcherFn: (query: Instance<T>) => boolean = () => true,
    ): Instance<T>[] {
        let results = [];
        const arr = this.#cache.get(queryDef.name) ?? [];
        for (let query of arr) {
            if (getType(query) === queryDef && matcherFn(query)) {
                results.push(query);
            }
        }
        return results;
    }

    setQuery(q: any) {
        const type = getType(q);
        let arr = this.#cache.get(type.name);
        if (!arr) {
            arr = observable.array([], { deep: false });
            this.#cache.set(type.name, arr);
        }
        arr.push(q);
    }

    removeQuery(query: any) {
        const type = getType(query);
        this.#cache.get(type.name)?.remove(query);
    }

    clear() {
        for (let [, obj] of this.models) {
            this.#queryClient.rootStore.__MstQueryAction(
                'delete',
                getType(obj),
                getIdentifier(obj),
                obj,
            );
        }

        this.models.clear();
        this.#cache.clear();
    }

    runGc() {
        if (this.#scheduledGc) {
            return;
        }

        const seenIdentifiers = new Set();
        for (let [_, arr] of this.#cache) {
            for (let query of arr) {
                if (query.isLoading) {
                    this.#scheduledGc = window.setTimeout(() => {
                        this.#scheduledGc = null;
                        this.runGc();
                    }, 1000);

                    return;
                }

                collectSeenIdentifiers(query.data, seenIdentifiers);
                collectSeenIdentifiers(query.request, seenIdentifiers);

                for (let [_, queryData] of this.#queryData) {
                    collectSeenIdentifiers(queryData.data, seenIdentifiers);
                }
            }
        }

        for (let [key, obj] of this.models) {
            const identifier = getIdentifier(obj) as string | number;
            if (!seenIdentifiers.has(getKey(getType(obj), identifier))) {
                this.models.delete(getKey(getType(obj), getIdentifier(obj) as string));
                this.#queryClient.rootStore.__MstQueryAction('delete', getType(obj), key, obj);
            }
        }
    }
}

export function collectSeenIdentifiers(node: any, seenIdentifiers: any) {
    if (!isStateTreeNode(node)) {
        return;
    }
    if (!isAlive(node)) {
        return;
    }
    if (!node || node instanceof Date || typeof node !== 'object') {
        return;
    }
    const n = node as any;
    const t = getType(node) as any;
    if (isArrayType(t)) {
        n.forEach((n: any) => collectSeenIdentifiers(n, seenIdentifiers));
        return;
    }

    const nodeIdentifier = getIdentifier(n);
    if (nodeIdentifier) {
        const identifier = getKey(t, nodeIdentifier);

        if (seenIdentifiers.has(identifier)) {
            return;
        } else {
            seenIdentifiers.add(identifier);
        }
    }

    for (const key in t.properties) {
        collectSeenIdentifiers(n[key], seenIdentifiers);
    }
}
