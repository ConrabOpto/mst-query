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

export function createQuery<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
>(name: string, options: Options<TRequest, TData, TEnv> = {}) {
    const {
        data = types.frozen() as TypeOrFrozen<TData>,
        request = types.frozen() as TypeOrFrozen<TRequest>,
        env = types.frozen() as TypeOrFrozen<TEnv>,
    } = options;
    return QueryModel.named(name).props({
        data: types.maybeNull(data),
        request: request,
        env,
    });
}

export function createMutation<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
>(name: string, options: Options<TData, TRequest, TEnv> = {}) {
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

export function createAndRun<P extends IAnyModelType>(query: P, options: any = {}) {
    const { cacheMaxAge, key = query.name } = options;

    let initialSnapshot;
    let cachedQuery;
    if (cacheMaxAge) {
        const queries = queryCache.findAll(
            query,
            (q) => {
                return q.options.key === key;
            },
            true
        );

        if (queries.length > 1) {
            throw new Error('Pass an unique key to useQuery when using cacheMaxAge');
        }

        if (queries.length > 0) {
            cachedQuery = queries[0];

            initialSnapshot = cachedQuery ? getSnapshot(cachedQuery) : null;
        }
    }

    const data = initialSnapshot ? (initialSnapshot as any).data : null;
    const request = initialSnapshot ? (initialSnapshot as any).request : null;
    options.data = data ?? options.data;
    options.request = request ?? options.request;

    const q = create(query, options);

    if (!initialSnapshot) {
        q.run();
    }

    if (cachedQuery) {
        queryCache.removeQuery(cachedQuery);
    }

    return q;
}

export function create<P extends IAnyModelType>(
    query: P,
    options: any = {}
): Instance<P> & { run: unknown } {
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
        cacheMaxAge,
        key = query.name,
    } = options;

    const snapshot = data && isStateTreeNode(data) ? getSnapshot(data) : data;
    const q = query.create({ data: snapshot, request, env }, config.env);
    queryCache.setQuery(q);

    q._init({
        data,
        request,
        onMutate,
        onUpdate,
        onFetched,
        onRequestSnapshot,
        initialResult,
        cacheMaxAge,
        key: key ?? query.name,
    });

    afterCreate?.(q);

    return q;
}
