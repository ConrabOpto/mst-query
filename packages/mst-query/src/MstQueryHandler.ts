import { equal } from '@wry/equality';
import { makeObservable, observable, action } from 'mobx';
import {
    addDisposer,
    getEnv,
    getIdentifier,
    getRoot,
    getSnapshot,
    getType,
    Instance,
    IPatchRecorder,
    isReferenceType,
    isStateTreeNode,
    protect,
    recordPatches,
    unprotect,
} from 'mobx-state-tree';
import { MutationReturnType } from './create';
import { merge } from './merge';
import { QueryClient, EndpointType } from './QueryClient';

export const EmptyRequest = Symbol('EmptyRequest');
export const EmptyPagination = Symbol('EmptyPagination');

type QueryHookOptions = {
    request?: any;
    staleTime?: number;
    pagination?: any;
    enabled?: boolean;
    isMounted?: any;
    isRequestEqual?: boolean;
    refetchOnMount?: 'always' | 'never' | 'if-stale';
    refetchOnChanged?: 'all' | 'request' | 'pagination' | 'none';
};

type NotifyOptions = {
    onMutate?: boolean;
};

type OnResponseOptions = {
    shouldUpdate?: boolean;
    updateRecorder?: IPatchRecorder;
};

export class DisposedError extends Error {}

export class QueryObserver {
    query: any;
    options: any;
    isQuery: boolean;
    isMounted = false;
    isFetchedAfterMount = false;

    constructor(query: any, isQuery: boolean) {
        this.query = query;
        this.isQuery = isQuery;

        makeObservable(this, {
            isFetchedAfterMount: observable,
        });
    }

    subscribe() {
        if (this.query) {
            this.query.__MstQueryHandler.addQueryObserver(this);
        }
    }

    unsubscribe() {
        if (this.query) {
            this.query.__MstQueryHandler.removeQueryObserver(this);
        }
    }

    setOptions(options: any) {
        this.options = options;

        this.subscribe();

        if (this.isQuery) {
            options.isMounted = this.isMounted;

            if (options.initialData) {
                const isStale = isDataStale(options.initialDataUpdatedAt, options.staleTime);
                if (!isStale) {
                    this.query.__MstQueryHandler.hydrate(options);
                } else {
                    this.query.__MstQueryHandler.queryWhenChanged(options);
                }
            } else {
                if (!options.isRequestEqual) {
                    this.query.setData(null);
                }

                this.query.__MstQueryHandler.queryWhenChanged(options);
            }
        }

        if (!this.isMounted) {
            this.isMounted = true;
        }
    }
}

function subscribe(target: any, options: any) {
    const observer = new QueryObserver(target, false);
    observer.setOptions(options);
    observer.subscribe();
    addDisposer(target, () => {
        observer.unsubscribe();
    });
}

export function onMutate<T extends Instance<MutationReturnType>>(
    target: T,
    callback: (data: T['data'], self: T) => void,
) {
    subscribe(target, {
        onMutate: (data: any, self: any) => {
            const root = getRoot(self);
            unprotect(root);
            callback(data, self);
            protect(root);
        },
    });
}

export class MstQueryHandler {
    isLoading = false;
    isRefetching = false;
    isFetchingMore = false;
    isFetched = false;
    error: any = null;
    queryObservers = [] as any[];

    options: {
        endpoint: EndpointType;
        onQueryMore?: (options: any) => void;
        meta?: { [key: string]: any };
    };

    previousVariables: any;
    model: any;
    type: any;
    queryClient!: QueryClient<any>;

    abortController?: AbortController;

    cachedAt?: Date;
    markedAsStale = false;

    isDisposed = false;

    constructor(model: any, options?: any) {
        this.model = model;
        this.type = getType(model) as any;

        this.options = options ?? {};
        this.queryClient = getEnv(this.model).queryClient;

        this.model.$treenode.registerHook('afterCreate', () => this.onAfterCreate());
        this.model.$treenode.registerHook('beforeDestroy', () => this.onBeforeDestroy());

        makeObservable(this, {
            isLoading: observable,
            isRefetching: observable,
            isFetchingMore: observable,
            isFetched: observable,
            error: observable,
            hydrate: action.bound,
            setData: action.bound,
            setError: action.bound,
            run: action.bound,
            query: action.bound,
            mutate: action.bound,
            queryMore: action.bound,
            refetch: action.bound,
            abort: action.bound,
            onAfterCreate: action.bound,
            onBeforeDestroy: action.bound,
        });
    }

    run(options: any = {}) {
        const endpoint = this.options.endpoint ?? this.queryClient.config.queryOptions?.endpoint;

        if (!endpoint) {
            throw new Error('No query endpoint or global endpoint configured');
        }

        this.setVariables({ request: options.request, pagination: options.pagination });
        this.options.meta = options.meta;

        if (this.isLoading && this.abortController) {
            this.abortController.abort();
        }

        const abortController = new AbortController();
        this.abortController = abortController;

        this.isLoading = true;
        this.error = null;

        const opts = {
            ...options,
            request: this.model.variables.request,
            pagination: this.model.variables.pagination,
            meta: options.meta ?? {},
            signal: this.abortController.signal,
            setData: this.model.setData,
            query: this.model,
        };

        return endpoint(opts).then((result: any) => {
            if (abortController?.signal.aborted || this.isDisposed) {
                throw new DisposedError();
            }
            return result;
        });
    }

    async queryWhenChanged(options: QueryHookOptions) {
        if (this.isDisposed) {
            return;
        }

        if (!options.enabled) {
            return;
        }

        if (!options.isMounted) {
            const notInitialized = !this.isFetched && !this.isLoading && !this.cachedAt;
            if (notInitialized) {
                return this.model.query(options);
            }

            if (options.refetchOnMount === 'never') {
                return;
            }

            if (options.refetchOnMount === 'always') {
                return this.model.refetch(options);
            }

            if (!this.isStale(options)) {
                return;
            }

            return this.model.refetch(options);
        }

        if (!options.isRequestEqual) {
            return this.model.query(options);
        }

        const refetchPaginationOnChanged =
            options.refetchOnChanged === 'all' || options.refetchOnChanged === 'pagination';
        if (
            refetchPaginationOnChanged &&
            options.pagination !== EmptyPagination &&
            this.isFetched
        ) {
            const isPaginationEqual = equal(options.pagination, this.model.variables.pagination);
            if (!isPaginationEqual) {
                return this.model.queryMore(options);
            }
        }
    }

    query(options: any = {}): Promise<() => any> {
        return this.run(options).then(
            (result) => this.onSuccess(result),
            (err) => this.onError(err),
        );
    }

    mutate(options: any = {}): Promise<() => any> {
        const { optimisticUpdate } = options;
        let updateRecorder: IPatchRecorder;
        if (optimisticUpdate) {
            updateRecorder = recordPatches(getRoot(this.model));
            optimisticUpdate();
            updateRecorder.stop();
        }
        return this.run(options).then(
            (result) => this.onSuccess(result, { updateRecorder }),
            (err) => this.onError(err, { updateRecorder }),
        );
    }

    queryMore(options: any = {}): Promise<() => any> {
        this.isFetchingMore = true;

        options.request = options.request ?? this.model.variables.request;
        options.pagination = options.pagination ?? this.model.variables.pagination;
        options.meta = options.meta ?? this.options.meta;

        return this.run(options).then(
            (result) => this.onSuccess(result, { shouldUpdate: false }),
            (err) => this.onError(err, { shouldUpdate: false }),
        );
    }

    refetch(options: any = {}): Promise<() => any> {
        this.isRefetching = true;

        options.request = options.request ?? this.model.variables.request;
        options.pagination = options.pagination ?? this.model.variables.pagination;
        options.meta = options.meta ?? this.options.meta;

        return this.run(options).then(
            (result) => this.onSuccess(result),
            (err) => this.onError(err),
        );
    }

    invalidate() {
        this.markedAsStale = true;

        if (this.queryObservers.length > 0) {
            this.model.refetch();
        }
    }

    onSuccess(result: any, options: OnResponseOptions = {}) {
        const { shouldUpdate = true, updateRecorder } = options;
        return (): { data: any; error: any; result: any } => {
            if (updateRecorder) {
                updateRecorder.undo();
            }

            if (this.isDisposed) {
                return { data: null, error: null, result: null };
            }

            if (this.markedAsStale) {
                this.markedAsStale = false;
            }

            let data;
            if (shouldUpdate) {
                data = this.setData(result);
            } else {
                data = this.prepareData(result);
            }
            this.cachedAt = new Date();

            if (this.error) {
                this.error = null;
            }

            if (this.isLoading) {
                this.isLoading = false;
            }

            if (this.isRefetching) {
                this.isRefetching = false;
            }

            if (this.isFetchingMore) {
                this.isFetchingMore = false;
                this.options.onQueryMore?.({
                    data,
                    pagination: this.model.variables.pagination,
                    request: this.model.variables.request,
                    query: this.model,
                });
            }

            if (!this.isFetched) {
                this.isFetched = true;
            }
            this.queryObservers.forEach((observer) => {
                observer.isFetchedAfterMount = true;
            });

            if (this.model.isMutation) {
                this.notify({ onMutate: true }, data, this.model);
            }

            return { data, error: null, result };
        };
    }

    onError(err: any, options: OnResponseOptions = {}) {
        const { shouldUpdate = true, updateRecorder } = options;
        return (): { data: any; error: any; result: any } => {
            if (updateRecorder) {
                updateRecorder.undo();
            }

            if (this.isDisposed) {
                return { data: null, error: null, result: null };
            }

            if (err instanceof DisposedError) {
                return { data: null, error: null, result: null };
            }

            if (shouldUpdate) {
                this.setData(null);
            }

            this.error = err;

            if (this.isLoading) {
                this.isLoading = false;
            }

            if (this.isRefetching) {
                this.isRefetching = false;
            }

            if (this.isFetchingMore) {
                this.isFetchingMore = false;
            }

            return { data: null, error: err, result: null };
        };
    }

    addQueryObserver(queryObserver: any) {
        if (!this.queryObservers.includes(queryObserver)) {
            this.queryObservers.push(queryObserver);
        }
    }

    removeQueryObserver(queryObserver: any) {
        this.queryObservers = this.queryObservers.filter((observer) => observer !== queryObserver);
    }

    notify(notifyOptions: NotifyOptions, ...args: any[]) {
        for (let observer of this.queryObservers) {
            for (let key of Object.keys(notifyOptions)) {
                observer.options[key]?.(...args);
            }
        }
    }

    abort() {
        this.abortController?.abort();
        this.abortController = undefined;

        if (!this.isDisposed) {
            this.revertVariables();
        }
    }

    setError(error: any) {
        this.error = error;
    }

    setVariables(variables: any) {
        let request = variables.request ?? EmptyRequest;
        let pagination = variables.pagination ?? EmptyPagination;

        // Handle request and pagination being optional models
        if (request === EmptyRequest && this.model.variables.request) {
            request = this.model.variables.request;
        }
        if (pagination === EmptyPagination && this.model.variables.pagination) {
            pagination = this.model.variables.pagination;
        }

        this.model.__MstQueryHandlerAction(() => {
            this.model.variables = { request, pagination };
        });
    }

    revertVariables() {
        this.model.__MstQueryHandlerAction(() => {
            this.model.variables = this.previousVariables;
        });
    }

    prepareData(data: any) {
        return merge(data, this.type.properties.data, this.queryClient.config.env, true);
    }

    setData(data: any) {
        this.model.__MstQueryHandlerAction(() => {
            if (isStateTreeNode(data)) {
                if (isReferenceType(this.type.properties.data)) {
                    this.model.data = getIdentifier(data);
                } else {
                    this.model.data = getSnapshot(data);
                }
            } else {
                this.model.data = merge(
                    data,
                    this.type.properties.data,
                    this.queryClient.config.env,
                );
            }
        });

        return this.model.data;
    }

    hydrate(options: any) {
        const { initialData, request, pagination } = options;

        this.setVariables({ request, pagination });
        this.options.meta = options.meta;

        this.isLoading = false;

        this.setData(initialData);
        this.cachedAt = new Date();
    }

    isStale(options: any) {
        if (!this.cachedAt) {
            return false;
        }

        return this.markedAsStale || isDataStale(this.cachedAt.getTime(), options.staleTime);
    }

    onAfterCreate() {
        this.queryClient.queryStore.setQuery(this.model);
    }

    onBeforeDestroy() {
        this.queryClient.queryStore.removeQuery(this.model);
        this.isDisposed = true;
        this.abort();
    }
}

function isDataStale(cachedAt?: number, staleTime: number = 0) {
    const now = Date.now();
    const cachedTime = cachedAt ?? now;
    return now - cachedTime >= staleTime;
}
