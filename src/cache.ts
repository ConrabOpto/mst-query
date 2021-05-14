import {
    destroy,
    Instance,
    IAnyModelType,
    isStateTreeNode,
    isAlive,
    getType,
    isArrayType,
    isIdentifierType,
} from 'mobx-state-tree';
import { objMap } from './MstQueryRef';
import { observable, action } from 'mobx';
import { QueryModelType } from './QueryModel';
import { MutationModelType } from './MutationModel';
import { QueryStatus, QueryType } from './UtilityTypes';
import { SubscriptionModelType } from './SubscriptionModel';
import { config } from './config';

let cache = observable.map({}, { deep: false });

export class QueryCache {
    _scheduledGc = null as null | number;

    find<P extends IAnyModelType>(
        queryDef: P,
        matcherFn: (query: Instance<P>) => boolean
    ): Instance<P> | undefined {
        const matches = this.findAll(queryDef, matcherFn);
        return matches?.[0];
    }

    findAll<P extends IAnyModelType>(
        queryDef: P,
        matcherFn: (query: Instance<P>) => boolean,
        includeStale = false
    ): Instance<P>[] {
        let results = [];
        for (let [_, arr] of cache) {
            for (let query of arr) {
                if (!includeStale && query._status === QueryStatus.Stale) {
                    continue;
                }
                if (getType(query) === queryDef && matcherFn(query)) {
                    results.push(query);
                }
            }
        }

        return results;
    }

    @action
    setQuery<T extends QueryType>(q: Instance<T>) {
        const type = getType(q);
        let arr = cache.get(type.name);
        if (!arr) {
            arr = observable.array([], { deep: false });
            cache.set(type.name, arr);
        }
        arr.push(q);
    }

    @action
    removeQuery(query: QueryModelType | MutationModelType | SubscriptionModelType) {
        const type = getType(query);
        cache.get(type.name).remove(query);
        destroy(query);

        this._runGc();
    }

    _runGc() {
        if (this._scheduledGc) {
            return;
        }

        const seenIdentifiers = new Set();
        for (let [_, arr] of cache) {
            for (let query of arr) {
                if (query.isLoading) {
                    this._scheduledGc = window.setTimeout(() => {
                        this._scheduledGc = null;
                        this._runGc();
                    }, 1000);

                    return;
                }

                collectSeenIdentifiers(query.data, seenIdentifiers);
                collectSeenIdentifiers(query.request, seenIdentifiers);
            }
        }

        for (let [key, obj] of objMap) {
            if (!seenIdentifiers.has(key)) {
                destroy(obj);
                objMap.delete(key);
            }
        }
    }

    @action
    clear() {
        for (let [, arr] of cache) {
            for (let query of arr) {
                destroy(query);
            }
        }

        for (let [, obj] of objMap) {
            destroy(obj);
        }

        objMap.clear();
        cache.clear();
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

    if (isIdentifierType(t.properties.id)) {
        const identifier = `${t.name}:${config.getId(n)}`;

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
