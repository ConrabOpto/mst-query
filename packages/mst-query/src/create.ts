import { types, IAnyType, flow, SnapshotIn, Instance } from 'mobx-state-tree';
import { type CacheOptions, MstQueryHandler } from './MstQueryHandler';

type TypeOrFrozen<T> = T extends IAnyType ? T : ReturnType<typeof types.frozen>;

type CreateBaseOptions<TData extends IAnyType> = {
    data?: TData;
};

type CreateOptions<TData extends IAnyType, TRequest extends IAnyType> = CreateBaseOptions<TData> & {
    request?: TRequest;
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
        },
        query: Instance<ReturnType<typeof createQuery<TData, TRequest>>>,
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
        query: Instance<ReturnType<typeof createInfiniteQuery<TData, TRequest, TPagination>>>;
    }) => Promise<any>;
    onQueryMore?: (options: {
        data: Instance<TData>;
        request: Instance<TRequest>;
        pagination: Instance<TPagination>;
        query: Instance<ReturnType<typeof createInfiniteQuery<TData, TRequest, TPagination>>>;
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
            __MstQueryHandler: new MstQueryHandler(self, { endpoint }),
            meta: {} as { [key: string]: any },
            isQuery: true,
            isInfinte: false,
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
                const next = yield self.__MstQueryHandler.query(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>
            >,
            refetch: flow(function* (options: any) {
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

export function createInfiniteQuery<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType = any,
>(name: string, options: CreateInfiniteQueryOptions<TData, TRequest, TPagination>) {
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
            __MstQueryHandler: new MstQueryHandler(self, { endpoint, onQueryMore }),
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
                const next = yield self.__MstQueryHandler.query(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>,
                SnapshotIn<(typeof self)['variables']['pagination']>
            >,
            queryMore: flow(function* (options: any) {
                const next = yield self.__MstQueryHandler.queryMore(options);
                return next();
            }) as QueryReturn<
                (typeof self)['data'],
                SnapshotIn<(typeof self)['variables']['request']>,
                SnapshotIn<(typeof self)['variables']['pagination']>
            >,
            refetch: flow(function* (options: any) {
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
                const next = yield self.__MstQueryHandler.mutate(options);
                return next();
            }) as <TResult = any>(options: {
                request: SnapshotIn<TRequest>;
                optimisticUpdate?: () => any;
                meta?: { [key: string]: any };
                scope?: MutationScope;
            }) => Promise<ReturnData<Instance<TData>, TResult>>,
            abort: self.__MstQueryHandler.abort,
            setMeta(key: string, value: any) {
                self.meta[key] = value;
            },
        }));
}

export const VolatileQuery = createQuery('VolatileQuery', {});

export interface VolatileQueryType extends Instance<typeof VolatileQuery> {}

export type QueryReturnType = ReturnType<typeof createQuery>;

export type InfiniteQueryReturnType = ReturnType<typeof createInfiniteQuery>;

export type MutationReturnType = ReturnType<typeof createMutation>;
