import {
    types,
    IAnyType,
    toGeneratorFunction,
    flow,
    SnapshotIn,
} from 'mobx-state-tree';
import { MstQueryHandler } from './MstQueryHandler';

type TypeOrFrozen<T> = T extends IAnyType ? T : ReturnType<typeof types.frozen>;

type CreateBaseOptions<TData extends IAnyType> = {
    data?: TData;
};

type CreateOptions<TData extends IAnyType, TRequest extends IAnyType> = CreateBaseOptions<TData> & {
    request?: TRequest;
    endpoint?: ({
        request,
        context,
    }: {
        request: SnapshotIn<TRequest>;
        context: any;
    }) => Promise<any>;
};

type CreateQueryOptions<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType
> = CreateOptions<TData, TRequest> & {
    pagination?: TPagination;
    endpoint?: ({
        request,
        pagination,
        context,
    }: {
        request: SnapshotIn<TRequest>;
        pagination: SnapshotIn<TPagination>;
        context: any;
    }) => Promise<any>;
};

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
            }
        }))
        .actions((self) => ({
            __MstQueryHandlerAction(action: any) {
                return action();
            },
            query: toGeneratorFunction(
                <TResult = any>(...args: Parameters<typeof self.__MstQueryHandler.query>) =>
                    self.__MstQueryHandler.query<typeof self['data'], TResult>(...args)
            ),
            queryMore: toGeneratorFunction(
                <TResult = any>(...args: Parameters<typeof self.__MstQueryHandler.queryMore>) =>
                    self.__MstQueryHandler.queryMore<typeof self['data'], TResult>(...args)
            ),
            refetch: flow(function* (...args: Parameters<typeof self.__MstQueryHandler.query>) {
                const next = yield self.__MstQueryHandler.refetch(...args);
                next();
            }),
            setData(data: any) {
                self.__MstQueryHandler.setData(data);
            },
            abort: self.__MstQueryHandler.abort,
        }));
}

export function createMutation<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateOptions<TData, TRequest> = {}
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
            mutate: toGeneratorFunction(
                <TResult = any>(...args: Parameters<typeof self.__MstQueryHandler.mutate>) =>
                    self.__MstQueryHandler.mutate<typeof self['data'], TResult>(...args)
            ),
            abort: self.__MstQueryHandler.abort,
        }));
}