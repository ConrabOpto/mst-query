import {
    destroy,
    getPath,
    getRoot,
    getSnapshot,
    getType,
    IAnyModelType,
    IAnyStateTreeNode,
    Instance,
    SnapshotIn,
    tryResolve,
} from 'mobx-state-tree';
import { action, computed, makeObservable, observableRef } from 'mobx';
import { QueryStore } from './QueryStore';
import type {
    InfiniteQueryMapReturnType,
    InfiniteQueryReturnType,
    MutationScope,
    QueryMapReturnType,
    QueryReturnType,
} from './create';
import type { EntryOf } from './QueryCollection';
import { validateCacheTime } from './requestKey';

export type DehydratedQuery = {
    path: string;
    type: string;
    /** Set for query map entries; `path` then points to the map. */
    key?: string;
    request?: unknown;
    pagination?: unknown;
    cachedAt?: number;
    result?: unknown;
    promise?: PromiseLike<unknown>;
};

export type DehydratedState = {
    dehydratedAt: number;
    queries: DehydratedQuery[];
};

type Prefetchable =
    | Instance<QueryReturnType>
    | Instance<InfiniteQueryReturnType>
    | Instance<QueryMapReturnType>
    | Instance<InfiniteQueryMapReturnType>;

type PrefetchOptions<T extends Prefetchable> = {
    request?: SnapshotIn<EntryOf<T>['variables']['request']>;
    /** Selects a query map entry; ignored by singleton queries. */
    scope?: string;
    pagination?: any;
    meta?: { [key: string]: any };
};

const noop = () => {};

// Requestless queries use a symbol sentinel, which can't be serialized
const serializable = (value: unknown) => (typeof value === 'symbol' ? undefined : value);

export type RefetchOnWindowFocus<TQuery> =
    boolean | 'always' | ((query: TQuery) => boolean | 'always');

/** Retry a failed request: `true` forever, a number of times, or while the callback returns true. */
export type Retry = boolean | number | ((failureCount: number, error: any) => boolean);
/** Milliseconds before a retry, or a callback of the number of failures so far. */
export type RetryDelay = number | ((failureCount: number, error: any) => number);

export type RetryOptions = {
    retry?: Retry;
    retryDelay?: RetryDelay;
};

export type EndpointType = (options: {
    request?: any;
    pagination?: any;
    meta: { [key: string]: any };
    signal: AbortSignal;
    setData: (data: any) => any;
    query: any;
}) => Promise<any>;

type QueryClientConfig<T extends IAnyModelType> = {
    env?: any;
    /** Minimum delay between automatic GC batches, in milliseconds. Infinity disables GC. */
    gcInterval?: number;
    queryOptions?: {
        staleTime?: number;
        /** Singleton response caching (default 0), or unused map entry retention (default five minutes). */
        cacheTime?: number;
        endpoint?: EndpointType;
        refetchOnWindowFocus?: RefetchOnWindowFocus<
            EntryOf<Instance<QueryReturnType | InfiniteQueryReturnType>>
        >;
        throwOnError?: boolean | ((error: any, query: any) => boolean);
    } & RetryOptions;
    /** Mutations don't retry by default. */
    mutationOptions?: RetryOptions;
    RootStore: T;
};

const defaultConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        cacheTime: 0,
        refetchOnMount: 'if-stale',
        refetchOnChanged: 'all',
        refetchOnWindowFocus: true,
    },
};

export class QueryClient<T extends IAnyModelType> {
    config: QueryClientConfig<T>;
    rootStore!: Instance<T>;
    queryStore!: QueryStore;
    /** @internal Default retention for map entries; singleton response caches default to zero. */
    readonly queryMapCacheTime: number;
    #initialized = false;
    #mutationScopes = new Map<string, Promise<any>>();

    constructor(config: QueryClientConfig<T>) {
        this.queryMapCacheTime =
            config.queryOptions?.cacheTime ??
            (typeof window === 'undefined' ? Infinity : 5 * 60_000);
        this.config = {
            ...defaultConfig,
            ...config,
            gcInterval:
                config.gcInterval ?? (typeof window === 'undefined' ? Infinity : 5 * 60_000),
            queryOptions: {
                ...defaultConfig.queryOptions,
                ...config.queryOptions,
            },
        };
        const interval = this.config.gcInterval!;
        validateCacheTime(this.config.queryOptions?.cacheTime ?? Infinity);
        if (
            interval !== Infinity &&
            (!Number.isFinite(interval) || interval < 0 || interval > 2 ** 31 - 1)
        ) {
            throw new RangeError(
                'gcInterval must be between 0 and 2147483647 milliseconds, or Infinity.',
            );
        }
        makeObservable(this, {
            queryStore: observableRef,
            isMutating: computed,
            init: action,
            reset: action,
        });
    }

    get isMutating() {
        return this.queryStore?.isMutating ?? false;
    }

    init(initialData?: SnapshotIn<T>, env: Record<string, any> = {}) {
        if (this.#initialized) {
            return this;
        }

        this.config.env = env;
        this.config.env.queryClient = this;
        this.queryStore = new QueryStore(this);

        this.rootStore = this.config.RootStore.create(initialData, this.config.env);
        this.queryStore.observeRoot(this.rootStore);

        this.#initialized = true;

        return this;
    }

    reset() {
        this.queryStore.dispose();
        destroy(this.rootStore);
        this.queryStore = new QueryStore(this);
        this.rootStore = this.config.RootStore.create({}, this.config.env);
        this.queryStore.observeRoot(this.rootStore);
    }

    hasPendingMutations(node: IAnyStateTreeNode) {
        return this.queryStore.hasPendingMutations(node);
    }

    // Never rejects; await it to block on the data, or leave it pending to stream it
    prefetchQuery<T extends Prefetchable>(
        query: T,
        options: PrefetchOptions<T> = {},
    ): Promise<void> {
        if ((query as any).isQueryCollection) {
            const entry = (query as any).getOrCreate(options);
            return entry.__MstQueryHandler
                .prefetch({ ...options, request: entry.variables.request })
                .then(noop, noop);
        }
        return (query as any).__MstQueryHandler.prefetch(options).then(noop, noop);
    }

    dehydrate(): DehydratedState {
        const queries: DehydratedQuery[] = [];
        for (const query of this.queryStore.getAllQueries()) {
            const handler = query.__MstQueryHandler;
            const response = handler.prefetchedResponse;
            if (!response || response.status === 'error' || getRoot(query) !== this.rootStore) {
                continue;
            }
            const variables = getSnapshot<any>(query.variables);
            const entry: DehydratedQuery = {
                path: getPath(handler.collection ?? query),
                type: getType(query).name,
                request: serializable(variables.request),
                pagination: serializable(variables.pagination),
            };
            if (handler.collection) {
                entry.key = handler.collectionKey;
            }
            if (response.status === 'success') {
                entry.result = response.result;
                entry.cachedAt = response.cachedAt;
            } else {
                entry.promise = response.promise;
            }
            queries.push(entry);
        }
        return { dehydratedAt: Date.now(), queries };
    }

    // Returns the entries skipped because of deferObserved
    hydrate(state: DehydratedState, options: { deferObserved?: boolean } = {}) {
        const deferred: DehydratedQuery[] = [];
        for (const entry of state.queries) {
            const query: any =
                entry.key === undefined
                    ? tryResolve(this.rootStore, entry.path)
                    : this.#resolveMapEntry(entry);
            const handler = query?.__MstQueryHandler;
            if (!handler || getType(query).name !== entry.type) {
                console.warn(
                    `mst-query: no ${entry.type} at ${entry.path} to hydrate. ` +
                        'Is the state rendered with the HydrationBoundary of the client that dehydrated it?',
                );
                continue;
            }
            if (handler.isLoading) {
                continue;
            }

            const cachedAt = handler.cachedAt?.getTime();
            const updatedAt = entry.promise ? state.dehydratedAt : entry.cachedAt;
            if (cachedAt !== undefined && updatedAt !== undefined && cachedAt >= updatedAt) {
                continue;
            }

            if (options.deferObserved && handler.queryObservers.length > 0) {
                deferred.push(entry);
                continue;
            }

            const variables = { request: entry.request, pagination: entry.pagination };
            if (entry.promise) {
                handler.adopt(entry.promise, variables);
            } else {
                handler.hydrate(entry.result, { ...variables, enabled: true });
                if (entry.cachedAt !== undefined) {
                    handler.cachedAt = new Date(entry.cachedAt);
                }
            }
        }
        return deferred;
    }

    // Map entries are created on demand, so the client may not have this entry yet
    #resolveMapEntry(entry: DehydratedQuery) {
        const collection: any = tryResolve(this.rootStore, entry.path);
        if (!collection?.isQueryCollection || collection.__entryType.name !== entry.type) {
            return undefined;
        }
        const scope = JSON.parse(entry.key!).scope ?? undefined;
        if (collection.__getKey(entry.request, scope) !== entry.key) {
            return undefined;
        }
        return collection.getOrCreate({ request: entry.request, scope, pagination: entry.pagination });
    }

    getMutationScopes() {
        return this.#mutationScopes;
    }
}
