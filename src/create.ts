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

type BaseOptions<TData extends IAnyType, TEnv extends IAnyType> = {
    data: TData;
    env: TEnv;
};

type Options<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
> = BaseOptions<TData, TEnv> & { request: TRequest };

export function createQuery<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
>(name: string, options: Options<TRequest, TData, TEnv>) {
    const { data, request, env } = options;
    return QueryModel.named(name).props({
        data: types.maybeNull(data),
        request,
        env,
    });
}

export function createMutation<
    TRequest extends IAnyType,
    TData extends IAnyType,
    TEnv extends IAnyType
>(name: string, options: Options<TData, TRequest, TEnv>) {
    const { data, request, env } = options;
    return MutationModel.named(name).props({
        data: types.maybeNull(data),
        request,
        env,
    });
}

export function createSubscription<TData extends IAnyType, TEnv extends IAnyType>(
    name: string,
    options: BaseOptions<TData, TEnv>
) {
    const { data, env } = options;
    return SubscriptionModel.named(name).props({
        data: types.maybeNull(data),
        env,
    });
}

export function createAndRun<P extends IAnyModelType>(query: P, options: any = {}) {
    const { cacheMaxAge, key = query.name } = options;

    let initialSnapshot;
    if (cacheMaxAge) {
        const queries = queryCache.findAll(query, (q) => {
            return q.options.key === key;
        });
        if (queries.length > 1) {
            throw new Error('Use an unique key when using cacheMaxAge');
        }

        initialSnapshot = queries.length && queries[0].data ? getSnapshot(queries[0]) : null;
    }

    const data = initialSnapshot ? (initialSnapshot as any).data : null;
    options.data = options.data ?? data;

    const q = create(query, options);

    if (!initialSnapshot) {
        q.run();
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
        key,
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
