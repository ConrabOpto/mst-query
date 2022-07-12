import {
    destroy,
    Instance,
    IAnyModelType,
    isStateTreeNode,
    isAlive,
    getType,
    isArrayType,
    getIdentifier,
    IAnyComplexType,
    getRoot,
    unprotect,
    protect
} from 'mobx-state-tree';
import { observable, action, makeObservable} from 'mobx';
import { QueryClient } from './QueryClient';
import { AnyQueryType } from './utilityTypes';

export const getKey = (type: IAnyComplexType, id: string | number) => {
    return `${type.name}:${id}`;
};

export class QueryStore {
    #scheduledGc = null as null | number;
    #queryClient: QueryClient<any>;
    #cache = observable.map({}, { deep: false });

    models = new Map() as Map<string, any>;

    constructor(queryClient: QueryClient<any>) {
        makeObservable(this, {
            setQuery: action,
            removeQuery: action,
            clear: action,
        });

        this.#queryClient = queryClient;
    }

    find<T extends IAnyModelType>(
        queryDef: T,
        matcherFn?: (query: Instance<T>) => boolean
    ): Instance<T> | undefined {
        const matches = this.findAll(queryDef, matcherFn);
        return matches[0];
    }

    findAll<T extends IAnyModelType>(
        queryDef: T,
        matcherFn: (query: Instance<T>) => boolean = () => true,
        includeDisposed = false
    ): Instance<T>[] {
        let results = [];
        const arr = this.#cache.get(queryDef.name) ?? [];
        for (let query of arr) {
            if (!includeDisposed && !isAlive(query)) {
                continue;
            }
            if (getType(query) === queryDef && matcherFn(query)) {
                results.push(query);
            }
        }
        return results;
    }

    setQuery(q: Instance<AnyQueryType>) {
        const type = getType(q);
        let arr = this.#cache.get(type.name);
        if (!arr) {
            arr = observable.array([], { deep: false });
            this.#cache.set(type.name, arr);
        }
        arr.push(q);
    }

    removeQuery(query: Instance<AnyQueryType>) {
        const type = getType(query);
        this.#cache.get(type.name)?.remove(query);
        
        const root = getRoot(query);
        root && unprotect(root);
        destroy(query);
        root && protect(root);

        this.#runGc();
    }

    clear() {
        for (let [, arr] of this.#cache) {
            for (let query of arr) {
                destroy(query);
            }
        }

        for (let [, obj] of this.models) {
            this.#queryClient.rootStore.__MstQueryAction(
                'delete',
                getType(obj),
                getIdentifier(obj),
                obj
            );
        }

        this.models.clear();
        this.#cache.clear();
    }

    #runGc() {
        if (this.#scheduledGc) {
            return;
        }

        const seenIdentifiers = new Set();
        for (let [_, arr] of this.#cache) {
            for (let query of arr) {
                if (query.isLoading) {
                    this.#scheduledGc = window.setTimeout(() => {
                        this.#scheduledGc = null;
                        this.#runGc();
                    }, 1000);

                    return;
                }

                collectSeenIdentifiers(query.data, seenIdentifiers);
                collectSeenIdentifiers(query.request, seenIdentifiers);
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
