import {
    types,
    IAnyType,
    IAnyModelType,
    Instance,
    isStateTreeNode,
    getSnapshot,
    toGeneratorFunction,
    addDisposer,
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
    queryFn?: any;
};

type CreateQueryOptions<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType
> = CreateOptions<TData, TRequest> & {
    pagination?: TPagination;
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
        queryFn,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            variables: types.optional(
                types.model({
                    request: types.maybeNull(request),
                    pagination: types.maybeNull(pagination),
                }),
                { request: null, pagination: null }
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, {
                queryFn,
                staleTime: 0,
                cacheTime: 300,
            }),
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
            setOptions(options: any) {
                self.__MstQueryHandler.setOptions(options);
            },
        }));
}

export function createQueryWithRun<
    TData extends IAnyType,
    TRequest extends IAnyType,
    TPagination extends IAnyType
>(name: string, options: CreateQueryOptions<TData, TRequest, TPagination>) {
    return createQuery(name, options).actions((self) => ({
        run: flow(function* (request?: SnapshotIn<TRequest>, pagination?: SnapshotIn<TPagination>) {
            const next = yield* (self as any).query({ request, pagination });
            next();
        }),
    }));
}

export function createMutation<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateOptions<TData, TRequest> = {}
) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        queryFn,
    } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
            variables: types.optional(
                types.model({
                    request: types.maybeNull(request),
                }),
                { request: null }
            ),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self, {
                queryFn,
                staleTime: 0,
                cacheTime: 0,
            }),
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
            setOptions(options: any) {
                self.__MstQueryHandler.setOptions(options);
            },
        }));
}

export function createMutationWithRun<TData extends IAnyType, TRequest extends IAnyType>(
    name: string,
    options: CreateOptions<TData, TRequest> = {}
) {
    return createMutation(name, options).actions((self) => ({
        run: flow(function* (request?: SnapshotIn<TRequest>) {
            const next = yield* (self as any).mutate({ request });
            next();
        }),
    }));
}

type SubscriptionOptions = {
    onUpdate?: any;
};

export function createSubscription<TData extends IAnyType, TEnv extends IAnyType>(
    name: string,
    options: CreateBaseOptions<TData> = {}
) {
    const { data = types.frozen() as TypeOrFrozen<TData> } = options;
    return types
        .model(name, {
            data: types.maybeNull(data),
        })
        .volatile((self) => ({
            __MstQueryHandler: new MstQueryHandler(self),
        }))
        .views((self) => ({
            get error() {
                return self.__MstQueryHandler.error;
            }
        }))
        .actions((self) => ({
            __MstQueryHandlerAction(action: any) {
                return action();
            },
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

    const { request, pagination } = options;
    q.run(request, pagination);

    return q;
}

export function create<T extends IAnyModelType>(
    query: T,
    options: any = {}
): Instance<T> & { run: unknown } {
    let {
        data,
        initialState,
        onSuccess,
        onError,
        onUpdate,
        afterCreate,
        onFetched,
        staleTime,
        cacheTime,
        key = query.name,
        queryFn,
        queryClient,
    } = options;

    const snapshot = data && isStateTreeNode(data) ? getSnapshot(data) : data;
    const q = query.create({ data: snapshot, ...initialState }, queryClient.config.env);

    q.__MstQueryHandler.setOptions({
        onSuccess,
        onError,
        onUpdate,
        onFetched,
        staleTime,
        cacheTime,
        queryFn,
        key: key ?? query.name,
    });

    afterCreate?.(q);

    return q;
}
