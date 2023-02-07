import { IAnyType, Instance, TypeOfValue } from 'mobx-state-tree';
import { useContext, useEffect, useState } from 'react';
import { createQuery, createMutation } from './create';
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

type QueryOptions<T extends IAnyType, QA extends QueryAction> = {
    request?: Parameters<QA>[0] extends undefined ? undefined : Parameters<QA>[0];
    onFetched?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
    staleTime?: number;
    enabled?: boolean;
    initialData?: any;
};

type QueryAction = (...args: any) => any;

type UseQueryOptions<
    T extends QueryReturnType,
    QA extends QueryAction
> = QueryOptions<T, QA>;

type useQueryMoreOptions<
    T extends QueryReturnType,
    QA extends QueryAction,
    QM extends QueryAction
> = QueryOptions<T, QA> & {
    pagination?: Parameters<QM>[1];
};

export function useQuery<T extends Instance<QueryReturnType>, QA extends QueryAction>(
    query: T,
    queryAction: QA,
    options: UseQueryOptions<TypeOfValue<T>, QA> = {}
) {
    const [observer] = useState(() => new QueryObserver(query, true));

    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    useEffect(() => {
        observer.setOptions(options, queryAction);

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

export function useQueryMore<
    T extends Instance<QueryReturnType>,
    QA extends QueryAction,
    QM extends QueryAction
>(
    query: T,
    queryAction: QA,
    queryMoreAction: QM,
    options: useQueryMoreOptions<TypeOfValue<T>, QA, QM> = {}
) {
    const [observer] = useState(() => new QueryObserver(query, true));

    const queryClient = useContext(Context)! as QueryClient<any>;
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    useEffect(() => {
        observer.setOptions(options, queryAction, queryMoreAction);

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
    onSuccess?: (data: Instance<T>['data'], self: Instance<T>) => void;
    onError?: (data: Instance<T>['data'], self: Instance<T>) => void;
};

type UseMutationOptions<T extends MutationReturnType> = MutationOptions<T>;

export function useMutation<T extends MutationReturnType, MA extends QueryAction>(
    mutation: Instance<T>,
    mutateAction: MA,
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

    return [mutateAction, result] as [typeof mutateAction, typeof result];
}
