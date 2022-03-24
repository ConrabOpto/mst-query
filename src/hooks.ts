import { IAnyModelType, IAnyType, Instance, isStateTreeNode, SnapshotIn } from 'mobx-state-tree';
import { useContext, useEffect, useState } from 'react';
import { create, createAndRun } from './create';
import { SubscriptionModelType } from './SubscriptionModel';
import type {
    QueryReturnType,
    MutationReturnType,
    SubscriptionReturnType,
    AnyQueryType,
} from './utilityTypes';
import { Context } from './QueryClientProvider';
import { QueryClient } from './QueryClient';

function mergeWithDefaultOptions(key: string, options: any, queryClient: QueryClient<any>) {
    return Object.assign({ queryClient }, (queryClient.config as any)[key], options);
}

type Options = {
    onRequestSnapshot?: (snapshot: any) => any;
    afterCreate?: (self: any) => any;
    key?: string;
};

type QueryOptions<T extends IAnyType> = Options & {
    data?: SnapshotIn<T>['data'] | IAnyModelType;
    request?: SnapshotIn<T>['request'];
    env?: SnapshotIn<T>['env'];
    pagination?: SnapshotIn<T>['pagination'];
    onFetched?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
    staleTime?: number;
    cacheTime?: number;
};

type UseQueryOptions<T extends QueryReturnType> = QueryOptions<T>;

export function useLazyQuery<T extends QueryReturnType>(
    query: T,
    options: UseQueryOptions<T> = {}
) {
    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    const { key } = options;
    const [q, setQuery] = useState(() => create(query, options));

    useEffect(() => {
        if (key && key !== q.__MstQueryHandler.options.key) {
            const newQuery = create(query, options);
            setQuery(newQuery);
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        }
    }, [key]);

    useEffect(() => {
        if (q) {
            queryClient.queryStore.setQuery(q);
        }
        return () => {
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        };
    }, [q]);

    return {
        run: q.run as typeof q['run'],
        data: q.data as typeof q['data'],
        refetch: (q.refetch as unknown) as typeof q['run'],
        error: q.error,
        isFetched: q.isFetched,
        isLoading: q.isLoading,
        isRefetching: q.isRefetching,
        isFetchingMore: q.isFetchingMore,
        query: q,
        cachedAt: q.__MstQueryHandler.cachedAt,
    };
}

export function useQuery<T extends QueryReturnType>(query: T, options: UseQueryOptions<T> = {}) {
    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    const { key } = options;
    const [q, setQuery] = useState(() => createAndRun(query, options));

    useEffect(() => {
        if (q) {
            queryClient.queryStore.setQuery(q);
        }
        return () => {
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        };
    }, [q]);

    useEffect(() => {
        if (key && key !== q.__MstQueryHandler.options.key) {
            const newQuery = createAndRun(query, options);
            setQuery(newQuery);
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        }
    }, [key]);

    return {
        run: q.run as typeof q['run'],
        data: q.data as typeof q['data'],
        refetch: (q.refetch as unknown) as typeof q['run'],
        error: q.error,
        isFetched: q.isFetched,
        isLoading: q.isLoading,
        isRefetching: q.isRefetching,
        isFetchingMore: q.isFetchingMore,
        query: q,
        cachedAt: q.__MstQueryHandler.cachedAt,
    };
}

type MutationOptions<T extends IAnyType> = Options & {
    data?: SnapshotIn<T>['data'];
    request?: SnapshotIn<T>['request'];
    env?: SnapshotIn<T>['env'];
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
};

type UseMutationOptions<T extends MutationReturnType> = MutationOptions<T>;

export function useMutation<T extends MutationReturnType>(
    query: T,
    options: UseMutationOptions<T> = {}
) {
    const queryClient = useContext(Context) as QueryClient<any>;
    options = { queryClient, ...options } as any;

    const { key } = options;
    const [m, setMutation] = useState(() => create(query, options));

    useEffect(() => {
        if (m) {
            queryClient?.queryStore.setQuery(m);
        }
        return () => {
            if (isStateTreeNode(m)) {
                m.__MstQueryHandler.remove();
            }
        };
    }, [m]);

    useEffect(() => {
        if (key && key !== m.__MstQueryHandler.options.key) {
            const newMutation = create(query, options);
            setMutation(newMutation);
            if (isStateTreeNode(m)) {
                m.__MstQueryHandler.remove();
            }
        }
    }, [key]);

    const result = {
        ...m,
        mutation: m,
    };

    return [m.run, result] as [typeof m['run'], typeof result];
}

type SubscriptionOptions<T extends IAnyType> = Options & {
    onUpdate?: any;
    data?: SnapshotIn<T>['data'];
    env?: SnapshotIn<T>['env'];
};

type UseSubscriptionOptions<T extends SubscriptionReturnType> = SubscriptionOptions<T>;

export function useSubscription<T extends SubscriptionReturnType>(
    query: T,
    options: UseSubscriptionOptions<T> = {}
): Instance<SubscriptionModelType> {
    const queryClient = useContext(Context)! as QueryClient<any>;
    options = { queryClient, ...options } as any;

    const { key } = options;
    const [s, setSubscription] = useState(() => createAndRun(query, options));

    useEffect(() => {
        if (s) {
            queryClient.queryStore.setQuery(s);
        }
        return () => {
            if (isStateTreeNode(s)) {
                s.__MstQueryHandler.remove();
            }
        };
    }, [s]);

    useEffect(() => {
        if (key && key !== s.__MstQueryHandler.options.key) {
            const newSubscription = create(query, options);
            setSubscription(newSubscription);
            if (isStateTreeNode(s)) {
                s.__MstQueryHandler.remove();
            }
            (newSubscription as any).run();
        }
    }, [key]);

    return { ...s, subscription: s };
}

export type CommandOptions<T extends AnyQueryType> = T extends QueryReturnType
    ? QueryOptions<T>
    : T extends MutationReturnType
    ? MutationOptions<T>
    : T extends SubscriptionReturnType
    ? SubscriptionOptions<T>
    : never;
