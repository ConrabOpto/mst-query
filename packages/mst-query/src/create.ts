import { types, IAnyType, flow, SnapshotIn, Instance } from 'mobx-state-tree';
import { type CacheOptions, MstQueryHandler, type OptimisticRevertMode } from './MstQueryHandler';
import { createQueryCollection } from './QueryCollection';

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
        .views((self) => ({
            get isLoading() {
                return self.__MstQueryHandler.isLoading;
            },
            get error() {
                return self.__MstQueryHandler.error;
            },
            get isRefetching() {
                return self.__MstQueryHandler.isRefetching;
            },
            get isFetched() {
                return self.__MstQueryHandler.isFetched;
            },
            get cachedAt() {
                return self.__MstQueryHandler.cachedAt;
            },
        }))
        .actions((self) => ({
            __MstQueryHandlerAction(action: any) {
                return action();
            },
            query: flow(function* (options: any) {
                if (isMapEntry) return yield self.__MstQueryHandler.executeQuery('query', options);
                const next = yield self.__MstQueryHandler.query(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>
            >,
            refetch: flow(function* (options: any) {
                if (isMapEntry)
                    return yield self.__MstQueryHandler.executeQuery('refetch', options);
                const next = yield self.__MstQueryHandler.refetch(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>
            >,
            invalidate() {
                self.__MstQueryHandler.invalidate();
            },
            setData(data: any, options?: CacheOptions) {
                return self.__MstQueryHandler.setData(data, options);
            },
            setMeta(key: string, value: any) {
                self.meta[key] = value;
            },
            abort: self.__MstQueryHandler.abort,
        }));
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
        .views((self) => ({
            get isLoading() {
                return self.__MstQueryHandler.isLoading;
            },
            get error() {
                return self.__MstQueryHandler.error;
            },
            get isRefetching() {
                return self.__MstQueryHandler.isRefetching;
            },
            get isFetchingMore() {
                return self.__MstQueryHandler.isFetchingMore;
            },
            get isFetched() {
                return self.__MstQueryHandler.isFetched;
            },
            get cachedAt() {
                return self.__MstQueryHandler.cachedAt;
            },
        }))
        .actions((self) => ({
            __MstQueryHandlerAction(action: any) {
                return action();
            },
            query: flow(function* (options: any) {
                if (isMapEntry) return yield self.__MstQueryHandler.executeQuery('query', options);
                const next = yield self.__MstQueryHandler.query(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>,
                SnapshotIn<(typeof self)['variables']['pagination']>
            >,
            queryMore: flow(function* (options: any) {
                if (isMapEntry)
                    return yield self.__MstQueryHandler.executeQuery('queryMore', options);
                const next = yield self.__MstQueryHandler.queryMore(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>,
                SnapshotIn<(typeof self)['variables']['pagination']>
            >,
            refetch: flow(function* (options: any) {
                if (isMapEntry)
                    return yield self.__MstQueryHandler.executeQuery('refetch', options);
                const next = yield self.__MstQueryHandler.refetch(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>,
                SnapshotIn<(typeof self)['variables']['pagination']>
            >,
            invalidate() {
                self.__MstQueryHandler.invalidate();
            },
            setData(data: any) {
                return self.__MstQueryHandler.setData(data);
            },
            setMeta(key: string, value: any) {
                self.meta[key] = value;
            },
            abort: self.__MstQueryHandler.abort,
        }));
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
            isInfinte: false,
            isMutation: true,
        }))
        .views((self) => ({
            get isLoading() {
                return self.__MstQueryHandler.isLoading;
            },
            get error() {
                return self.__MstQueryHandler.error;
            },
        }))
        .actions((self) => ({
            __MstQueryHandlerAction(action: any) {
                return action();
            },
            mutate: flow(function* (options: any) {
                const handler = self.__MstQueryHandler;
                handler.startMutation();
                try {
                    const next = yield handler.mutate(options);
                    return next();
                } finally {
                    handler.finishMutation();
                }
            }) as <TResult = any>(options: {
                request: SnapshotIn<TRequest>;
                optimisticUpdate?: () => any;
                revert?: OptimisticRevertMode;
                meta?: { [key: string]: any };
                scope?: MutationScope;
            }) => Promise<ReturnData<Instance<TData>, TResult>>,
            abort: self.__MstQueryHandler.abort,
            setMeta(key: string, value: any) {
                self.meta[key] = value;
            },
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
