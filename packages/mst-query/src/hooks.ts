'use client';
import { equal } from '@wry/equality';
import { Instance, SnapshotIn, isAlive, isStateTreeNode } from 'mobx-state-tree';
import { useContext, useEffect, useRef, useState, type Context as ReactContext } from 'react';
import {
    VolatileQuery,
    MutationReturnType,
    QueryReturnType,
    InfiniteQueryReturnType,
    MutationScope,
} from './create';
import { Context } from './context';
import { QueryClient } from './QueryClient';
import { CacheOptions, EmptyPagination, EmptyRequest, isVariableEqual, QueryObserver, OptimisticRevertMode } from './MstQueryHandler';
import { useEvent } from './utils';

function mergeWithDefaultOptions(key: string, options: any, queryClient: QueryClient<any>) {
    return Object.assign({ queryClient }, (queryClient.config as any)[key], {
        enabled: true,
        ...options,
    });
}

// Queries belong to the client that created them, which may not be the one in the default context
function useOwningClient(query: any) {
    const contextClient = useContext(Context);
    return (query.__MstQueryHandler.queryClient ?? contextClient) as QueryClient<any>;
}

type PlaceholderData<T> = T | SnapshotIn<T> | Record<string, unknown> | readonly unknown[];

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
    /** Poll at this interval in milliseconds, or return false/undefined to stop. */
    refetchInterval?: number | false | ((query: T) => number | false | undefined);
    /** Continue polling while the document is hidden. Defaults to false. */
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
    initialData?: any;
    initialDataUpdatedAt?: number;
    placeholderData?:
        | PlaceholderData<T['data']>
        | ((previousData: T['data']) => PlaceholderData<T['data']> | undefined);
    meta?: { [key: string]: any };
} & CacheOptions;

export function useQuery<T extends Instance<QueryReturnType>>(
    query: T,
    options: QueryOptions<T> = {},
) {
    const [observer, setObserver] = useState(() => new QueryObserver(query, true));
    const previousDataRef = useRef<{
        queryType: T['__MstQueryHandler']['type'];
        data: T['data'];
    } | undefined>(undefined);
    const placeholderRef = useRef<{
        query: T;
        request: QueryOptions<T>['request'];
        data: PlaceholderData<T['data']> | undefined;
    } | undefined>(undefined);

    const queryClient = useOwningClient(query);
    options = mergeWithDefaultOptions('queryOptions', options, queryClient);

    (options as any).request = options.request ?? EmptyRequest;

    let data = query.data;
    const queryType = query.__MstQueryHandler.type;
    if (data != null) {
        previousDataRef.current = { queryType, data };
        placeholderRef.current = undefined;
    }
    // A query-owned wrapper can die while referenced entities remain alive.
    // Never pass that wrapper to a callback or return it during a query switch.
    if (
        isStateTreeNode(previousDataRef.current?.data) &&
        !isAlive(previousDataRef.current.data)
    ) {
        previousDataRef.current = undefined;
    }
    const lastData = previousDataRef.current;
    const previousData =
        data ?? (lastData && lastData.queryType === queryType ? lastData.data : null);
    const isRequestChanged = !isVariableEqual(query.variables.request, options.request);
    const hasCachedData =
        options.cacheKey &&
        observer.queryStore.getQueryData(query.__MstQueryHandler.type, options.cacheKey);
    // Hydration runs in an effect. Do not surface the previous request's error
    // before that effect can replace it with successful initial or cached data.
    const isHydrating =
        (observer.query !== query || !observer.isMounted) &&
        !!((options.initialData && !query.cachedAt) || hasCachedData);
    if (
        options.enabled &&
        data == null &&
        (query.error == null || isRequestChanged) &&
        !options.initialData &&
        !hasCachedData &&
        options.placeholderData !== undefined
    ) {
        const cachedPlaceholder = placeholderRef.current;
        const canReusePlaceholder =
            typeof options.placeholderData === 'function' &&
            cachedPlaceholder?.query === query &&
            !(isStateTreeNode(cachedPlaceholder.data) && !isAlive(cachedPlaceholder.data)) &&
            isVariableEqual(cachedPlaceholder.request, options.request);
        const placeholderData = canReusePlaceholder
            ? cachedPlaceholder.data
            : typeof options.placeholderData === 'function'
              ? (
                    options.placeholderData as (
                        previousData: T['data'],
                    ) => PlaceholderData<T['data']> | undefined
                )(previousData)
              : options.placeholderData;

        if (typeof options.placeholderData === 'function' && !canReusePlaceholder) {
            placeholderRef.current = {
                query,
                request: options.request,
                data: placeholderData,
            };
        }

        data = (placeholderData ?? null) as typeof data;

        // Reuse the value resolved for this render when the observer applies it to the query.
        // In particular, this avoids returning null first and resolving a reference placeholder
        // only after the effect has run.
        if (typeof options.placeholderData === 'function') {
            options = {
                ...options,
                placeholderData: () => placeholderData,
            };
        }
    }

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
        if (observer.query === query) {
            observer.setOptions(options);
        }
    }, [observer, query, options]);

    useEffect(() => {
        return () => {
            observer.unsubscribe();
        };
    }, [observer]);

    return {
        data: data as (typeof query)['data'],
        dataUpdatedAt: query.__MstQueryHandler.cachedAt?.getTime(),
        error: isHydrating ? null : query.error,
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

    const queryClient = useOwningClient(query);
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

// Avoids refetching right after a suspended component mounts
const MIN_SUSPENSE_STALE_TIME = 1000;

type SuspenseQueryOptions<T extends Instance<QueryReturnType>> = Omit<
    QueryOptions<T>,
    | 'enabled'
    | 'initialData'
    | 'initialDataUpdatedAt'
    | 'placeholderData'
    | 'cacheKey'
    | 'cacheTime'
>;

export function useSuspenseQuery<T extends Instance<QueryReturnType>>(
    query: T,
    options: SuspenseQueryOptions<T> = {},
) {
    const queryClient = useOwningClient(query);
    const staleTime = Math.max(
        options.staleTime ?? queryClient.config.queryOptions?.staleTime ?? 0,
        MIN_SUSPENSE_STALE_TIME,
    );
    const result = useQuery(query, { ...options, staleTime });

    const handler = query.__MstQueryHandler;
    const isRequestEqual = isVariableEqual(query.variables.request, options.request);
    if (isRequestEqual) {
        if (query.data != null) {
            return result as typeof result & { data: NonNullable<T['data']> };
        }
        if (handler.isLoading) {
            throw handler.promise;
        }
        if (query.error) {
            throw query.error;
        }
    }

    throw suspendQuery(query, options.request, options.meta);
}

const pendingSuspensions = new WeakMap<object, { request: any; promise: Promise<void> }>();

function suspendQuery(query: Instance<QueryReturnType>, request: any, meta: any) {
    const handler = query.__MstQueryHandler;
    const pending = pendingSuspensions.get(handler);
    if (pending && equal(pending.request, request)) {
        return pending.promise;
    }

    // Start outside render, so components observing the query aren't updated while rendering
    const entry = { request, promise: undefined as unknown as Promise<void> };
    entry.promise = Promise.resolve()
        .then(() => {
            if (!isVariableEqual(query.variables.request, request)) {
                query.setData(null);
            }
            query.query({ request, meta } as any);
            return handler.promise;
        })
        .finally(() => {
            if (pendingSuspensions.get(handler) === entry) {
                pendingSuspensions.delete(handler);
            }
        });
    pendingSuspensions.set(handler, entry);
    return entry.promise;
}

type MutationOptions<T extends Instance<MutationReturnType>> = {
    onMutate?: (data: T['data'], self: T) => void;
    meta?: { [key: string]: any };
    scope?: MutationScope;
};

export function useMutation<T extends Instance<MutationReturnType>>(
    mutation: T,
    options: MutationOptions<T> = {},
) {
    const [observer, setObserver] = useState(() => new QueryObserver(mutation, false));

    const queryClient = useOwningClient(mutation);
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
            revert?: OptimisticRevertMode;
            scope?: MutationScope;
        }) => {
            // Merge options but allow params to override (including scope)
            const result = mutation.mutate({ ...options, ...params } as any);
            return result as Promise<{ data: T['data']; error: any; result: TResult }>;
        },
    );

    return [mutate, result] as [typeof mutate, typeof result];
}

function useRefQuery<T extends QueryReturnType>(query: T, queryClient: any) {
    const q = useRef<Instance<T>>(undefined);
    if (!q.current) {
        (q.current as any) = query.create(undefined, queryClient.config.env);
    }
    return q.current!;
}

type UseVolatileQueryOptions<T extends Instance<QueryReturnType>> = QueryOptions<T> & {
    endpoint?: (args: any) => Promise<any>;
};

export function createUseVolatileQuery(context: ReactContext<QueryClient<any> | undefined>) {
    return function useVolatileQuery(
        options: UseVolatileQueryOptions<Instance<typeof VolatileQuery>> = {},
    ) {
        const queryClient = useContext(context)! as QueryClient<any>;
        const query = useRefQuery(VolatileQuery, queryClient);

        if (!query.__MstQueryHandler.options.endpoint) {
            query.__MstQueryHandler.options.endpoint = options.endpoint as any;
        }

        return useQuery(query, options);
    };
}

export const useVolatileQuery = createUseVolatileQuery(Context);
