'use client';
import { equal } from '@wry/equality';
import { Instance, SnapshotIn, getEnv, isAlive, isStateTreeNode } from 'mobx-state-tree';
import { useContext, useEffect, useRef, useState, type Context as ReactContext } from 'react';
import { runInAction, when } from 'mobx';
import {
    VolatileQuery,
    MutationReturnType,
    QueryReturnType,
    InfiniteQueryReturnType,
    QueryMapReturnType,
    InfiniteQueryMapReturnType,
    MutationScope,
} from './create';
import type { EntryOf, QueryResponse } from './QueryCollection';
import { Context } from './context';
import { QueryClient, type RefetchOnWindowFocus } from './QueryClient';
import {
    CacheOptions,
    EmptyPagination,
    EmptyRequest,
    isVariableEqual,
    QueryObserver,
    OptimisticRevertMode,
} from './MstQueryHandler';
import { resolvePlaceholder } from './requestKey';
import {
    useQueryErrorResetBoundary,
    type QueryErrorResetBoundaryValue,
} from './QueryErrorResetBoundary';
import { useEvent } from './utils';

function mergeWithDefaultOptions(key: string, options: any, queryClient: QueryClient<any>) {
    return Object.assign({ queryClient }, (queryClient.config as any)[key], {
        enabled: true,
        ...options,
    });
}

// Queries belong to the client that created them, which may not be the one in the default context
function useOwningClient(source: any) {
    const contextClient = useContext(Context);
    const owner = source.isQueryCollection
        ? getEnv(source).queryClient
        : source.__MstQueryHandler.queryClient;
    return (owner ?? contextClient) as QueryClient<any>;
}

type Collection = Instance<QueryMapReturnType | InfiniteQueryMapReturnType>;
type QuerySource =
    Instance<QueryReturnType | InfiniteQueryReturnType> | Collection | EntryOf<Collection>;
type Entry<T> = EntryOf<T>;
type ResultQuery<T> = T extends Collection ? Entry<T> | undefined : T;
type ChangedOptions<T> = {
    prevRequest: Exclude<
        Entry<T> extends { variables: { request: infer R } } ? R : never,
        undefined
    >;
} & (Entry<T> extends { variables: { pagination: infer P } }
    ? { prevPagination: Exclude<P, undefined> }
    : {});
type PlaceholderData<T> = T | SnapshotIn<T> | Record<string, unknown> | readonly unknown[];

type QueryOptions<T extends QuerySource> = {
    request?: SnapshotIn<Entry<T>['variables']['request']>;
    /** Separate independent consumers of an otherwise identical request. */
    scope?: string;
    refetchOnMount?: 'always' | 'never' | 'if-stale';
    /** Controls singleton updates; query maps always select by request identity. */
    refetchOnChanged?:
        'all' | 'request' | 'pagination' | 'none' | ((options: ChangedOptions<T>) => boolean);
    staleTime?: number;
    refetchOnWindowFocus?: RefetchOnWindowFocus<Entry<T>>;
    refetchInterval?: number | false | ((query: Entry<T>) => number | false | undefined);
    refetchIntervalInBackground?: boolean;
    enabled?: boolean;
    initialData?: any;
    initialDataUpdatedAt?: number;
    placeholderData?:
        | PlaceholderData<Entry<T>['data']>
        | ((previousData: Entry<T>['data']) => PlaceholderData<Entry<T>['data']> | undefined);
    meta?: Record<string, any>;
    /** Throw errors to the nearest error boundary. Defaults to false. */
    throwOnError?: ThrowOnError<Entry<T>>;
} & CacheOptions;

export type ThrowOnError<TQuery = any> = boolean | ((error: any, query: TQuery) => boolean);

function useEntry<T extends QuerySource>(
    source: T,
    options: QueryOptions<T> & { pagination?: any },
    infinite: boolean,
) {
    const client = useOwningClient(source);
    const errorResetBoundary = useQueryErrorResetBoundary();
    const suppliedCacheTime = options.cacheTime;
    options = mergeWithDefaultOptions('queryOptions', options, client);
    const collection = (source as any).isQueryCollection ? (source as Collection) : undefined;
    const isMap = !!collection || (source as any).__MstQueryHandler?.isQueryMap;
    if (isMap && suppliedCacheTime === undefined)
        options.cacheTime = collection?.__cacheTime ?? client.queryMapCacheTime;
    if (!!source.isInfinite !== infinite) {
        throw new Error(
            infinite
                ? 'useInfiniteQuery should be used with a query that has pagination. Use useQuery instead.'
                : 'useQuery should be used with a query that does not have pagination. Use useInfiniteQuery instead.',
        );
    }
    const key = collection ? collection.__getKey(options.request, options.scope) : '';
    const query: any = collection ? collection.get(options.request, options.scope) : source;
    if (!isMap) {
        (options as any).request = options.request ?? EmptyRequest;
        (options as any).pagination = options.pagination ?? EmptyPagination;
    }
    const [observer, setObserver] = useState<QueryObserver>();
    const previousData = useRef<
        { source: T; data: any; handler: QueryObserver['handler'] } | undefined
    >(undefined);
    const placeholder = useRef<{ source: T; key: string; request: any; data: any } | undefined>(
        undefined,
    );

    // Creating/attaching MST entries and starting requests happens only after commit.
    useEffect(() => {
        const next = runInAction(() => {
            const entry: any = collection ? collection.getOrCreate(options) : source;
            const observer = new QueryObserver(entry, true);
            observer.setOptions({
                ...options,
                request: isMap ? (entry.variables.request ?? EmptyRequest) : options.request,
                pagination: isMap
                    ? (entry.variables.pagination ?? EmptyPagination)
                    : options.pagination,
            });
            setObserver(observer);
            return observer;
        });
        return () => next.unmount();
    }, [source, key]);

    useEffect(() => {
        // An observer unmounted by <Activity> is replaced on resume and must not resubscribe.
        if (observer?.isMounted && observer.query === query) {
            observer.setOptions({
                ...options,
                request: isMap ? (query.variables.request ?? EmptyRequest) : options.request,
                pagination: isMap
                    ? (query.variables.pagination ?? EmptyPagination)
                    : options.pagination,
            });
        }
    }, [observer, query, options]);

    // Query-owned wrappers may die even when their referenced entities survive.
    if (isStateTreeNode(previousData.current?.data) && !isAlive(previousData.current.data)) {
        previousData.current = undefined;
    }
    if (isStateTreeNode(placeholder.current?.data) && !isAlive(placeholder.current.data)) {
        placeholder.current = undefined;
    }

    let data = query?.data ?? null;
    let placeholderOwner: QueryObserver['handler'] | undefined;
    const cached = options.cacheKey
        ? client.queryStore.getQueryData(
              collection?.__entryType ?? query.__MstQueryHandler.type,
              options.cacheKey,
          )
        : undefined;
    const isHydrating = !query?.cachedAt && !!cached;
    const hasInitialData = data == null && !query?.cachedAt && options.initialData != null;
    if (data != null) {
        previousData.current = { source, data, handler: query.__MstQueryHandler };
        placeholder.current = undefined;
    } else if (isHydrating || hasInitialData) {
        const type = collection ? collection.__entryType : query?.__MstQueryHandler.type;
        data = resolvePlaceholder(
            type!.properties.data,
            cached?.data ?? options.initialData,
            client.rootStore,
        );
    } else if (
        options.enabled &&
        (!query?.error || (!isMap && !isVariableEqual(query.variables.request, options.request))) &&
        options.placeholderData !== undefined
    ) {
        if (isMap) placeholderOwner = previousData.current?.handler;
        if (
            placeholder.current?.source !== source ||
            placeholder.current?.key !== key ||
            (!isMap && !isVariableEqual(placeholder.current?.request, options.request))
        ) {
            const previous =
                previousData.current?.source === source ||
                previousData.current?.handler.type ===
                    (collection?.__entryType ?? query.__MstQueryHandler.type)
                    ? previousData.current?.data
                    : null;
            const value =
                typeof options.placeholderData === 'function'
                    ? (options.placeholderData as any)(previous)
                    : options.placeholderData;
            const type = collection ? collection.__entryType : query?.__MstQueryHandler.type;
            placeholder.current = {
                source,
                key,
                request: options.request,
                data: resolvePlaceholder(type!.properties.data, value, client.rootStore),
            };
        }
        data = placeholder.current.data ?? null;
        if (!isMap && typeof options.placeholderData === 'function') {
            options = { ...options, placeholderData: () => data };
        }
    }

    useEffect(() => placeholderOwner?.retainPlaceholder(), [placeholderOwner]);
    useEffect(() => errorResetBoundary.clearReset(), [errorResetBoundary]);

    const refetch = useEvent((params: Parameters<T['refetch']>[0] = {}) =>
        source.refetch((isMap ? { ...options, ...params } : params) as any),
    );
    const error = isHydrating || hasInitialData ? null : (query?.error ?? null);
    if (
        error &&
        !query.isLoading &&
        !errorResetBoundary.isReset() &&
        (typeof options.throwOnError === 'function'
            ? options.throwOnError(error, query)
            : options.throwOnError)
    ) {
        throw error;
    }
    return {
        data: data as Entry<T>['data'],
        dataUpdatedAt: query?.__MstQueryHandler.cachedAt?.getTime(),
        error,
        /** The query failed and has no data to show. */
        isLoadingError: !!error && query.data == null,
        /** The query failed but still has data from an earlier fetch. */
        isRefetchError: !!error && query.data != null,
        isFetched: query?.isFetched ?? false,
        isLoading: query?.isLoading ?? (!!options.enabled && !hasInitialData && !isHydrating),
        isRefetching: query?.isRefetching ?? false,
        query: query as ResultQuery<T>,
        refetch: isMap ? refetch : (query.refetch as T['refetch']),
        isStale: query?.__MstQueryHandler.isStale(options) ?? false,
        isFetchedAfterMount: (observer?.query === query && observer?.isFetchedAfterMount) || false,
    };
}

export function useQuery<T extends QuerySource>(source: T, options: QueryOptions<T> = {}) {
    return useEntry(source, options, false);
}

type InfiniteQueryOptions<T extends QuerySource> = QueryOptions<T> & {
    /** Initializes maps once; singleton queries also react to pagination changes. */
    pagination?: Entry<T> extends { variables: { pagination: infer P } } ? SnapshotIn<P> : never;
};

export function useInfiniteQuery<T extends QuerySource>(
    source: T,
    options: InfiniteQueryOptions<T> = {},
) {
    const queryMore = useEvent(
        (
            params: {
                pagination?: InfiniteQueryOptions<T>['pagination'];
                meta?: Record<string, any>;
            } = {},
        ) =>
            (source as any).queryMore({
                request: options.request,
                scope: options.scope,
                meta: options.meta,
                ...params,
            }) as Promise<QueryResponse<Entry<T>>>,
    );
    const result = useEntry(source, options, true);
    return { ...result, isFetchingMore: (result.query as any)?.isFetchingMore ?? false, queryMore };
}

// Avoids refetching, or evicting a map entry, right after a suspended component mounts
const MIN_SUSPENSE_TIME = 1000;

type SuspenseSource =
    | Instance<QueryReturnType>
    | Instance<QueryMapReturnType>
    | EntryOf<Instance<QueryMapReturnType>>;

type SuspenseInfiniteSource =
    | Instance<InfiniteQueryReturnType>
    | Instance<InfiniteQueryMapReturnType>
    | EntryOf<Instance<InfiniteQueryMapReturnType>>;

type SuspenseOmittedOptions =
    | 'enabled'
    | 'initialData'
    | 'initialDataUpdatedAt'
    | 'placeholderData'
    | 'cacheKey'
    | 'cacheTime'
    | 'throwOnError';

type SuspenseQueryOptions<T extends SuspenseSource> = Omit<QueryOptions<T>, SuspenseOmittedOptions>;

type SuspenseInfiniteQueryOptions<T extends SuspenseInfiniteSource> = Omit<
    InfiniteQueryOptions<T>,
    SuspenseOmittedOptions
>;

type WithSuspenseData<TResult, T extends QuerySource> = TResult & {
    data: NonNullable<Entry<T>['data']>;
    query: Entry<T>;
};

export function useSuspenseQuery<T extends SuspenseSource>(
    source: T,
    options: SuspenseQueryOptions<T> = {},
) {
    return useSuspenseEntry(source, options, false) as WithSuspenseData<
        ReturnType<typeof useQuery<T>>,
        T
    >;
}

export function useSuspenseInfiniteQuery<T extends SuspenseInfiniteSource>(
    source: T,
    options: SuspenseInfiniteQueryOptions<T> = {},
) {
    return useSuspenseEntry(source, options, true) as WithSuspenseData<
        ReturnType<typeof useInfiniteQuery<T>>,
        T
    >;
}

function useSuspenseEntry(source: any, options: any, infinite: boolean) {
    const queryClient = useOwningClient(source);
    const errorResetBoundary = useQueryErrorResetBoundary();
    const staleTime = Math.max(
        options.staleTime ?? queryClient.config.queryOptions?.staleTime ?? 0,
        MIN_SUSPENSE_TIME,
    );
    const collection = source.isQueryCollection ? source : undefined;
    const map = collection ?? source.__MstQueryHandler.collection;
    const cacheTime = map
        ? Math.max(map.__cacheTime ?? queryClient.queryMapCacheTime, MIN_SUSPENSE_TIME)
        : undefined;
    const hookOptions = {
        ...options,
        staleTime,
        // Suspense throws only errors without data to show, below.
        throwOnError: false,
        ...(cacheTime === undefined ? {} : { cacheTime }),
    };
    // `infinite` is fixed per call site, so the hook order doesn't change.
    const result: any = infinite
        ? useInfiniteQuery(source, hookOptions)
        : useQuery(source, hookOptions);

    const query: any = collection ? collection.get(options.request, options.scope) : source;
    const isRequestEqual =
        !!query && (!!map || isVariableEqual(query.variables.request, options.request));
    if (isRequestEqual) {
        if (query.data != null) {
            return result;
        }
        if (query.isLoading && query.__MstQueryHandler.promise) {
            throw untilData(query, query.__MstQueryHandler.promise);
        }
        if (query.error && !errorResetBoundary.isReset()) {
            throw query.error;
        }
    }

    throw suspendQuery(source, { ...options, cacheTime }, errorResetBoundary);
}

const pendingSuspensions = new WeakMap<
    object,
    Map<string, { request: any; promise: Promise<void> }>
>();

function suspendQuery(
    source: any,
    options: any,
    errorResetBoundary: QueryErrorResetBoundaryValue,
) {
    const { request, scope, pagination, meta, cacheTime } = options;
    const collection = source.isQueryCollection ? source : undefined;
    const owner = collection ?? source.__MstQueryHandler;
    // A map can suspend on several entries at once; a singleton has one slot.
    const slot = collection ? collection.__getKey(request, scope) : '';
    let pending = pendingSuspensions.get(owner);
    if (!pending) {
        pending = new Map();
        pendingSuspensions.set(owner, pending);
    }
    const current = pending.get(slot);
    if (current && (collection || equal(current.request, request))) {
        return current.promise;
    }

    // Start outside render, so components observing the query aren't updated while rendering
    const entry = { request, promise: undefined as unknown as Promise<void> };
    entry.promise = Promise.resolve()
        .then(() => {
            let query = source;
            let fetch: Promise<unknown>;
            if (collection) {
                fetch = collection.query({ request, scope, pagination, meta, cacheTime });
                query = collection.get(request, scope);
            } else if (source.__MstQueryHandler.isQueryMap) {
                fetch = source.query({ meta, cacheTime });
            } else {
                if (!isVariableEqual(source.variables.request, request)) {
                    source.setData(null);
                }
                source.query({ request, pagination, meta });
                fetch = source.__MstQueryHandler.promise;
            }
            return untilData(query, fetch).then(() => {
                // A failed retry is thrown again rather than retried in a loop.
                if (query.error) errorResetBoundary.clearReset();
            });
        })
        .finally(() => {
            if (pending.get(slot) === entry) {
                pending.delete(slot);
            }
        });
    pending.set(slot, entry);
    return entry.promise;
}

const dataPromises = new WeakMap<Promise<unknown>, Promise<void>>();

// Like the fetch, but also settles once data is set while it's in flight, e.g. by setData
function untilData(query: any, fetch: Promise<unknown>) {
    let promise = dataPromises.get(fetch);
    if (!promise) {
        const hasData = when(() => !isAlive(query) || query.data != null);
        promise = Promise.race([fetch, hasData])
            .then(noop, noop)
            .finally(() => hasData.cancel());
        dataPromises.set(fetch, promise);
    }
    return promise;
}

const noop = () => {};

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
        if (observer.query === mutation) {
            observer.setOptions(options);
        }
    }, [observer, mutation, options]);

    useEffect(() => {
        return () => {
            observer.unmount();
        };
    }, [observer]);

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

        useEffect(() => {
            query.__MstQueryHandler.options.endpoint = options.endpoint as any;
        }, [query, options.endpoint]);

        return useQuery(query, options);
    };
}

export const useVolatileQuery = createUseVolatileQuery(Context);
