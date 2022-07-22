import { flow, IAnyType, Instance, isStateTreeNode, SnapshotIn } from 'mobx-state-tree';
import { useContext, useEffect, useState } from 'react';
import { create, createAndRun } from './create';
import type {
    QueryReturnType,
    MutationReturnType,
    SubscriptionReturnType,
    AnyQueryType,
} from './utilityTypes';
import { Context } from './QueryClientProvider';
import { QueryClient } from './QueryClient';
import equal from '@wry/equality';

function mergeWithDefaultOptions(key: string, options: any, queryClient: QueryClient<any>) {
    return Object.assign({ queryClient }, (queryClient.config as any)[key], options);
}

type Options = {
    afterCreate?: (self: any) => any;
};

type QueryOptions<T extends IAnyType> = Options & {
    request?: SnapshotIn<T>['request'];
    pagination?: SnapshotIn<T>['pagination'];
    onFetched?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onQueryMore?: (data: Instance<T>['data'], self: Instance<T>) => void;
    staleTime?: number;
    cacheTime?: number;
    initialState?: SnapshotIn<T>;
    queryFn?: any;
};

type UseQueryOptions<T extends QueryReturnType> = QueryOptions<T>;

export function useLazyQuery<T extends QueryReturnType>(
    query: T & { run: (...args: unknown[]) => unknown },
    options: UseQueryOptions<T> = {}
) {
    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    const [q, setQuery] = useState(() => create(query as T, options));

    const sameRequest = equal(options.request, q.variables.request);
    useEffect(() => {
        if (!sameRequest) {
            const newQuery = create(query, options);
            setQuery(newQuery);
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        }
        return () => {
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        };
    }, [sameRequest]);

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

    const [q, setQuery] = useState(() => createAndRun(query, options));

    const sameRequest = equal(options.request, q.variables.request);
    useEffect(() => {
        if (!sameRequest) {
            const newQuery = createAndRun(query, options);
            setQuery(newQuery);
            q.__MstQueryHandler.remove();
        }
        return () => {
            if (isStateTreeNode(q)) {
                q.__MstQueryHandler.remove();
            }
        };
    }, [sameRequest]);

    const samePagination = equal(options.pagination, q.variables.pagination);
    useEffect(() => {
        if (options.pagination && !samePagination && !q.__MstQueryHandler.isDisposed) {
            q.__MstQueryHandler.callWithNext(q.queryMore, options);
        }
    }, [samePagination]);

    return {
        data: q.data as typeof q['data'],
        error: q.error,
        isFetched: q.isFetched,
        isLoading: q.isLoading,
        isRefetching: q.isRefetching,
        isFetchingMore: q.isFetchingMore,
        query: q,
        refetch: (() => (q.__MstQueryHandler.callWithNext(q.refetch) as any)) as typeof q['refetch'],
        cachedAt: q.__MstQueryHandler.cachedAt,
    };
}

type MutationOptions<T extends IAnyType> = Options & {
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
    initialState?: SnapshotIn<T>;
    queryFn?: any;
};

type UseMutationOptions<T extends MutationReturnType> = MutationOptions<T>;

export function useMutation<T extends MutationReturnType>(
    query: T,
    options: UseMutationOptions<T> = {}
) {
    const queryClient = useContext(Context) as QueryClient<any>;
    options = { queryClient, ...options } as any;

    const [m] = useState(() => create(query, options));

    useEffect(() => {
        return () => {
            if (isStateTreeNode(m)) {
                m.__MstQueryHandler.remove();
            }
        };
    }, []);

    const result = {
        data: m.data as typeof m['data'],
        error: m.error,
        isLoading: m.isLoading,
        mutation: m
    };

    return [m.run, result] as [typeof m['run'], typeof result];
}

type SubscriptionOptions<T extends IAnyType> = Options & {
    onUpdate?: any;
    initialState?: SnapshotIn<T>;
};

type UseSubscriptionOptions<T extends SubscriptionReturnType> = SubscriptionOptions<T>;

export function useSubscription<T extends SubscriptionReturnType>(
    query: T,
    options: UseSubscriptionOptions<T> = {}
) {
    const queryClient = useContext(Context)! as QueryClient<any>;
    options = { queryClient, ...options } as any;

    const [s] = useState(() => createAndRun(query, options));

    useEffect(() => {
        return () => {
            if (isStateTreeNode(s)) {
                s.__MstQueryHandler.remove();
            }
        };
    }, []);

    return {
        run: s.run as typeof s['run'],
        data: s.data as typeof s['data'],
        error: s.error,
        subscription: s,
    };
}

export type AnyQueryOptions<T extends AnyQueryType> = T extends QueryReturnType
    ? QueryOptions<T>
    : T extends MutationReturnType
    ? MutationOptions<T>
    : T extends SubscriptionReturnType
    ? SubscriptionOptions<T>
    : never;
