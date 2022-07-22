import equal from '@wry/equality';
import { makeObservable, observable, action } from 'mobx';
import {
    addDisposer,
    flow,
    getEnv,
    getSnapshot,
    getType,
    IDisposer,
    isStateTreeNode,
} from 'mobx-state-tree';
import { merge } from './merge';
import { QueryClient } from './QueryClient';
import { QueryStatus } from './utilityTypes';
import { getSnapshotOrData } from './utils';

type QueryReturn<TData, TResult> = {
    data: TData;
    error: any;
    result: TResult;
};

type Context = {
    fetchOptions?: {
        signal: AbortSignal;
    };
    [key: string]: any;
};

type QueryOptions = {
    request?: any;
    pagination?: any;
    context?: Context;
    convert?: (result: any) => any;
};

export type QueryFnType = (options: QueryOptions, query: any) => Promise<any>;

export class DisposedError extends Error {}

const MAX_TIMEOUT = 0x7fffffff;

export class MstQueryHandler {
    isLoading = false;
    isRefetching = false;
    isFetchingMore = false;
    isFetched = false;
    error: any = null;

    status = QueryStatus.Active;
    result: any;
    options: {
        queryFn: QueryFnType;
        onSuccess: any;
        onError: any;
        onFetched: any;
        cacheTime: any;
        staleTime: any;
        onQueryMore?: any;
    };

    previousVariables: any;
    model: any;
    type: any;
    queryClient!: QueryClient<any>;

    disposer?: IDisposer;
    abortController?: AbortController;
    toBeRemovedTimeout?: number;

    cachedAt?: Date;
    cachedRequest: any;

    isDisposed = false;

    constructor(model: any, options?: any) {
        this.model = model;
        this.type = getType(model) as any;

        this.options = options ?? {};
        this.queryClient = getEnv(this.model).queryClient;

        this.model.$treenode.registerHook('afterCreate', () => this.onAfterCreate());
        this.disposer = addDisposer(this.model, () => this.onDispose());

        makeObservable(this, {
            isLoading: observable,
            isRefetching: observable,
            isFetchingMore: observable,
            isFetched: observable,
            error: observable,
            updateData: action.bound,
            setResult: action.bound,
            setError: action.bound,
            run: action.bound,
            query: action.bound,
            mutate: action.bound,
            queryMore: action.bound,
            refetch: action.bound,
            remove: action.bound,
            abort: action.bound,
            onAfterCreate: action.bound,
            updateDataFromSnapshot: action.bound,
        });
    }

    run(options: QueryOptions = {}, useCache = false) {
        this.setVariables({ request: options.request, pagination: options.pagination });

        this.abortController = new AbortController();

        const getCachedData = useCache && !this.isRefetching;
        const cachedResult = getCachedData ? this.getDataFromCache() : null;
        if (cachedResult) {
            // Update data before user call next to render cached result immediately
            this.updateDataFromSnapshot(cachedResult.data, cachedResult.cachedAt);
        }

        let promise;
        if (cachedResult && cachedResult.status !== QueryStatus.Stale) {
            promise = Promise.resolve({ __mst_query_cached: true, ...cachedResult });
        } else {
            this.isLoading = true;
            this.error = null;

            const opts = {
                ...options,
                context: {
                    fetchOptions: {
                        signal: this.abortController.signal,
                    },
                    ...options?.context,
                },
            };
            promise = this.options.queryFn(opts, this.model);
        }

        return promise
            .then((result: any) => {
                if (this.isDisposed) {
                    throw new DisposedError();
                }
                if (options.convert) {
                    return options.convert(result);
                }
                return result;
            })
            .finally(() => {
                if (cachedResult?.query.__MstQueryHandler.toBeRemovedTimeout) {
                    this.queryClient.queryStore.removeQuery(cachedResult.query);
                    clearTimeout(cachedResult.query.__MstQueryHandler.toBeRemovedTimeout);
                }
            });
    }

    query<TData, TResult>(options: QueryOptions = {}): Promise<() => QueryReturn<TData, TResult>> {
        return this.run(options, true).then(
            (result) => this.onSuccess(result),
            (err) => this.onError(err)
        );
    }

    mutate<TData, TResult>(options: QueryOptions = {}): Promise<() => QueryReturn<TData, TResult>> {
        return this.run(options).then(
            (result) => this.onSuccess(result),
            (err) => this.onError(err)
        );
    }

    queryMore<TData, TResult>(
        options: QueryOptions = {}
    ): Promise<() => QueryReturn<TData, TResult>> {
        this.isFetchingMore = true;

        return this.run(options).then(
            (result) => this.onSuccess(result, false),
            (err) => this.onError(err, false)
        );
    }

    refetch<TData, TResult>(
        options: QueryOptions = {}
    ): Promise<() => QueryReturn<TData, TResult>> {
        this.isRefetching = true;

        options.request = options.request ?? this.model.variables.request;
        options.pagination = options.pagination ?? this.model.variables.pagination;

        return this.run(options).then(
            (result) => this.onSuccess(result),
            (err) => this.onError(err)
        );
    }

    onSuccess(result: any, shouldUpdate = true) {
        return (): { data: any; error: any; result: any } => {
            if (this.isDisposed) {
                return { data: null, error: null, result: null };
            }

            if (result?.__mst_query_cached) {
                this.setResult(result.result);

                this.options.onSuccess?.(this.model.data, this.model);

                return { data: this.model.data, error: null, result: result.result };
            }

            this.setResult(result);

            let data;
            if (shouldUpdate) {
                data = this.updateData(result, { isLoading: false, error: null });
            } else {
                data = this.prepareData(result);
            }
            
            if (this.isRefetching) {
                this.isRefetching = false;
            }
            
            if (this.isFetchingMore) {
                this.isFetchingMore = false;
                this.options.onQueryMore?.(data, this.model);
            }

            this.options.onSuccess?.(data, this.model);

            return { data, error: null, result };
        };
    }

    onError(err: any, shouldUpdate = true) {
        return (): { data: any; error: any; result: any } => {
            if (this.isDisposed) {
                return { data: null, error: null, result: null };
            }

            if (err instanceof DisposedError) {
                return { data: null, error: null, result: null };
            }

            if (shouldUpdate) {
                this.updateData(null, { isLoading: false, error: err });
            }

            if (this.isRefetching) {
                this.isRefetching = false;
            }
            
            if (this.isFetchingMore) {
                this.isFetchingMore = false;
            }

            this.options.onError?.(err, this.model);

            return { data: null, error: err, result: null };
        };
    }

    abort() {
        this.abortController?.abort();
        this.abortController = undefined;
        this.revertVariables();
    }

    setResult(result: any) {
        this.result = result;
    }

    setError(error: any) {
        this.error = error;
    }

    setOptions(options: any) {
        this.options = { ...this.options, ...options };
    }

    setVariables(variables: any) {
        this.previousVariables = this.model.variables;
        this.model.__MstQueryHandlerAction(() => {
            this.model.variables = normalizeVariables(variables);
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

    getCachedQuery() {
        const req = getSnapshotOrData(this.model.variables.request);

        const queries = this.queryClient.queryStore.findAll(
            this.type,
            (q) =>
                q.__MstQueryHandler.options.queryFn === this.options.queryFn &&
                equal(q.__MstQueryHandler.cachedRequest, req),
            true
        );
        if (queries.length) {
            return queries
                .filter((q) => q.__MstQueryHandler.cachedAt)
                .sort((a, b) => b.cachedAt - a.cachedAt)[0];
        }
        return null;
    }

    getDataFromCache() {
        const cachedQuery: any = this.getCachedQuery();
        if (!cachedQuery) {
            return null;
        }

        const cachedData = (getSnapshot(cachedQuery) as any).data;
        const result = cachedQuery.result;
        const status = cachedQuery.__MstQueryHandler.status;
        const cachedAt = cachedQuery.__MstQueryHandler.cachedAt;

        return {
            result,
            status,
            cachedAt,
            data: cachedData,
            query: cachedQuery,
        };
    }

    updateDataFromSnapshot(snapshot: any, cachedAt: Date) {
        if (snapshot) {
            this.cachedAt = cachedAt;
            this.model.__MstQueryHandlerAction(() => {
                this.model.data = snapshot;
            });
        }
        if (!this.isFetched) {
            this.isFetched = true;
            this.options.onFetched?.(this.model.data, this.model);
        }

        return this.model.data;
    }

    updateData(data: any, status?: any) {
        if (data) {
            this.model.__MstQueryHandlerAction(() => {
                this.model.data = merge(
                    data,
                    this.type.properties.data,
                    this.queryClient.config.env
                );
            });

            this.updateCache();
        }
        if (!this.isFetched) {
            this.isFetched = true;
            this.options.onFetched?.(this.model.data, this.model);
        }
        if (status) {
            this.error = status.error;
            this.isLoading = status.isLoading;
        }

        return this.model.data;
    }

    updateCache() {
        this.cachedAt = new Date();
        this.cachedRequest = getSnapshotOrData(this.model.variables.request);

        const staleTime =
            this.options.staleTime * 1000 > MAX_TIMEOUT
                ? MAX_TIMEOUT
                : this.options.staleTime * 1000;

        if (this.options.staleTime) {
            setTimeout(() => {
                this.status = QueryStatus.Stale;
            }, staleTime);
        } else {
            this.status = QueryStatus.Stale;
        }
    }

    remove() {
        if (this.toBeRemovedTimeout) {
            return;
        }

        const cacheTimeMs =
            this.options.cacheTime * 1000 > MAX_TIMEOUT
                ? MAX_TIMEOUT
                : this.options.cacheTime * 1000;

        const currentDate = new Date().getTime();
        const cachedAt = this.cachedAt?.getTime() ?? 0;
        const elapsedInMs = currentDate - cachedAt;

        return new Promise((resolve) => {
            if (elapsedInMs < cacheTimeMs) {
                this.toBeRemovedTimeout = window.setTimeout(() => {
                    this.queryClient.queryStore.removeQuery(this.model);
                    this.toBeRemovedTimeout = undefined;
                    resolve(this.model);
                }, cacheTimeMs - elapsedInMs);
            } else {
                this.queryClient.queryStore.removeQuery(this.model);
                resolve(this.model);
            }
        });
    }

    callWithNext(fn: any, ...args: any[]) {
        return new Promise((resolve) => {
            this.model.__MstQueryHandlerAction(
                flow(function* () {
                    const next = yield* fn(...args);
                    resolve(next());
                })
            );
        });
    }

    onAfterCreate() {
        this.queryClient.queryStore.setQuery(this.model);
    }

    onDispose() {
        this.isDisposed = true;
        this.abort();
        this.toBeRemovedTimeout && clearTimeout(this.toBeRemovedTimeout);
    }
}

function normalizeVariables({ request, pagination }: { request: any; pagination: any }) {
    let variables: any = {};
    if (request) {
        variables.request = isStateTreeNode(request) ? getSnapshot(request) : request;
    }
    if (pagination) {
        variables.pagination = isStateTreeNode(pagination) ? getSnapshot(pagination) : pagination;
    }
    return variables;
}
