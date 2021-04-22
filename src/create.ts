import { types, IAnyType, IAnyModelType, Instance } from 'mobx-state-tree';
import { runInAction } from 'mobx';
import QueryModel from './QueryModel';
import MutationModel from './MutationModel';
import SubscriptionModel from './SubscriptionModel';
import { config } from './config';
import { merge } from './QueryModelBase';
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
        env
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
        env
    });
}

export function createSubscription<TData extends IAnyType, TEnv extends IAnyType>(
    name: string,
    options: BaseOptions<TData, TEnv>
) {
    const { data, env } = options;
    return SubscriptionModel.named(name).props({
        data: types.maybeNull(data),
        env
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
    const { data, request, env, onMutate, onUpdate, onRequestSnapshot, afterCreate, onFetched } = options;

    const preparedData = data
        ? runInAction(() => merge(data, (query as any).properties.data, config.env))
        : null;
    const preparedRequest = request
        ? runInAction(() => merge(request, (query as any).properties.request, config.env))
        : {};

    const q = query.create({ data: preparedData, request: preparedRequest, env }, config.env);

    if (options.fetchPolicy !== 'no-cache') {
        queryCache.setQuery(q);
    }
    q._init({ data, request, onMutate, onUpdate, onFetched, onRequestSnapshot });

    afterCreate?.(q);

    return q;
}
