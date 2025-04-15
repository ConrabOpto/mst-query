import { Instance, SnapshotIn } from 'mobx-state-tree';
import { useContext, useEffect, useRef, useState } from 'react';
import {
    VolatileQuery,
    MutationReturnType,
    QueryReturnType,
    InfiniteQueryReturnType,
} from './create';
import { Context } from './QueryClientProvider';
import { QueryClient } from './QueryClient';
import { CacheOptions, EmptyPagination, EmptyRequest, QueryObserver } from './MstQueryHandler';
import { useEvent } from './utils';

function mergeWithDefaultOptions(key: string, options: any, queryClient: QueryClient<any>) {
    return Object.assign({ queryClient }, (queryClient.config as any)[key], {
        enabled: true,
        ...options,
    });
}

type QueryOptions<T extends Instance<QueryReturnType>> = {
    request?: SnapshotIn<T['variables']['request']>;
    refetchOnMount?: 'always' | 'never' | 'if-stale';
    refetchOnChanged?:
        | 'all'
        | 'request'
        | 'pagination'
        | 'none'
        | ((options: { prevRequest: Exclude<T['variables']['request'], undefined> }) => boolean);
    staleTime?: number;
    enabled?: boolean;
    initialData?: any;
    initialDataUpdatedAt?: number;
    meta?: { [key: string]: any };
} & CacheOptions;

export function useQuery<T extends Instance<QueryReturnType>>(
    query: T,
    options: QueryOptions<T> = {},
) {
    const [observer, setObserver] = useState(() => new QueryObserver(query, true));

    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    (options as any).request = options.request ?? EmptyRequest;

    if ((query as any).isInfinite) {
        throw new Error(
            'useQuery should be used with a query that does not have pagination. Use useInfiniteQuery instead.',
        );
    }

    useEffect(() => {
        if (observer.query !== query) {
            setObserver(new QueryObserver(query, true));
        }
    }, [query]);

    useEffect(() => {
        observer.setOptions(options);

        return () => {
            observer.unsubscribe();
        };
    }, [options]);

    return {
        data: query.data as (typeof query)['data'],
        dataUpdatedAt: query.__MstQueryHandler.cachedAt?.getTime(),
        error: query.error,
        isFetched: query.isFetched,
        isLoading: query.isLoading,
        isRefetching: query.isRefetching,
        query: query,
        refetch: query.refetch,
        isStale: query.__MstQueryHandler.isStale(options),
        isFetchedAfterMount: observer.isFetchedAfterMount,
    };
}

type InfiniteQueryOptions<T extends Instance<InfiniteQueryReturnType>> = {
    request?: SnapshotIn<T['variables']['request']>;
    pagination?: SnapshotIn<T['variables']['pagination']>;
    refetchOnMount?: 'always' | 'never' | 'if-stale';
    refetchOnChanged?:
        | 'all'
        | 'request'
        | 'pagination'
        | 'none'
        | ((options: {
              prevRequest: Exclude<T['variables']['request'], undefined>;
              prevPagination: Exclude<T['variables']['pagination'], undefined>;
          }) => boolean);
    staleTime?: number;
    enabled?: boolean;
    initialData?: any;
    initialDataUpdatedAt?: number;
    meta?: { [key: string]: any };
};

export function useInfiniteQuery<T extends Instance<InfiniteQueryReturnType>>(
    query: T,
    options: InfiniteQueryOptions<T> = {},
) {
    const [observer, setObserver] = useState(() => new QueryObserver(query, true));

    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    (options as any).request = options.request ?? EmptyRequest;
    (options as any).pagination = options.pagination ?? EmptyPagination;

    if (!(query as any).isInfinite) {
        throw new Error(
            'useInfiniteQuery should be used with a query that has pagination. Use useQuery instead.',
        );
    }

    useEffect(() => {
        if (observer.query !== query) {
            setObserver(new QueryObserver(query, true));
        }
    }, [query]);

    useEffect(() => {
        observer.setOptions(options);

        return () => {
            observer.unsubscribe();
        };
    }, [options]);

    return {
        data: query.data as (typeof query)['data'],
        dataUpdatedAt: query.__MstQueryHandler.cachedAt?.getTime(),
        error: query.error,
        isFetched: query.isFetched,
        isLoading: query.isLoading,
        isRefetching: query.isRefetching,
        isFetchingMore: query.isFetchingMore,
        query: query,
        refetch: query.refetch,
        isStale: query.__MstQueryHandler.isStale(options),
        isFetchedAfterMount: observer.isFetchedAfterMount,
    };
}

type MutationOptions<T extends Instance<MutationReturnType>> = {
    onMutate?: (data: T['data'], self: T) => void;
    meta?: { [key: string]: any };
};

export function useMutation<T extends Instance<MutationReturnType>>(
    mutation: T,
    options: MutationOptions<T> = {},
) {
    const [observer, setObserver] = useState(() => new QueryObserver(mutation, false));

    const queryClient = useContext(Context) as QueryClient<any>;
    options = { queryClient, ...options } as any;

    useEffect(() => {
        if (observer.query !== mutation) {
            setObserver(new QueryObserver(mutation, false));
        }
    }, [mutation]);

    useEffect(() => {
        observer.setOptions(options);
    }, [options]);

    const result = {
        data: mutation.data as (typeof mutation)['data'],
        error: mutation.error,
        isLoading: mutation.isLoading,
        mutation,
    };

    const mutate = useEvent(
        <TResult = any>(params: {
            request: SnapshotIn<T['variables']['request']>;
            optimisticUpdate?: () => void;
        }) => {
            const result = mutation.mutate({ ...params, ...options } as any);
            return result as Promise<{ data: T['data']; error: any; result: TResult }>;
        },
    );

    return [mutate, result] as [typeof mutate, typeof result];
}

function useRefQuery<T extends QueryReturnType>(query: T, queryClient: any) {
    const q = useRef<Instance<T>>();
    if (!q.current) {
        (q.current as any) = query.create(undefined, queryClient.config.env);
    }
    return q.current!;
}

type UseVolatileQueryOptions<T extends Instance<QueryReturnType>> = QueryOptions<T> & {
    endpoint?: (args: any) => Promise<any>;
};

export function useVolatileQuery(
    options: UseVolatileQueryOptions<Instance<typeof VolatileQuery>> = {},
) {
    const queryClient = useContext(Context)! as QueryClient<any>;
    const query = useRefQuery(VolatileQuery, queryClient);

    if (!query.__MstQueryHandler.options.endpoint) {
        query.__MstQueryHandler.options.endpoint = options.endpoint as any;
    }

    return useQuery(query, options);
}
