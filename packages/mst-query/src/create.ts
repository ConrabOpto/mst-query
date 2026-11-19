import { types, IAnyType, flow, SnapshotIn, Instance } from 'mobx-state-tree';
import { type CacheOptions, MstQueryHandler, type OptimisticRevertMode } from './MstQueryHandler';
import { createQueryCollection } from './QueryCollection';
import type { RetryOptions } from './QueryClient';

type TypeOrFrozen<T> = T extends IAnyType ? T : ReturnType<typeof types.frozen>;

type CreateBaseOptions<TData extends IAnyType> = {
    data?: TData;
};

type CreateOptions<TData extends IAnyType, TRequest extends IAnyType> = CreateBaseOptions<TData> & {
    request?: TRequest;
};

type CollectionDefinitionOptions<TRequest extends IAnyType> = {
    requestKey?: (request: SnapshotIn<TRequest>) => unknown;
    cacheTime?: number;
};

type CreateMutationOptions<TData extends IAnyType, TRequest extends IAnyType> = CreateOptions<
    TData,
    TRequest
> & {
    endpoint?: (
        options: {
            request: Instance<TRequest>;
            meta: { [key: string]: any };
            setData: (data: any) => any;
        },
        mutation: Instance<ReturnType<typeof createMutation<TData, TRequest>>>,
    ) => Promise<any>;
    scope?: MutationScope;
};

export type MutationScope = {
    id: string;
};

type CreateQueryOptions<TData extends IAnyType, TRequest extends IAnyType> = CreateOptions<
    TData,
    TRequest
> & {
    endpoint?: (
        options: {
            request: Instance<TRequest>;
            meta: { [key: string]: any };
            signal: AbortSignal;
            setData: (data: any) => any;
            query: Instance<ReturnType<typeof createQueryEntry<TData, TRequest>>>;
        },
        query: Instance<ReturnType<typeof createQueryEntry<TData, TRequest>>>,
    ) => Promise<any>;
};

type CreateInfiniteQueryOptions<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType,
> = CreateOptions<TData, TRequest> & {
    pagination?: TPagination;
    endpoint?: (options: {
        request: Instance<TRequest>;
        pagination: Instance<TPagination>;
        meta: { [key: string]: any };
        signal: AbortSignal;
        setData: (data: any) => any;
        query: Instance<ReturnType<typeof createInfiniteQueryEntry<TData, TRequest, TPagination>>>;
    }) => Promise<any>;
    onQueryMore?: (options: {
        data: Instance<TData>;
        request: Instance<TRequest>;
        pagination: Instance<TPagination>;
        query: Instance<ReturnType<typeof createInfiniteQueryEntry<TData, TRequest, TPagination>>>;
    }) => void;
};

type QueryOptions<TRequest, TPagination> = {
    meta?: { [key: string]: any };
    request?: TRequest;
    pagination?: TPagination;
};

type ReturnData<TData, TResult> = {
    data: TData;
    error: any;
    result: TResult;
};

type QueryReturn<TData = any, TRequest = any, TPagination = any> = <TResult = any>(
    options?: QueryOptions<TRequest, TPagination>,
) => Promise<ReturnData<Instance<TData>, TResult>>;

// Status flags shared by query and infinite query nodes
function queryViews(handler: MstQueryHandler) {
    return {
        get status() {
            return handler.status;
        },
        get fetchStatus(): 'fetching' | 'paused' | 'idle' {
            if (!handler.isLoading) return 'idle';
            return handler.isPaused ? 'paused' : 'fetching';
        },
        /** True while any request runs, including background refetches. */
        get isFetching() {
            return handler.isLoading && !handler.isPaused;
        },
        /** True while a retry waits for the tab to become visible again. */
        get isPaused() {
            return handler.isPaused;
        },
        /** True until the query has data or an error. */
        get isPending() {
            return handler.status === 'pending';
        },
        /** True while the first request for data runs. */
        get isLoading() {
            return handler.status === 'pending' && handler.isLoading && !handler.isPaused;
        },
        /** True while a request runs for a query that already has data or an error. */
        get isRefetching() {
            return (
                handler.isLoading &&
                !handler.isPaused &&
                handler.status !== 'pending' &&
                !handler.isFetchingMore
            );
        },
        get isSuccess() {
            return handler.status === 'success';
        },
        get isError() {
            return handler.status === 'error';
        },
        get error() {
            return handler.error;
        },
        get isFetched() {
            return handler.isFetched;
        },
        get failureCount() {
            return handler.failureCount;
        },
        get failureReason() {
            return handler.failureReason;
        },
        get cachedAt() {
            return handler.cachedAt;
        },
    };
}

type HandlerNode = { __MstQueryHandler: MstQueryHandler; meta: { [key: string]: any } };

// Actions shared by query, infinite query and mutation nodes
function baseActions(self: HandlerNode) {
    return {
        __MstQueryHandlerAction(action: () => any) {
            return action();
        },
        setMeta(key: string, value: any) {
            self.meta[key] = value;
        },
        abort: self.__MstQueryHandler.abort,
    };
}

function queryActions(self: HandlerNode) {
    return {
        ...baseActions(self),
        invalidate() {
            self.__MstQueryHandler.invalidate();
        },
        setData(data: any, options?: CacheOptions) {
            return self.__MstQueryHandler.setData(data, options);
        },
    };
}

// Map entries share one execution per request, singletons apply their response directly
function queryFlow(
    self: HandlerNode,
    method: 'query' | 'refetch' | 'queryMore',
    isMapEntry: boolean,
) {
    return flow(function* (options: any) {
        const handler = self.__MstQueryHandler;
        if (isMapEntry) return yield handler.executeQuery(method, options);
        const next = yield handler[method](options);
        return next();
    });
}

export function createQuery<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateQueryOptions<TData, TRequest>,
) {
    return createQueryEntry<TData, TRequest>(name, options);
}

export function createQueryMap<
    TData extends IAnyType = ReturnType<typeof types.frozen>,
    TRequest extends IAnyType = ReturnType<typeof types.frozen>,
>(
    name: string,
    options: CreateQueryOptions<TData, TRequest> & CollectionDefinitionOptions<TRequest>,
) {
    const request = (options.request ?? types.frozen()) as TRequest;
    return createQueryCollection(
        name,
        createQueryEntry<TData, TRequest>(`${name}Entry`, options, true),
        request,
        options,
    );
}

export function createInfiniteQuery<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType = any,
>(name: string, options: CreateInfiniteQueryOptions<TData, TRequest, TPagination>) {
    return createInfiniteQueryEntry<TData, TRequest, TPagination>(name, options);
}

export function createInfiniteQueryMap<
    TData extends IAnyType = ReturnType<typeof types.frozen>,
    TRequest extends IAnyType = ReturnType<typeof types.frozen>,
    TPagination extends IAnyType = ReturnType<typeof types.frozen>,
>(
    name: string,
    options: CreateInfiniteQueryOptions<TData, TRequest, TPagination> &
        CollectionDefinitionOptions<TRequest>,
) {
    const request = (options.request ?? types.frozen()) as TRequest;
    return createQueryCollection(
        name,
        createInfiniteQueryEntry<TData, TRequest, TPagination>(`${name}Entry`, options, true),
        request,
        { ...options, infinite: true },
        options.pagination,
    );
}

function createQueryEntry<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateQueryOptions<TData, TRequest>,
    isMapEntry = false,
) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        endpoint,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            variables: types.optional(
                types.model({
                    request: types.maybe(request),
                }),
                { request: undefined },
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, { endpoint, isMapEntry }),
            meta: {} as { [key: string]: any },
            isQuery: true,
            isInfinite: false,
            isMutation: false,
        }))
        .views((self) => queryViews(self.__MstQueryHandler))
        .actions((self) => {
            type Run = QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>
            >;
            return {
                ...queryActions(self),
                query: queryFlow(self, 'query', isMapEntry) as Run,
                refetch: queryFlow(self, 'refetch', isMapEntry) as Run,
            };
        });
}

function createInfiniteQueryEntry<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType = any,
>(
    name: string,
    options: CreateInfiniteQueryOptions<TData, TRequest, TPagination>,
    isMapEntry = false,
) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        pagination = types.frozen() as TypeOrFrozen<TPagination>,
        endpoint,
        onQueryMore,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            variables: types.optional(
                types.model({
                    request: types.maybe(request),
                    pagination: types.maybe(pagination),
                }),
                { request: undefined, pagination: undefined },
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, { endpoint, onQueryMore, isMapEntry }),
            meta: {} as { [key: string]: any },
            isQuery: true,
            isInfinite: true,
            isMutation: false,
        }))
        .views((self) => queryViews(self.__MstQueryHandler))
        .views((self) => ({
            get isFetchingMore() {
                return self.__MstQueryHandler.isFetchingMore;
            },
        }))
        .actions((self) => {
            type Run = QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>,
                SnapshotIn<(typeof self)['variables']['pagination']>
            >;
            return {
                ...queryActions(self),
                query: queryFlow(self, 'query', isMapEntry) as Run,
                queryMore: queryFlow(self, 'queryMore', isMapEntry) as Run,
                refetch: queryFlow(self, 'refetch', isMapEntry) as Run,
            };
        });
}

export function createMutation<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateMutationOptions<TData, TRequest> = {},
) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        endpoint,
        scope,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            variables: types.optional(
                types.model({
                    request: types.maybe(request),
                }),
                { request: undefined },
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, { endpoint, scope }),
            meta: {} as { [key: string]: any },
            isQuery: false,
            isInfinite: false,
            isMutation: true,
        }))
        .views((self) => ({
            get status() {
                return self.__MstQueryHandler.mutationStatus;
            },
            get isIdle() {
                return self.__MstQueryHandler.mutationStatus === 'idle';
            },
            get isPending() {
                return self.__MstQueryHandler.isLoading;
            },
            /** True while a retry waits for the tab to become visible again. */
            get isPaused() {
                return self.__MstQueryHandler.isPaused;
            },
            get isSuccess() {
                return self.__MstQueryHandler.mutationStatus === 'success';
            },
            get isError() {
                return self.__MstQueryHandler.mutationStatus === 'error';
            },
            get error() {
                return self.__MstQueryHandler.error;
            },
            get failureCount() {
                return self.__MstQueryHandler.failureCount;
            },
            get failureReason() {
                return self.__MstQueryHandler.failureReason;
            },
        }))
        .actions((self) => ({
            ...baseActions(self),
            mutate: flow(function* (options: any) {
                const handler = self.__MstQueryHandler;
                handler.startMutation();
                try {
                    const next = yield handler.mutate(options);
                    return next();
                } finally {
                    handler.finishMutation();
                }
            }) as <TResult = any>(
                options: {
                    request: SnapshotIn<TRequest>;
                    optimisticUpdate?: () => any;
                    revert?: OptimisticRevertMode;
                    meta?: { [key: string]: any };
                    scope?: MutationScope;
                } & RetryOptions,
            ) => Promise<ReturnData<Instance<TData>, TResult>>,
        }));
}

export const VolatileQuery = createQuery('VolatileQuery', {
    data: types.frozen<any>(),
    request: types.frozen<any>(),
});

export interface VolatileQueryType extends Instance<typeof VolatileQuery> {}

export type QueryReturnType = ReturnType<typeof createQuery>;

export type InfiniteQueryReturnType = ReturnType<typeof createInfiniteQuery>;

export type QueryMapReturnType = ReturnType<typeof createQueryMap>;

export type InfiniteQueryMapReturnType = ReturnType<typeof createInfiniteQueryMap>;

export type MutationReturnType = ReturnType<typeof createMutation>;
