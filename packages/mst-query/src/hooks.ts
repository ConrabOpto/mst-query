import { IAnyType, Instance, TypeOfValue } from 'mobx-state-tree';
import { useContext, useEffect, useRef, useState } from 'react';
import { createQuery, createMutation, VolatileQuery } from './create';
import { Context } from './QueryClientProvider';
import { QueryClient } from './QueryClient';
import { QueryObserver } from './MstQueryHandler';

function mergeWithDefaultOptions(key: string, options: any, queryClient: QueryClient<any>) {
    return Object.assign({ queryClient }, (queryClient.config as any)[key], {
        enabled: true,
        ...options,
    });
}

export type QueryReturnType = ReturnType<typeof createQuery>;

export type MutationReturnType = ReturnType<typeof createMutation>;

type QueryOptions<T extends IAnyType> = {
    request?: Instance<T>['variables']['request'];
    pagination?: Instance<T>['variables']['pagination'];
    onQueryMore?: (data: Instance<T>['data'], self: Instance<T>) => void;
    staleTime?: number;
    enabled?: boolean;
    initialData?: any;
    meta?: { [key: string]: any };
};

type UseQueryOptions<T extends QueryReturnType> = QueryOptions<T>;

export function useQuery<T extends Instance<QueryReturnType>>(
    query: T,
    options: UseQueryOptions<TypeOfValue<T>> = {}
) {
    const [observer] = useState(() => new QueryObserver(query, true));

    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    useEffect(() => {
        observer.setOptions(options);

        return () => {
            observer.unsubscribe();
        };
    }, [options]);

    return {
        data: query.data as typeof query['data'],
        error: query.error,
        isFetched: query.isFetched,
        isLoading: query.isLoading,
        isRefetching: query.isRefetching,
        isFetchingMore: query.isFetchingMore,
        query: query,
        refetch: query.refetch,
        cachedAt: query.__MstQueryHandler.cachedAt,
    };
}

type MutationOptions<T extends IAnyType> = {
    onMutate?: (data: Instance<T>['data'], self: Instance<T>) => void;
    meta?: { [key: string]: any };
};

type UseMutationOptions<T extends MutationReturnType> = MutationOptions<T>;

export function useMutation<T extends MutationReturnType>(
    mutation: Instance<T>,
    options: UseMutationOptions<T> = {}
) {
    const [observer] = useState(() => new QueryObserver(mutation, false));

    const queryClient = useContext(Context) as QueryClient<any>;
    options = { queryClient, ...options } as any;

    useEffect(() => {
        observer.setOptions(options);
    }, [options]);

    const result = {
        data: mutation.data as typeof mutation['data'],
        error: mutation.error,
        isLoading: mutation.isLoading,
        mutation,
    };

    const mutate = (params: { request: any; optimisticResponse?: any }) => {
        mutation.mutate({ ...params, ...options });
    };

    return [mutate, result] as [typeof mutate, typeof result];
}

function useRefQuery<T extends QueryReturnType>(query: T, queryClient: any) {
    const q = useRef<Instance<T>>();
    if (!q.current) {
        (q.current as any) = query.create(undefined, queryClient.config.env);
    }
    return q.current!;
}

type UseVolatileQueryOptions<T extends QueryReturnType> = UseQueryOptions<T> & {
    endpoint?: (args: any) => Promise<any>;
};

export function useVolatileQuery(options: UseVolatileQueryOptions<typeof VolatileQuery> = {}) {
    const queryClient = useContext(Context)! as QueryClient<any>;
    const query = useRefQuery(VolatileQuery, queryClient);
    const [observer] = useState(() => new QueryObserver(query, true));

    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    useEffect(() => {
        if (options.endpoint) {
            query.__MstQueryHandler.options.endpoint = options.endpoint;
        }

        observer.setOptions(options);

        return () => {
            observer.unsubscribe();
        };
    }, [options]);

    return {
        data: query.data as typeof query['data'],
        error: query.error,
        isFetched: query.isFetched,
        isLoading: query.isLoading,
        isRefetching: query.isRefetching,
        isFetchingMore: query.isFetchingMore,
        query: query,
        refetch: query.refetch,
        cachedAt: query.__MstQueryHandler.cachedAt,
    };
}
