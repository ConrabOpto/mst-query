import {
    types,
    IAnyType,
    IAnyModelType,
    Instance,
    isStateTreeNode,
    getSnapshot,
    toGeneratorFunction,
    addDisposer,
} from 'mobx-state-tree';
import { MstQueryHandler } from './MstQueryHandler';

type TypeOrFrozen<T> = T extends IAnyType ? T : ReturnType<typeof types.frozen>;

type CreateBaseOptions<TData extends IAnyType, TEnv extends IAnyType> = {
    data?: TData;
    env?: TEnv;
};

type CreateOptions<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
> = CreateBaseOptions<TData, TEnv> & { request?: TRequest };

type CreateQueryOptions<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType,
    TPagination extends IAnyType
> = CreateOptions<TRequest, TData, TEnv> & {
    pagination?: TPagination;
};

type QueryOptions<T, TData> = {
    onFetched?: (data: TData, self: T) => void;
    onSuccess?: (data: TData, self: T) => void;
    onError?: (data: TData, self: T) => void;
    staleTime?: number;
    cacheTime?: number;
};

export function createQuery<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType,
    TPagination extends IAnyType
>(name: string, options: CreateQueryOptions<TRequest, TData, TEnv, TPagination> = {}) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
        pagination = types.frozen() as TypeOrFrozen<TPagination>,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            request: request,
            env,
            pagination,
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self),
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
            refetch: self.__MstQueryHandler.refetch,
            abort: self.__MstQueryHandler.abort,
            setOptions(options: QueryOptions<typeof self, typeof self['data']>) {
                self.__MstQueryHandler.setOptions(options);
            },
        }));
}

export function createMutation<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
>(name: string, options: CreateOptions<TRequest, TData, TEnv> = {}) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            request,
            env,
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self),
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
            setOptions(
                options: Exclude<QueryOptions<typeof self, typeof self['data']>, 'onFetched'>
            ) {
                self.__MstQueryHandler.setOptions(options);
            },
        }));
}

type SubscriptionOptions = {
    onUpdate?: any;
};

export function createSubscription<TData extends IAnyType, TEnv extends IAnyType>(
    name: string,
    options: CreateBaseOptions<TData, TEnv> = {}
) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            env,
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self),
        }))
        .actions((self) => ({
            subscribe(queryFn: any, variables = {}, options = {}) {
                const opts = {
                    variables,
                    ...options,
                };

                const subscriber = {
                    next(data: any) {
                        const selfAny = self as any;

                        if (selfAny.shouldUpdate) {
                            const update = selfAny.shouldUpdate(data);
                            if (!update) {
                                return;
                            }
                        }

                        self.__MstQueryHandler.updateData(data);

                        const currentData = selfAny.data;
                        selfAny.onUpdate?.(currentData, data);
                        selfAny.__MstQueryHandler.options?.onUpdate?.(currentData, data);
                    },
                    error(error: any) {
                        self.__MstQueryHandler.setError(error);
                    },
                };

                const subscription = queryFn(subscriber, opts.variables, opts);
                if (subscription) {
                    addDisposer(self, subscription);
                }
            },
            setOptions(options: SubscriptionOptions) {
                self.__MstQueryHandler.setOptions(options);
            },
        }));
}

export function createAndRun<T extends IAnyModelType>(query: T, options: any = {}) {
    const q = create(query, options);
    q.run();

    return q;
}

export function create<T extends IAnyModelType>(
    query: T,
    options: any = {}
): Instance<T> & { run: unknown } {
    let {
        data,
        request,
        env,
        onSuccess,
        onError,
        onUpdate,
        onRequestSnapshot,
        afterCreate,
        onFetched,
        staleTime,
        cacheTime,
        pagination,
        key = query.name,
        queryClient,
    } = options;

    const snapshot = data && isStateTreeNode(data) ? getSnapshot(data) : data;
    const q = query.create({ data: snapshot, request, pagination, env }, queryClient.config.env);

    q.__MstQueryHandler.setOptions({
        onSuccess,
        onError,
        onUpdate,
        onFetched,
        onRequestSnapshot,
        staleTime,
        cacheTime,
        key: key ?? query.name,
    });

    afterCreate?.(q);

    return q;
}
