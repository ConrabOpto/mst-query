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
} from 'mobx-state-tree';
import { observable, action, makeObservable } from 'mobx';
import { config } from './config';
import { QueryModelType } from './QueryModel';
import { MutationModelType } from './MutationModel';
import { SubscriptionModelType } from './SubscriptionModel';

export const getKey = (type: IAnyComplexType, id: string | number) => {
    return `${type.name}:${id}`;
};

export const models = new Map<string, any>();

export const cache = observable.map({}, { deep: false });

export class QueryCache {
    #scheduledGc = null as null | number;

    constructor() {
        makeObservable(this, {
            setQuery: action,
            removeQuery: action,
            clear: action,
        });
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
        matcherFn: (query: Instance<T>) => boolean = () => true
    ): Instance<T>[] {
        let results = [];
        const arr = cache.get(queryDef.name) ?? [];
        for (let query of arr) {
            if (!isAlive(query)) {
                continue;
            }
            if (getType(query) === queryDef && matcherFn(query)) {
                results.push(query);
            }
        }
        return results;
    }

    setQuery(q: QueryModelType | MutationModelType | SubscriptionModelType) {
        const type = getType(q);
        let arr = cache.get(type.name);
        if (!arr) {
            arr = observable.array([], { deep: false });
            cache.set(type.name, arr);
        }
        arr.push(q);
    }

    removeQuery(query: QueryModelType | MutationModelType | SubscriptionModelType) {
        const type = getType(query);
        cache.get(type.name).remove(query);
        destroy(query);

        this.#runGc();
    }

    clear() {
        for (let [, arr] of cache) {
            for (let query of arr) {
                destroy(query);
            }
        }

        for (let [, obj] of models) {
            config.rootStore.__MstQueryAction('delete', getType(obj), getIdentifier(obj), obj);
        }

        models.clear();
        cache.clear();
    }

    #runGc() {
        if (this.#scheduledGc) {
            return;
        }

        const seenIdentifiers = new Set();
        for (let [_, arr] of cache) {
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

        for (let [key, obj] of models) {
            const identifier = getIdentifier(obj) as string | number;
            if (!seenIdentifiers.has(getKey(getType(obj), identifier))) {
                models.delete(getKey(getType(obj), getIdentifier(obj) as string));
                config.rootStore.__MstQueryAction('delete', getType(obj), key, obj);
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

export default new QueryCache();
