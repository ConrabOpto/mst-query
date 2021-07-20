import {
    types,
    IAnyType,
    IAnyModelType,
    Instance,
    isStateTreeNode,
    getSnapshot,
} from 'mobx-state-tree';
import QueryModel from './QueryModel';
import MutationModel from './MutationModel';
import SubscriptionModel from './SubscriptionModel';
import { config } from './config';
import queryCache from './cache';
import { QueryStatus } from './UtilityTypes';

type TypeOrFrozen<T> = T extends IAnyType ? T : ReturnType<typeof types.frozen>;

type BaseOptions<TData extends IAnyType, TEnv extends IAnyType> = {
    data?: TData;
    env?: TEnv;
};

type Options<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
> = BaseOptions<TData, TEnv> & { request?: TRequest };

type QueryOptions<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType,
    TPagination extends IAnyType
> = Options<TRequest, TData, TEnv> & {
    pagination?: TPagination;
};

export function createQuery<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType,
    TPagination extends IAnyType
>(name: string, options: QueryOptions<TRequest, TData, TEnv, TPagination> = {}) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
        pagination = types.frozen() as TypeOrFrozen<TPagination>,
    } = options;
    return QueryModel.named(name).props({
        data: types.maybeNull(data),
        request: request,
        env,
        pagination,
    });
}

export function createMutation<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
>(name: string, options: Options<TRequest, TData, TEnv> = {}) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
    } = options;
    return MutationModel.named(name).props({
        data: types.maybeNull(data),
        request,
        env,
    });
}

export function createSubscription<TData extends IAnyType, TEnv extends IAnyType>(
    name: string,
    options: BaseOptions<TData, TEnv> = {}
) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
    } = options;
    return SubscriptionModel.named(name).props({
        data: types.maybeNull(data),
        env,
    });
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
        onMutate,
        onUpdate,
        onRequestSnapshot,
        afterCreate,
        onFetched,
        initialResult,
        staleTime,
        cacheTime,
        pagination,
        key = query.name,
    } = options;

    const snapshot = data && isStateTreeNode(data) ? getSnapshot(data) : data;
    const q = query.create({ data: snapshot, request, pagination, env }, config.env);
    queryCache.setQuery(q);

    q.__MstQueryHandler.init({
        data,
        request,
        pagination,
        onMutate,
        onUpdate,
        onFetched,
        onRequestSnapshot,
        initialResult,
        staleTime,
        cacheTime,
        key: key ?? query.name,
    });

    afterCreate?.(q);

    return q;
}
