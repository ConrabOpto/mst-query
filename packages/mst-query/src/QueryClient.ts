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
import { QueryStore } from './QueryStore';
import type {
    InfiniteQueryReturnType,
    MutationScope,
    QueryReturnType,
} from './create';

export type DehydratedQuery = {
    path: string;
    type: string;
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

type PrefetchOptions<T extends Instance<QueryReturnType> | Instance<InfiniteQueryReturnType>> = {
    request?: SnapshotIn<T['variables']['request']>;
    pagination?: any;
    meta?: { [key: string]: any };
};

const noop = () => {};

// Requestless queries use a symbol sentinel, which can't be serialized
const serializable = (value: unknown) => (typeof value === 'symbol' ? undefined : value);

export type EndpointType = (
    options: {
        request?: any;
        pagination?: any;
        meta: { [key: string]: any };
        signal: AbortSignal;
        setData: (data: any) => any;
        query: any
    },
) => Promise<any>;

type QueryClientConfig<T extends IAnyModelType> = {
    env?: any;
    queryOptions?: {
        staleTime?: number;
        endpoint?: EndpointType;
    };
    RootStore: T;
};

const defaultConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        cacheTime: 0,
        refetchOnMount: 'if-stale',
        refetchOnChanged: 'all',
    },
};

export class QueryClient<T extends IAnyModelType> {
    config: QueryClientConfig<T>;
    rootStore!: Instance<T>;
    queryStore!: QueryStore;
    #initialized = false;
    #initialData = {} as any;
    #mutationScopes = new Map<string, Promise<any>>();

    constructor(config: QueryClientConfig<T>) {
        this.config = {
            ...defaultConfig,
            ...config,
            queryOptions: {
                ...defaultConfig.queryOptions,
                ...config.queryOptions,
            },
        };
    }

    init(initialData: any = {}, env = {}) {
        if (this.#initialized) {
            return this;
        }

        this.config.env = env;
        this.config.env.queryClient = this;
        this.queryStore = new QueryStore(this);

        this.rootStore = this.config.RootStore.create(initialData, this.config.env);        

        this.#initialized = true;

        return this;
    }

    reset() {
        destroy(this.rootStore);
        this.queryStore = new QueryStore(this);
        this.rootStore = this.config.RootStore.create(this.#initialData, this.config.env);
    }

    hasPendingMutations(node: IAnyStateTreeNode) {
        return this.queryStore.hasPendingMutations(node);
    }

    // Never rejects; await it to block on the data, or leave it pending to stream it
    prefetchQuery<T extends Instance<QueryReturnType> | Instance<InfiniteQueryReturnType>>(
        query: T,
        options: PrefetchOptions<T> = {},
    ): Promise<void> {
        return query.__MstQueryHandler.prefetch(options).then(noop, noop);
    }

    dehydrate(): DehydratedState {
        const queries: DehydratedQuery[] = [];
        for (const query of this.queryStore.getAllQueries()) {
            const response = query.__MstQueryHandler.prefetchedResponse;
            if (!response || response.status === 'error' || getRoot(query) !== this.rootStore) {
                continue;
            }
            const variables = getSnapshot<any>(query.variables);
            const entry: DehydratedQuery = {
                path: getPath(query),
                type: getType(query).name,
                request: serializable(variables.request),
                pagination: serializable(variables.pagination),
            };
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
            const query: any = tryResolve(this.rootStore, entry.path);
            const handler = query?.__MstQueryHandler;
            if (!handler || getType(query).name !== entry.type || handler.isLoading) {
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

    getMutationScopes() {
        return this.#mutationScopes;
    }
}
