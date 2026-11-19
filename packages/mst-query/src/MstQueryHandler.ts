import { equal } from '@wry/equality';
import {
    makeObservable,
    observable,
    observableRef,
    computed,
    action,
    actionBound,
    autorun,
} from 'mobx';
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
import type { MutationReturnType, MutationScope } from './create';
import { merge } from './merge';
import { QueryClient, EndpointType } from './QueryClient';
import { subscribeToWindowFocus } from './focus';
import { hashRequest, normalizeRequest, validateCacheTime } from './requestKey';

export const EmptyRequest = Symbol('EmptyRequest');
export const EmptyPagination = Symbol('EmptyPagination');

type QueryHookOptions = {
    request?: any;
    staleTime?: number;
    pagination?: any;
    enabled?: boolean;
    isMounted?: any;
    isRequestEqual?: boolean;
    isReenabled?: boolean;
    isPaginationChanged?: boolean;
    refetchOnMount?: 'always' | 'never' | 'if-stale';
    refetchOnChanged?: 'all' | 'request' | 'pagination' | 'none';
};

type NotifyOptions = {
    onMutate?: boolean;
};

export type CacheOptions = {
    cacheTime?: number;
    cacheKey?: string;
};

export type OptimisticRevertMode = 'revert-all' | 'revert-on-error' | 'revert-none';

type OnResponseOptions = {
    shouldUpdate?: boolean;
    updateRecorder?: IPatchRecorder;
    revert?: OptimisticRevertMode;
    abortController?: AbortController;
    isQueryMore?: boolean;
    request?: any;
    pagination?: any;
    requestVersion?: number;
    invalidationVersion?: number;
} & CacheOptions;

export class DisposedError extends Error {}

export class PaginationSourceError extends Error {
    constructor(name: string) {
        super(
            `Query "${name}" loaded pages both by changing the pagination option of ` +
                'useInfiniteQuery and by calling queryMore. Use one of them: change the ' +
                'pagination option, or keep it at its initial value and call queryMore.',
        );
    }
}

export type PrefetchedResponse = {
    status: 'pending' | 'success' | 'error';
    promise: Promise<any>;
    result?: any;
    cachedAt?: number;
};

export class QueryObserver {
    query: any;
    readonly handler: MstQueryHandler;
    options: any = {};
    isQuery: boolean;
    isMounted = false;
    isFetchedAfterMount = false;
    private pollingDisposer?: () => void;
    private refetchTimer?: ReturnType<typeof setInterval>;
    private refetchInterval?: number;
    private focusDisposer?: () => void;
    // The pagination option this observer last applied while enabled
    private appliedPagination: any = EmptyPagination;

    constructor(query: any, isQuery: boolean) {
        this.query = query;
        // Cleanup may run after the query's owner has destroyed the MST node.
        this.handler = query.__MstQueryHandler;
        this.isQuery = isQuery;

        makeObservable(this, {
            isFetchedAfterMount: observable,
        });
    }

    get queryStore() {
        return this.handler.queryClient.queryStore;
    }

    subscribe() {
        if (this.query) {
            this.handler.addQueryObserver(this);
        }
    }

    unsubscribe() {
        this.focusDisposer?.();
        this.focusDisposer = undefined;
        this.pollingDisposer?.();
        this.pollingDisposer = undefined;
        this.clearRefetchInterval();
        if (this.query) {
            this.handler.removeQueryObserver(this);
        }
    }

    // React can unmount effects and later remount them with the same observer instance,
    // e.g. when <Activity> hides and shows a tree. Resetting isMounted makes the next
    // setOptions apply the mount rules (staleTime, refetchOnMount) again.
    unmount() {
        this.unsubscribe();
        this.isMounted = false;
    }

    setOptions(options: any) {
        this.subscribe();

        const previousOptions = this.options;
        this.options = options;
        this.handler.extendCacheTime(options.cacheTime);

        if (this.isQuery) {
            options.isMounted = this.isMounted;

            if (!previousOptions.enabled && options.enabled) {
                options.isReenabled = true;
            }

            options.isRequestEqual = true;
            if (!this.handler.isQueryMap) {
                const refetchRequest =
                    options.refetchOnChanged === 'all' || options.refetchOnChanged === 'request';
                if (options.enabled && refetchRequest) {
                    options.isRequestEqual = isVariableEqual(
                        this.query.variables.request,
                        options.request,
                    );
                }
                if (
                    options.enabled &&
                    typeof options.refetchOnChanged === 'function' &&
                    this.query.variables.request
                ) {
                    options.isRequestEqual = !options.refetchOnChanged({
                        prevRequest: this.query.variables.request,
                        ...(this.query.variables.pagination
                            ? { prevPagination: this.query.variables.pagination }
                            : {}),
                    });
                }
                if (options.enabled) {
                    // A fixed pagination option is only an initial value, so queryMore may move on.
                    options.isPaginationChanged =
                        this.isMounted &&
                        options.pagination !== EmptyPagination &&
                        !equal(options.pagination, this.appliedPagination);
                    if (
                        options.isPaginationChanged &&
                        options.isRequestEqual &&
                        (options.refetchOnChanged === 'all' ||
                            options.refetchOnChanged === 'pagination') &&
                        this.handler.paginationSource === 'queryMore'
                    ) {
                        throw new PaginationSourceError(this.handler.type.name);
                    }
                    this.appliedPagination = options.pagination;
                }
            }

            const cacheEntry = options.cacheKey
                ? this.queryStore.getQueryData(this.handler.type, options.cacheKey)
                : undefined;

            // Initial data seeds an empty query; remounting must not overwrite cached results.
            if (
                options.initialData &&
                !options.isMounted &&
                !this.handler.cachedAt &&
                !this.handler.isLoading &&
                !cacheEntry
            ) {
                this.handler.hydrate(options.initialData, options);

                const isStale = isDataStale(options.initialDataUpdatedAt, options.staleTime);
                if (isStale) {
                    this.handler.queryWhenChanged(options);
                }
            } else if (options.cacheKey) {
                // Apply cached data when entering the cache key, not on every render.
                // Reapplying it after a failed refetch would erase the new error.
                if (
                    cacheEntry &&
                    (this.handler.isQueryMap
                        ? !this.handler.cachedAt && !this.handler.isLoading
                        : !this.isMounted || previousOptions.cacheKey !== options.cacheKey)
                ) {
                    this.handler.hydrate(cacheEntry.data, {
                        ...options,
                        initialDataUpdatedAt: cacheEntry.cachedAt,
                    });
                }

                const isStale = !cacheEntry || isDataStale(cacheEntry.cachedAt, options.staleTime);
                if (isStale || this.handler.notInitialized) {
                    if (cacheEntry) {
                        this.handler.queryWhenChanged(options);
                    } else {
                        this.queryWithPlaceholder(options, false);
                    }
                }
            } else {
                this.queryWithPlaceholder(options, true);
            }
        }

        if (!this.isMounted) {
            this.isMounted = true;
        }

        this.options = options;
        this.updatePolling();
        this.updateFocusSubscription();
    }

    private queryWithPlaceholder(options: any, clearOnRequestChange: boolean) {
        if (this.handler.isQueryMap) {
            void this.handler.queryWhenChanged(options).catch(() => {});
            return;
        }
        const previousData = this.query.data;
        if (options.placeholderData === undefined) {
            if (clearOnRequestChange && !options.isRequestEqual) this.query.setData(null);
            void this.handler.queryWhenChanged(options).catch(() => {});
            return;
        }
        void this.handler.queryWhenChanged(options).catch(() => {});
        if (
            options.enabled &&
            this.query.isLoading &&
            (!options.isRequestEqual || this.query.data == null)
        ) {
            const data =
                typeof options.placeholderData === 'function'
                    ? options.placeholderData(previousData)
                    : options.placeholderData;
            if (data !== previousData) {
                this.query.setData(data ?? null);
                this.handler.markPlaceholderData();
            }
        } else if (clearOnRequestChange && !options.isRequestEqual) {
            this.query.setData(null);
        }
    }

    private get focusOption() {
        return (
            this.options.refetchOnWindowFocus ??
            this.handler.queryClient.config.queryOptions?.refetchOnWindowFocus ??
            true
        );
    }

    private updateFocusSubscription() {
        if (
            !this.isQuery ||
            this.handler.isDisposed ||
            !this.options.enabled ||
            this.focusOption === false
        ) {
            this.focusDisposer?.();
            this.focusDisposer = undefined;
        } else if (!this.focusDisposer) {
            this.focusDisposer = subscribeToWindowFocus(() => this.onWindowFocus());
        }
    }

    private onWindowFocus() {
        if (
            !this.isMounted ||
            this.handler.isDisposed ||
            !this.options.enabled ||
            this.handler.isLoading ||
            this.handler.isFetchingMore
        ) {
            return;
        }

        const option = this.focusOption;
        const policy = typeof option === 'function' ? option(this.query) : option;
        if (
            policy === false ||
            (policy !== 'always' && this.handler.cachedAt && !this.handler.isStale(this.options))
        ) {
            return;
        }

        // Use the current variables and preserve this observer's response cache.
        // Endpoint failures are surfaced through query.error by normal refetching.
        void this.query
            .refetch({
                meta: this.options.meta,
                cacheKey: this.options.cacheKey,
                cacheTime: this.options.cacheTime,
            })
            .catch(() => {});
    }

    private clearRefetchInterval() {
        clearInterval(this.refetchTimer);
        this.refetchTimer = undefined;
        this.refetchInterval = undefined;
    }

    private updatePolling() {
        this.pollingDisposer?.();
        this.pollingDisposer = undefined;

        if (
            !this.isQuery ||
            this.query.isInfinite ||
            this.handler.isDisposed ||
            !this.options.enabled ||
            this.options.refetchInterval == null ||
            this.options.refetchInterval === false
        ) {
            this.clearRefetchInterval();
            return;
        }

        this.pollingDisposer = autorun(() => {
            const interval =
                typeof this.options.refetchInterval === 'function'
                    ? this.options.refetchInterval(this.query)
                    : this.options.refetchInterval;

            if (
                this.handler.isLoading ||
                typeof interval !== 'number' ||
                !Number.isFinite(interval) ||
                interval <= 0
            ) {
                this.clearRefetchInterval();
                return;
            }

            if (interval === this.refetchInterval) {
                return;
            }

            this.clearRefetchInterval();
            this.refetchInterval = interval;
            this.refetchTimer = setInterval(() => {
                if (this.handler.isDisposed) {
                    this.unsubscribe();
                    return;
                }
                if (
                    this.handler.isLoading ||
                    (!this.options.refetchIntervalInBackground &&
                        typeof document !== 'undefined' &&
                        document.visibilityState === 'hidden')
                ) {
                    return;
                }

                this.query.refetch({ meta: this.options.meta });
            }, interval);
        });
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
    private isQueryLoading = false;
    private pendingMutationCount = 0;
    isRefetching = false;
    isFetchingMore = false;
    pendingQueryMoreCount = 0;
    isFetched = false;
    error: any = null;
    queryObservers = [] as any[];

    options: {
        endpoint: EndpointType;
        onQueryMore?: (options: any) => void;
        meta?: { [key: string]: any };
        scope?: MutationScope;
        isMapEntry?: boolean;
    };

    previousVariables: any;
    model: any;
    type: any;
    queryClient!: QueryClient<any>;

    abortController?: AbortController;
    private requestVersion = 0;
    private invalidationVersion = 0;
    private refetchAfterInvalidation = false;
    private variablesInitialized = false;
    // The request version `data` belongs to; undefined for placeholder data
    private dataRequestVersion?: number;
    /** @internal How pages of a singleton have been loaded since its request was set. */
    paginationSource?: 'option' | 'queryMore';

    cachedAt: Date | undefined = undefined;
    markedAsStale = false;

    // Settles after the latest query run has applied its result
    promise?: Promise<void>;
    prefetchedResponse?: PrefetchedResponse;

    isDisposed = false;
    /** @internal */
    collection?: any;
    /** @internal */
    collectionKey?: string;
    private collectionScope?: string;
    private cacheTime?: number;
    private evictionTimer?: ReturnType<typeof setTimeout>;
    private executions = new Map<string, Promise<any>>();
    private controllers = new Set<AbortController>();
    private placeholderRetainers = 0;

    constructor(model: any, options?: any) {
        this.model = model;
        this.type = getType(model) as any;

        this.options = options ?? {};
        this.queryClient = getEnv(this.model).queryClient;

        this.model.$treenode.registerHook('afterCreate', () => this.onAfterCreate());
        this.model.$treenode.registerHook('beforeDestroy', () => this.onBeforeDestroy());

        makeObservable<MstQueryHandler, 'isQueryLoading' | 'pendingMutationCount'>(this, {
            isQueryLoading: observable,
            pendingMutationCount: observable,
            isLoading: computed,
            isRefetching: observable,
            isFetchingMore: observable,
            isFetched: observable,
            error: observable,
            cachedAt: observableRef,
            markedAsStale: observable,
            hydrate: action,
            setData: action,
            setError: action,
            run: action,
            query: action,
            prefetch: action,
            adopt: action,
            mutate: action,
            startMutation: actionBound,
            finishMutation: actionBound,
            queryMore: action,
            refetch: action,
            abort: action,
            onAfterCreate: action,
            onBeforeDestroy: action,
            invalidate: actionBound,
        });
    }

    get isLoading() {
        return this.model.isMutation ? this.pendingMutationCount > 0 : this.isQueryLoading;
    }

    get notInitialized() {
        // Disabled hydration seeds data before request variables are ready.
        // A cached result alone must not prevent that query from initializing on enable.
        // Map entries are created with their request, so their variables are always ready.
        return (
            !this.isFetched &&
            !this.isLoading &&
            (!this.cachedAt || (!this.isQueryMap && !this.variablesInitialized))
        );
    }

    get isQueryMap() {
        return this.options.isMapEntry === true;
    }

    configureCollection(collection: any, key: string, cacheTime?: number) {
        this.collection = collection;
        this.collectionKey = key;
        this.collectionScope = JSON.parse(key).scope ?? undefined;
        this.extendCacheTime(cacheTime ?? this.queryClient.queryMapCacheTime);
        this.scheduleEviction();
    }

    extendCacheTime(value?: number) {
        if (!this.isQueryMap) return;
        const duration = value ?? this.cacheTime ?? this.queryClient.queryMapCacheTime;
        validateCacheTime(duration);
        this.cacheTime =
            this.cacheTime === undefined ? duration : Math.max(this.cacheTime, duration);
    }

    private cancelEviction() {
        if (this.evictionTimer !== undefined) clearTimeout(this.evictionTimer);
        this.evictionTimer = undefined;
    }

    /** @internal Keep previous entry data alive while a hook displays its placeholder. */
    retainPlaceholder() {
        if (this.isDisposed) return () => {};
        this.placeholderRetainers += 1;
        this.cancelEviction();
        let retained = true;
        return () => {
            if (!retained) return;
            retained = false;
            this.placeholderRetainers -= 1;
            this.scheduleEviction();
        };
    }

    private scheduleEviction() {
        this.cancelEviction();
        if (
            !this.collection ||
            this.isDisposed ||
            this.queryObservers.length ||
            this.placeholderRetainers ||
            this.executions.size ||
            this.cacheTime === Infinity
        )
            return;
        this.evictionTimer = setTimeout(() => {
            this.evictionTimer = undefined;
            this.collection.__removeEntry(this.collectionKey, this.model);
        }, this.cacheTime);
    }

    /** Execute and apply a response once, even when several callers await it. */
    executeQuery(method: 'query' | 'refetch' | 'queryMore', options: any = {}): Promise<any> {
        options = { ...options };
        if (
            this.collection &&
            options.request !== undefined &&
            options.request !== EmptyRequest &&
            this.collection.__getKey(options.request, this.collectionScope) !== this.collectionKey
        ) {
            throw new Error(
                'A query entry has a fixed request. Select a different entry through its collection.',
            );
        }
        if (this.collection) options.request = this.model.variables.request;
        this.extendCacheTime(options.cacheTime);
        this.cancelEviction();
        const paginationType = (getType(this.model.variables) as any).properties.pagination;
        const pagination = options.pagination ?? this.model.variables.pagination;
        const pageKey = hashRequest({
            pagination: paginationType ? normalizeRequest(paginationType, pagination) : null,
        });
        const key = `${method === 'queryMore' ? 'page' : 'query'}:${pageKey}`;
        const existing = this.executions.get(key);
        if (existing) return existing;
        const version = this.requestVersion;
        const start = () => {
            if (this.isDisposed || version !== this.requestVersion)
                return Promise.resolve({
                    data: null,
                    error: null,
                    result: null,
                    query: this.model,
                });
            const response = this[method](options);
            const controller = this.abortController;
            if (controller) this.controllers.add(controller);
            return response
                .then((next) =>
                    this.isDisposed
                        ? { data: null, error: null, result: null, query: this.model }
                        : this.model.__MstQueryHandlerAction(() => ({
                              ...next(),
                              query: this.model,
                          })),
                )
                .finally(() => {
                    if (controller) this.controllers.delete(controller);
                });
        };
        let execution: Promise<any>;
        try {
            const pending = [...this.executions].filter(
                ([key]) => method !== 'queryMore' || key.startsWith('query:'),
            );
            const preceding = pending.length
                ? Promise.allSettled(pending.map(([, promise]) => promise))
                : undefined;
            execution = preceding ? preceding.then(start, start) : start();
        } catch (error) {
            this.isQueryLoading = false;
            this.isRefetching = false;
            this.scheduleEviction();
            return Promise.reject(error);
        }
        const tracked = execution.finally(() => {
            if (this.executions.get(key) === tracked) this.executions.delete(key);
            if (this.refetchAfterInvalidation && !this.executions.size && !this.isDisposed) {
                this.refetchAfterInvalidation = false;
                const observer = this.queryObservers.find(
                    (observer) => observer.isQuery && observer.options.enabled,
                );
                if (observer)
                    void this.model.refetch({ meta: observer.options.meta }).catch(() => {});
            }
            this.scheduleEviction();
        });
        this.executions.set(key, tracked);
        return tracked;
    }

    run = (options: any = {}, fetch?: (options: any) => Promise<any>) => {
        const endpoint =
            fetch ?? this.options.endpoint ?? this.queryClient.config.queryOptions?.endpoint;

        if (!endpoint) {
            throw new Error('No query endpoint or global endpoint configured');
        }

        this.previousVariables = getSnapshot(this.model.variables);
        const identical =
            isVariableEqual(this.model.variables.request, options.request) &&
            isVariableEqual(this.model.variables.pagination, options.pagination);
        if (!this.isQueryMap && !this.model.isMutation && this.isLoading && identical) {
            this.abortController?.abort();
        }
        this.setVariables({ request: options.request, pagination: options.pagination });
        this.options.meta = options.meta;

        const abortController = new AbortController();
        this.abortController = abortController;

        if (!this.model.isMutation) {
            this.isQueryLoading = true;
        }
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

        let response;
        try {
            response = endpoint(opts);
        } catch (error) {
            if (this.model.isMutation) throw error;
            response = Promise.reject(error);
        }
        return Promise.resolve(response).then((result: any) => {
            if (abortController?.signal.aborted || this.isDisposed) {
                throw new DisposedError();
            }
            return result;
        });
    };

    async queryWhenChanged(options: QueryHookOptions) {
        if (this.isDisposed || (this.isQueryMap && this.isLoading)) {
            return;
        }

        if (!options.enabled) {
            return;
        }

        const notInitialized = this.notInitialized;
        if (!options.isMounted) {
            if (notInitialized) {
                return this.model.query(options);
            }

            if (!options.isRequestEqual) return this.model.query(options);

            // A failed query without data retries on mount. Hooks that throw the error never mount.
            if (this.error && this.model.data == null && !this.isLoading) {
                return this.model.query(options);
            }

            // A fetch for this request is already in flight, e.g. when StrictMode or <Activity>
            // remounts right after the first mount started it. Restarting it would only abort it.
            if (this.isLoading && !this.isFetchingMore) {
                return;
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

        if (!options.isRequestEqual) return this.model.query(options);

        if (options.isReenabled && (notInitialized || (this.isQueryMap && this.isStale(options)))) {
            return this.model.query(options);
        }

        if (
            !this.isQueryMap &&
            this.isFetched &&
            options.pagination !== EmptyPagination &&
            (options.refetchOnChanged === 'all' || options.refetchOnChanged === 'pagination') &&
            options.isPaginationChanged &&
            !equal(options.pagination, this.model.variables.pagination)
        ) {
            return this.model.queryMore({ ...options, isPaginationOption: true });
        }
    }

    query = (options: any = {}): Promise<() => any> => {
        return this.handleResponse(this.run(options), options);
    };

    // Keeps the raw endpoint response so it can be dehydrated
    prefetch = (options: any = {}) => {
        const promise = this.run(options);
        const response: PrefetchedResponse = { status: 'pending', promise };
        this.prefetchedResponse = response;
        promise.then(
            (result) => {
                response.status = 'success';
                response.result = result;
                response.cachedAt = Date.now();
            },
            () => {
                response.status = 'error';
            },
        );
        return this.applyResponse(this.handleResponse(promise, options));
    };

    // Treats an externally started request, such as a streamed server response, as a query run
    adopt = (promise: PromiseLike<any>, options: any = {}) => {
        // React's deserialized promises are thenables whose then() doesn't return a promise
        const response = Promise.resolve(promise);
        return this.applyResponse(this.handleResponse(this.run(options, () => response), options));
    };

    private applyResponse(response: Promise<() => any>) {
        return response.then((next) => this.model.__MstQueryHandlerAction(next));
    }

    // `run` must be called before this, since it assigns the abort controller of the current run
    handleResponse(promise: Promise<any>, options: OnResponseOptions = {}) {
        const abortController = this.abortController;
        const requestVersion = this.requestVersion;
        const invalidationVersion = this.invalidationVersion;
        let settle: (() => void) | undefined;
        if (!this.model.isMutation && !options.isQueryMore) {
            this.promise = new Promise<void>((resolve) => (settle = resolve));
        }
        const settleAfter = (next: () => any) => () => {
            try {
                return next();
            } finally {
                settle?.();
            }
        };
        const responseOptions = { ...options, abortController, requestVersion, invalidationVersion };
        return promise.then(
            (result) => settleAfter(this.onSuccess(result, responseOptions)),
            (err) => settleAfter(this.onError(err, responseOptions)),
        );
    }

    isSuperseded(abortController?: AbortController) {
        return (
            !this.model.isMutation && !!abortController && this.abortController !== abortController
        );
    }

    startMutation() {
        this.pendingMutationCount += 1;
    }

    finishMutation() {
        // A disposed node may still receive completions after its count was cleared.
        this.pendingMutationCount = Math.max(0, this.pendingMutationCount - 1);
    }

    mutate = (options: any = {}): Promise<() => any> => {
        const { optimisticUpdate, scope, revert = 'revert-all' } = options;
        let updateRecorder: IPatchRecorder;
        let result: any;
        if (optimisticUpdate) {
            updateRecorder = recordPatches(getRoot(this.model));
            result = optimisticUpdate();
            updateRecorder.stop();
        }
        if (result) {
            const data = this.prepareData(result);
            this.notify({ onMutate: true }, data, this.model);
        }

        const executeMutation = () => {
            return this.handleResponse(this.run(options), { updateRecorder, revert });
        };

        // Scope precedence: mutate options > handler options (from useMutation or createMutation)
        const effectiveScope = scope ?? this.options.scope;

        if (effectiveScope?.id) {
            const scopeId = effectiveScope.id;
            const mutationScopes = this.queryClient.getMutationScopes();

            const previousMutation = mutationScopes.get(scopeId) ?? Promise.resolve();

            const currentMutation = previousMutation.then(
                () => executeMutation(),
                () => executeMutation(), // Execute even if previous mutation failed
            );

            mutationScopes.set(scopeId, currentMutation);

            currentMutation.finally(() => {
                // Only delete if this is still the current mutation for this scope
                if (mutationScopes.get(scopeId) === currentMutation) {
                    mutationScopes.delete(scopeId);
                }
            });

            return currentMutation;
        }

        return executeMutation();
    };

    queryMore = (options: any = {}): Promise<() => any> => {
        // Two sources of truth for the current page would load pages twice.
        if (!this.isQueryMap) {
            const source = options.isPaginationOption ? 'option' : 'queryMore';
            if (this.paginationSource && this.paginationSource !== source) {
                throw new PaginationSourceError(this.type.name);
            }
            this.paginationSource = source;
        }
        this.pendingQueryMoreCount += 1;
        this.isFetchingMore = true;

        options.request = options.request ?? this.model.variables.request;
        options.pagination = options.pagination ?? this.model.variables.pagination;
        options.meta = options.meta ?? this.options.meta;

        try {
            return this.handleResponse(this.run(options), {
                shouldUpdate: false,
                isQueryMore: true,
                request: options.request,
                pagination: options.pagination,
            });
        } catch (error) {
            this.finishQueryMore();
            throw error;
        }
    };

    refetch = (options: any = {}): Promise<() => any> => {
        this.isRefetching = true;

        options.request = options.request ?? this.model.variables.request;
        options.pagination = options.pagination ?? this.model.variables.pagination;
        options.meta = options.meta ?? this.options.meta;

        try {
            return this.handleResponse(this.run(options), options);
        } catch (error) {
            this.isRefetching = false;
            throw error;
        }
    };

    invalidate() {
        this.markedAsStale = true;
        this.invalidationVersion += 1;
        const observer = this.queryObservers.find(
            (observer) => observer.isQuery && observer.options.enabled,
        );
        if (observer) {
            if (this.executions.size) this.refetchAfterInvalidation = true;
            else void this.model.refetch({ meta: observer.options.meta }).catch(() => {});
        }
    }

    onSuccess(result: any, options: OnResponseOptions = {}) {
        const { shouldUpdate = true, updateRecorder, revert = 'revert-all' } = options;
        return (): { data: any; error: any; result: any } => {
            if (updateRecorder && revert === 'revert-all') {
                updateRecorder.undo();
            }

            if (
                options.isQueryMore &&
                (!this.isQueryMap || options.requestVersion === this.requestVersion)
            ) {
                this.finishQueryMore();
            }

            if (this.isDisposed) {
                return { data: null, error: null, result: null };
            }

            // Pages may finish out of order within one request, but a request change
            // invalidates old pages before normalization can update shared models.
            if (options.isQueryMore && options.requestVersion !== this.requestVersion) {
                return { data: null, error: null, result };
            }

            // A newer run has taken over, so only the caller of this run gets the result
            if (this.isSuperseded(options.abortController)) {
                if (options.isQueryMore) {
                    const data = this.prepareData(result);
                    this.notifyQueryMore(data, options);
                    return { data, error: null, result };
                }
                return { data: this.prepareData(result), error: null, result };
            }

            if (this.markedAsStale && options.invalidationVersion === this.invalidationVersion) {
                this.markedAsStale = false;
            }

            let data;
            if (shouldUpdate) {
                data = this.setData(result, options);
            } else {
                data = this.prepareData(result);
            }
            this.cachedAt = new Date();

            if (this.error) {
                this.error = null;
            }

            if (this.isLoading) {
                this.isQueryLoading = false;
            }

            if (this.isRefetching) {
                this.isRefetching = false;
            }

            if (options.isQueryMore) {
                this.notifyQueryMore(data, options);
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
        const { shouldUpdate = true, updateRecorder, revert = 'revert-all' } = options;
        return (): { data: any; error: any; result: any } => {
            if (updateRecorder && (revert === 'revert-all' || revert === 'revert-on-error')) {
                updateRecorder.undo();
            }

            if (
                options.isQueryMore &&
                (!this.isQueryMap || options.requestVersion === this.requestVersion)
            ) {
                this.finishQueryMore();
            }

            if (this.isDisposed) {
                return { data: null, error: null, result: null };
            }

            if (err instanceof DisposedError) {
                return { data: null, error: null, result: null };
            }

            if (err?.name === 'AbortError') {
                return { data: null, error: null, result: null };
            }

            if (
                this.isSuperseded(options.abortController) ||
                (options.isQueryMore && options.requestVersion !== this.requestVersion)
            ) {
                return { data: null, error: err, result: null };
            }

            // Like React Query, a failed fetch keeps data from the same request.
            // Mutations, placeholders and data from a previous request are cleared.
            if (
                shouldUpdate &&
                (this.model.isMutation || options.requestVersion !== this.dataRequestVersion)
            ) {
                this.setData(null);
            }

            this.error = err;

            if (this.isLoading) {
                this.isQueryLoading = false;
            }

            if (this.isRefetching) {
                this.isRefetching = false;
            }

            return { data: null, error: err, result: null };
        };
    }

    finishQueryMore() {
        this.pendingQueryMoreCount = Math.max(0, this.pendingQueryMoreCount - 1);
        this.isFetchingMore = this.pendingQueryMoreCount > 0;
    }

    notifyQueryMore(data: any, options: OnResponseOptions) {
        this.options.onQueryMore?.({
            data,
            pagination: options.pagination,
            request: options.request,
            query: this.model,
        });
    }

    addQueryObserver(queryObserver: QueryObserver) {
        if (
            !this.isQueryMap &&
            queryObserver.isQuery &&
            this.queryObservers.some((observer) => observer !== queryObserver && observer.isQuery)
        ) {
            throw new Error(
                `Query "${this.type.name}" already has a query hook. ` +
                    'Mount only one useQuery or useInfiniteQuery per singleton; use createQueryMap or createInfiniteQueryMap for shared query hooks.',
            );
        }
        this.cancelEviction();
        if (!this.queryObservers.includes(queryObserver)) {
            this.queryObservers.push(queryObserver);
        }
    }

    removeQueryObserver(queryObserver: any) {
        this.queryObservers = this.queryObservers.filter((observer) => observer !== queryObserver);
        if (!this.queryObservers.some((observer) => observer.isQuery)) {
            this.paginationSource = undefined;
        }
        this.scheduleEviction();
    }

    notify(notifyOptions: NotifyOptions, ...args: any[]) {
        for (let observer of this.queryObservers) {
            for (let key of Object.keys(notifyOptions)) {
                observer.options[key]?.(...args);
            }
        }
    }

    abort = () => {
        for (const controller of this.controllers) controller.abort();
        this.controllers.clear();
        this.executions.clear();
        this.requestVersion += 1;
        this.refetchAfterInvalidation = false;
        this.abortController?.abort();
        this.abortController = undefined;
        this.isQueryLoading = false;
        this.isRefetching = false;
        this.pendingQueryMoreCount = 0;
        this.isFetchingMore = false;

        if (!this.isDisposed && this.previousVariables) {
            this.revertVariables();
        }
        this.scheduleEviction();
    };

    setError = (error: any) => {
        this.error = error;
    };

    setVariables(variables: any) {
        const isRequestEqual = isVariableEqual(this.model.variables.request, variables.request);
        let request = variables.request;
        let pagination = variables.pagination;

        // Omitted variables keep the stored value, which may itself be undefined.
        // Internal hook sentinels must never be assigned to an MST model.
        if (request === undefined || request === EmptyRequest) {
            request = this.model.variables.request;
        }
        if (pagination === undefined || pagination === EmptyPagination) {
            pagination = this.model.variables.pagination;
        }

        this.model.__MstQueryHandlerAction(() => {
            this.model.variables = { request, pagination };
        });
        this.variablesInitialized = true;
        if (!isRequestEqual) {
            this.requestVersion += 1;
            this.paginationSource = undefined;
        }
    }

    revertVariables() {
        this.model.__MstQueryHandlerAction(() => {
            this.model.variables = this.previousVariables;
        });
    }

    prepareData(data: any) {
        return merge(data, this.type.properties.data, this.queryClient.config.env, true);
    }

    setData = (data: any, options: CacheOptions = {}) => {
        const opts = options ?? this.options;

        this.dataRequestVersion = this.requestVersion;
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

            if (opts.cacheKey && this.model.data) {
                this.queryClient.queryStore.setQueryData(
                    this.type,
                    opts.cacheKey,
                    this.model,
                    opts.cacheTime,
                );
            }
        });

        return this.model.data;
    };

    /** @internal */
    markPlaceholderData() {
        this.dataRequestVersion = undefined;
    }

    hydrate = (data: any, options: any) => {
        const { enabled, request, pagination } = options;

        if (enabled) {
            this.setVariables({ request, pagination });
        }
        this.options.meta = options.meta;

        this.isQueryLoading = false;

        this.setData(data, options);
        this.cachedAt = new Date(options.initialDataUpdatedAt ?? Date.now());
        this.error = null;
    };

    isStale(options: any) {
        if (!this.cachedAt) {
            return false;
        }

        return this.markedAsStale || isDataStale(this.cachedAt.getTime(), options.staleTime);
    }

    onAfterCreate = () => {
        this.queryClient.queryStore.setQuery(this.model);
    };

    onBeforeDestroy = () => {
        this.queryClient.queryStore.removeQuery(this.model);
        this.isDisposed = true;
        this.cancelEviction();
        this.pendingMutationCount = 0;
        this.isQueryLoading = false;
        this.queryObservers.forEach((observer) => observer.unsubscribe());
        this.abort();
    };
}

function isDataStale(cachedAt?: number, staleTime: number = 0) {
    const now = Date.now();
    const cachedTime = cachedAt ?? now;
    return now - cachedTime >= staleTime;
}

// Undefined variables and hook sentinels mean "keep the current one", see setVariables.
export function isVariableEqual(currentVariable: any, nextVariable: any) {
    if (
        nextVariable === undefined ||
        nextVariable === EmptyRequest ||
        nextVariable === EmptyPagination ||
        nextVariable === currentVariable
    ) {
        return true;
    }

    if (isStateTreeNode(currentVariable)) {
        const nextSnapshot = isStateTreeNode(nextVariable)
            ? getSnapshot(nextVariable)
            : getSnapshot(getType(currentVariable).create(nextVariable));
        return equal(nextSnapshot, getSnapshot(currentVariable));
    }

    return equal(nextVariable, currentVariable);
}
