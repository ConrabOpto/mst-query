import { types, IAnyType, flow, SnapshotIn, Instance } from 'mobx-state-tree';
import { MstQueryHandler } from './MstQueryHandler';

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
            setData: (data: any) => void;
        },
        query: any
    ) => Promise<any>;
};

type CreateQueryOptions<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType
> = CreateOptions<TData, TRequest> & {
    pagination?: TPagination;
    endpoint?: (
        options: {
            request: Instance<TRequest>;
            pagination: Instance<TPagination>;
            meta: { [key: string]: any };
            signal: AbortSignal;
            setData: (data: any) => void;
        },
        query: any
    ) => Promise<any>;
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
    options?: QueryOptions<TRequest, TPagination>
) => Promise<ReturnData<Instance<TData>, TResult>>;

export function createQuery<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType
>(name: string, options: CreateQueryOptions<TData, TRequest, TPagination>) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        pagination = types.frozen() as TypeOrFrozen<TPagination>,
        endpoint,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            variables: types.optional(
                types.model({
                    request: types.maybe(request),
                    pagination: types.maybe(pagination),
                }),
                { request: undefined, pagination: undefined }
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, { endpoint }),
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
            get result() {
                return self.__MstQueryHandler.result;
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
                typeof self['data'],
                SnapshotIn<typeof self['variables']['request']>,
                SnapshotIn<typeof self['variables']['request']>
            >,
            queryMore: flow(function* (options: any) {
                const next = yield self.__MstQueryHandler.queryMore(options);
                return next();
            }) as QueryReturn<
                typeof self['data'],
                SnapshotIn<typeof self['variables']['request']>,
                SnapshotIn<typeof self['variables']['request']>
            >,
            refetch: flow(function* (options: any) {
                const next = yield self.__MstQueryHandler.refetch(options);
                return next();
            }) as QueryReturn<
                typeof self['data'],
                SnapshotIn<typeof self['variables']['request']>,
                SnapshotIn<typeof self['variables']['request']>
            >,
            setData(data: any) {
                return self.__MstQueryHandler.setData(data);
            },
            abort: self.__MstQueryHandler.abort,
        }));
}

export function createMutation<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateMutationOptions<TData, TRequest> = {}
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
                { request: undefined }
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, { endpoint }),
        }))
        .views((self) => ({
            get isLoading() {
                return self.__MstQueryHandler.isLoading;
            },
            get error() {
                return self.__MstQueryHandler.error;
            },
            get result() {
                return self.__MstQueryHandler.result;
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
                optimisticResponse?: TResult;
                optimisticUpdate?: () => void;
                meta?: { [key: string]: any };
            }) => Promise<ReturnData<Instance<TData>, TResult>>,
            abort: self.__MstQueryHandler.abort,
        }));
}

export const VolatileQuery = createQuery('VolatileQuery', {});

export interface VolatileQueryType extends Instance<typeof VolatileQuery> {}

export type QueryReturnType = ReturnType<typeof createQuery>;

export type MutationReturnType = ReturnType<typeof createMutation>;
