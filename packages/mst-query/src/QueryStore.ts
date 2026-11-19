import {
    Instance,
    IAnyModelType,
    isStateTreeNode,
    isAlive,
    getType,
    isArrayType,
    isMapType,
    getIdentifier,
    IAnyComplexType,
    IAnyStateTreeNode,
    getParent,
    hasParent,
    onSnapshot,
    onPatch,
    addDisposer,
    getRoot,
} from 'mobx-state-tree';
import { observable, action, makeObservable, runInAction, type IObservableArray } from 'mobx';
import { type EntryOf, getQueryMapEntryType } from './QueryCollection';
import type { QueryClient } from './QueryClient';

const entryTypeOf = (type: IAnyComplexType): IAnyComplexType => {
    return getQueryMapEntryType(type as IAnyModelType) ?? type;
};

export const getKey = (type: IAnyComplexType, id: string | number) => {
    return `${type.name}:${id}`;
};

type QueryCacheEntry = {
    cachedAt: number;
    data: any;
    timeout?: ReturnType<typeof setTimeout>;
    roots: Set<string>;
    dispose?: () => void;
};

type QueryNode = Instance<IAnyModelType>;

export class QueryStore {
    #scheduledGc: ReturnType<typeof setTimeout> | undefined;
    #gcInterval: number;
    #collecting = false;
    #rootDisposer?: () => void;
    #disposed = false;
    #queryClient: QueryClient<any>;
    #queryData = new Map<string, QueryCacheEntry>();
    #cache = observable.map<string, IObservableArray<QueryNode>>(undefined, { deep: false });

    models = new Map<string, QueryNode>();

    constructor(queryClient: QueryClient<any>) {
        makeObservable(this, {
            setQuery: action,
            removeQuery: action,
            clear: action,
            dispose: action,
        });

        this.#queryClient = queryClient;
        this.#gcInterval = queryClient.config.gcInterval!;
    }

    /** @internal Start automatic collection once the client's root has been created. */
    observeRoot(root: IAnyStateTreeNode) {
        this.#rootDisposer = onPatch(root, () => this.#requestGc());
        addDisposer(root, () => this.dispose());
        if (this.models.size) this.#requestGc();
    }

    getQueryData(type: IAnyComplexType, key: string) {
        return this.#queryData.get(getKey(entryTypeOf(type), key));
    }

    setQueryData(
        type: IAnyComplexType,
        key: string,
        model: Instance<IAnyModelType>,
        cacheTime: number = 0,
    ) {
        this.removeQueryData(type, key);

        const cacheEntry: QueryCacheEntry = {
            cachedAt: Date.now(),
            data: model.data,
            roots: new Set(),
            timeout:
                cacheTime === Infinity
                    ? undefined
                    : setTimeout(() => {
                          this.removeQueryData(type, key);
                      }, cacheTime),
        };
        const data = cacheEntry.data;
        if (isStateTreeNode(data) && isAlive(data)) {
            const updateRoots = () => {
                if (!isAlive(data)) return;
                const roots = new Set<string>();
                // Stop at managed models: GC follows their current references,
                // rather than pinning obsolete transitive targets in the cache.
                collectSeenIdentifiers(data, roots, new Set(), (node) => {
                    const id = getIdentifier(node);
                    if (id == null) return false;
                    const modelKey = getKey(getType(node), id);
                    if (this.models.get(modelKey) !== node) return false;
                    roots.add(modelKey);
                    return true;
                });
                cacheEntry.roots = roots;
            };
            updateRoots();
            cacheEntry.dispose = onSnapshot(data, updateRoots);
        }
        this.#queryData.set(getKey(type, key), cacheEntry);
    }

    removeQueryData(type: IAnyComplexType, key: string) {
        const cacheKey = getKey(entryTypeOf(type), key);
        const entry = this.#queryData.get(cacheKey);
        if (entry) {
            if (entry.timeout !== undefined) clearTimeout(entry.timeout);
            entry.dispose?.();
            this.#queryData.delete(cacheKey);
            this.#requestGc();
        }
    }

    getQueries<T extends IAnyModelType>(
        queryDef: T,
        matcherFn: (query: EntryOf<Instance<T>>) => boolean = () => true,
    ): EntryOf<Instance<T>>[] {
        const results: EntryOf<Instance<T>>[] = [];
        const entryType = entryTypeOf(queryDef);
        for (const query of this.#cache.get(entryType.name) ?? []) {
            if (getType(query) === entryType && matcherFn(query)) {
                results.push(query);
            }
        }
        return results;
    }

    getAllQueries(): QueryNode[] {
        return [...this.#cache.values()].flat();
    }

    hasPendingMutations(node: IAnyStateTreeNode) {
        for (const queries of this.#cache.values()) {
            for (const query of queries) {
                if (!query.isMutation || !query.isPending) {
                    continue;
                }

                let currentNode: IAnyStateTreeNode = query;
                while (true) {
                    if (currentNode === node) {
                        return true;
                    }
                    if (!hasParent(currentNode)) {
                        break;
                    }
                    currentNode = getParent(currentNode);
                }
            }
        }

        return false;
    }

    get isMutating() {
        for (const queries of this.#cache.values()) {
            if (queries.some((query) => query.isMutation && query.isPending)) {
                return true;
            }
        }
        return false;
    }

    setQuery(query: QueryNode) {
        const type = getType(query);
        let arr = this.#cache.get(type.name);
        if (!arr) {
            arr = observable.array<QueryNode>([], { deep: false });
            this.#cache.set(type.name, arr);
        }
        arr.push(query);
    }

    removeQuery(query: QueryNode) {
        const type = getType(query);
        this.#cache.get(type.name)?.remove(query);
        this.#requestGc();
    }

    clear() {
        this.#cancelGc();
        this.#clearQueryData();
        this.#collecting = true;
        try {
            for (const obj of this.models.values()) {
                this.#queryClient.rootStore.__MstQueryAction(
                    'delete',
                    getType(obj),
                    getIdentifier(obj),
                    obj,
                );
            }
            this.models.clear();
            this.#cache.clear();
        } finally {
            this.#collecting = false;
        }
    }

    dispose() {
        if (this.#disposed) return;
        this.#disposed = true;
        this.#rootDisposer?.();
        this.#rootDisposer = undefined;
        this.#cancelGc();
        this.#clearQueryData();
    }

    #cancelGc() {
        if (this.#scheduledGc !== undefined) clearTimeout(this.#scheduledGc);
        this.#scheduledGc = undefined;
    }

    #clearQueryData() {
        for (const entry of this.#queryData.values()) {
            if (entry.timeout !== undefined) clearTimeout(entry.timeout);
            entry.dispose?.();
        }
        this.#queryData.clear();
    }

    #hasLoadingQueries() {
        for (const queries of this.#cache.values()) {
            if (
                queries.some(
                    (query) =>
                        isAlive(query) &&
                        getRoot(query) === this.#queryClient.rootStore &&
                        (query.__MstQueryHandler.isLoading || query.isFetchingMore),
                )
            )
                return true;
        }
        return false;
    }

    #requestGc() {
        if (!this.#collecting) this.#scheduleGc(this.#gcInterval);
    }

    #scheduleGc(delay: number) {
        if (this.#disposed || this.#gcInterval === Infinity || this.#scheduledGc !== undefined)
            return;
        // The first change fixes the deadline; later changes join the same batch.
        this.#scheduledGc = setTimeout(() => {
            this.#scheduledGc = undefined;
            runInAction(() => this.#runGc());
        }, delay);
    }

    #runGc() {
        if (this.#disposed || !this.models.size) return;
        if (this.#hasLoadingQueries()) {
            this.#scheduleGc(1000);
            return;
        }
        this.#collecting = true;
        try {
            const seenIdentifiers = new Set<string>();
            const visited = new Set<IAnyStateTreeNode>();
            const rootStore = this.#queryClient.rootStore;
            const modelStores = rootStore.__getModelStores();
            // Read the live registry: walking a service can initialize a lazy store.
            const skipModelStore = (node: IAnyStateTreeNode) => {
                for (const store of modelStores.values()) {
                    if (isAlive(store) && store.models === node) return true;
                }
                return false;
            };
            const mark = (node: unknown) =>
                collectSeenIdentifiers(node, seenIdentifiers, visited, skipModelStore);
            mark(rootStore);
            for (const entry of this.#queryData.values()) {
                if (isStateTreeNode(entry.data) && !isAlive(entry.data)) {
                    for (const key of entry.roots) mark(this.models.get(key));
                } else {
                    mark(entry.data);
                }
            }
            // Root traversal can instantiate queries with afterCreate behavior.
            if (this.#hasLoadingQueries()) {
                this.#scheduleGc(1000);
                return;
            }

            for (const [key, obj] of [...this.models]) {
                if (this.models.get(key) !== obj) continue;
                if (!isAlive(obj)) {
                    this.models.delete(key);
                    continue;
                }
                const identifier = getIdentifier(obj) as string | number;
                if (!seenIdentifiers.has(getKey(getType(obj), identifier))) {
                    this.models.delete(key);
                    rootStore.__MstQueryAction('delete', getType(obj), identifier, obj);
                }
            }
        } finally {
            this.#collecting = false;
        }
    }
}

export function collectSeenIdentifiers(
    node: unknown,
    seenIdentifiers: Set<string>,
    visited = new Set<IAnyStateTreeNode>(),
    skip?: (node: IAnyStateTreeNode) => boolean,
) {
    const pending: unknown[] = [node];
    while (pending.length) {
        const current = pending.pop();
        if (
            !isStateTreeNode(current) ||
            !isAlive(current) ||
            visited.has(current) ||
            skip?.(current)
        ) {
            continue;
        }
        visited.add(current);
        const n = current as any;
        const type = getType(current);
        if (isArrayType(type) || isMapType(type)) {
            n.forEach((child: unknown) => pending.push(child));
            continue;
        }
        const identifier = getIdentifier(current);
        if (identifier != null) seenIdentifiers.add(getKey(type, identifier));
        for (const key in (type as IAnyModelType).properties) pending.push(n[key]);
    }
}
