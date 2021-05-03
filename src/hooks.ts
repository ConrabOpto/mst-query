import { Instance, isStateTreeNode, SnapshotIn } from 'mobx-state-tree';
import { useEffect, useState } from 'react';
import { create, createAndRun } from './create';
import { SubscriptionModelType } from './SubscriptionModel';
import type { QueryReturnType, MutationReturnType, SubscriptionReturnType } from './utilityTypes';
import queryCache from './cache';

type Options = {
    onRequestSnapshot?: (snapshot: any) => any;
    afterCreate?: (self: any) => any;
    key?: string;
};

type UseQueryOptions<P extends QueryReturnType> = Options & {
    data?: SnapshotIn<P>['data'];
    request?: SnapshotIn<P>['request'];
    env?: SnapshotIn<P>['env'];
    initialResult?: any;
    onFetched?: (data: Instance<P>['data'], self: Instance<P>) => void;
};

export function useLazyQuery<P extends QueryReturnType>(
    query: P,
    options: UseQueryOptions<P> = {}
) {
    const { key } = options;
    const [q, setQuery] = useState(() => create(query, options));

    useEffect(() => {
        return () => {
            if (isStateTreeNode(q)) {
                queryCache.removeQuery(q);
            }
        };
    }, []);

    useEffect(() => {
        if (key && q.isFetched) {
            const newQuery = create(query, options);
            setQuery(newQuery);
            if (isStateTreeNode(q)) {
                queryCache.removeQuery(q);
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

export function useQuery<P extends QueryReturnType>(query: P, options: UseQueryOptions<P> = {}) {
    const { key } = options;
    const [q, setQuery] = useState(() => createAndRun(query, options));

    useEffect(() => {
        return () => {
            if (isStateTreeNode(q)) {
                queryCache.removeQuery(q);
            }
        };
    }, []);

    useEffect(() => {
        if (key && q.isFetched) {
            const newQuery = create(query, options);
            setQuery(newQuery);
            if (isStateTreeNode(q)) {
                queryCache.removeQuery(q);
            }
            (newQuery as any).run();
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

type UseMutationOptions<P extends MutationReturnType> = Options & {
    data?: SnapshotIn<P>['data'];
    request?: SnapshotIn<P>['request'];
    env?: SnapshotIn<P>['env'];
};

export function useMutation<P extends MutationReturnType>(
    query: P,
    options: UseMutationOptions<P> = {}
) {
    const [m] = useState(() => create(query, options));

    useEffect(() => {
        return () => {
            if (isStateTreeNode(m)) {
                queryCache.removeQuery(m);
            }
        };
    }, []);

    const result = {
        ...m,
        mutation: m,
    };

    return [m.run, result] as [typeof m['run'], typeof result];
}

type UseSubscriptionOptions<P extends SubscriptionReturnType> = Options & {
    onUpdate?: any;
    data?: SnapshotIn<P>['data'];
    env?: SnapshotIn<P>['env'];
};

export function useSubscription<P extends SubscriptionReturnType>(
    query: P,
    options: UseSubscriptionOptions<P> = {}
): Instance<SubscriptionModelType> {
    const { key } = options;
    const [s, setSubscription] = useState(() => createAndRun(query, options));

    useEffect(() => {
        return () => {
            if (isStateTreeNode(s)) {
                queryCache.removeQuery(s);
            }
        };
    }, []);

    useEffect(() => {
        if (key) {
            const newSubscription = create(query, options);
            setSubscription(newSubscription);
            if (isStateTreeNode(s)) {
                queryCache.removeQuery(s);
            }
            (newSubscription as any).run();
        }
    }, [key]);

    return { ...s, subscription: s };
}
