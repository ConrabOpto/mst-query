import { types, IAnyType, IAnyModelType, Instance } from 'mobx-state-tree';
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
    const q = create(query, options);
    q.run();
    return q;
}

export function create<P extends IAnyModelType>(
    query: P,
    options: any = {}
): Instance<P> & { run: unknown } {
    const {
        data,
        request,
        env,
        onMutate,
        onUpdate,
        onRequestSnapshot,
        afterCreate,
        onFetched,
        initialResult
    } = options;

    const q = query.create({ data, request, env }, config.env);
    queryCache.setQuery(q);

    q._init({ data, request, onMutate, onUpdate, onFetched, onRequestSnapshot, initialResult });

    afterCreate?.(q);

    return q;
}
