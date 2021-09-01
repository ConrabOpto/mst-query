import { IAnyModelType, Instance, isStateTreeNode, SnapshotIn } from 'mobx-state-tree';
import { useEffect, useState } from 'react';
import { create, createAndRun } from './create';
import { SubscriptionModelType } from './SubscriptionModel';
import type { QueryReturnType, MutationReturnType, SubscriptionReturnType } from './utilityTypes';
import { config } from './config';
import queryCache from './cache';

function mergeWithDefaultOptions(key: string, options: any) {
    return Object.assign({}, (config as any)[key], options);
}

type Options = {
    onRequestSnapshot?: (snapshot: any) => any;
    afterCreate?: (self: any) => any;
    key?: string;
};

type UseQueryOptions<T extends QueryReturnType> = Options & {
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

export function useLazyQuery<T extends QueryReturnType>(
    query: T,
    options: UseQueryOptions<T> = {}
) {
    options = mergeWithDefaultOptions('queryOptions', options);

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
            queryCache.setQuery(q);
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
    };
}

export function useQuery<T extends QueryReturnType>(query: T, options: UseQueryOptions<T> = {}) {
    options = mergeWithDefaultOptions('queryOptions', options);

    const { key } = options;
    const [q, setQuery] = useState(() => createAndRun(query, options));

    useEffect(() => {
        if (q) {
            queryCache.setQuery(q);
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
    };
}

type UseMutationOptions<T extends MutationReturnType> = Options & {
    data?: SnapshotIn<T>['data'];
    request?: SnapshotIn<T>['request'];
    env?: SnapshotIn<T>['env'];
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
};

export function useMutation<T extends MutationReturnType>(
    query: T,
    options: UseMutationOptions<T> = {}
) {
    const { key } = options;
    const [m, setMutation] = useState(() => create(query, options));

    useEffect(() => {
        if (m) {
            queryCache.setQuery(m);
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

type UseSubscriptionOptions<T extends SubscriptionReturnType> = Options & {
    onUpdate?: any;
    data?: SnapshotIn<T>['data'];
    env?: SnapshotIn<T>['env'];
};

export function useSubscription<T extends SubscriptionReturnType>(
    query: T,
    options: UseSubscriptionOptions<T> = {}
): Instance<SubscriptionModelType> {
    const { key } = options;
    const [s, setSubscription] = useState(() => createAndRun(query, options));

    useEffect(() => {
        if (s) {
            queryCache.setQuery(s);
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
