import { makeObservable, observable, action } from 'mobx';
import {
    addDisposer,
    getType,
    IAnyType,
    IDisposer,
    Instance,
    isStateTreeNode,
    onSnapshot,
    SnapshotIn,
} from 'mobx-state-tree';
import { config } from './config';
import { merge } from './merge';
import { QueryStatus } from './UtilityTypes';
import queryCache from './cache';

export type QueryFnType = (variables: any, options: any) => Promise<any>;

type QueryReturn<T extends IAnyType> = {
    data: Instance<T>['data'];
    error: any;
    result: SnapshotIn<T>['data'];
};

export class DisposedError extends Error {}

export class MstQueryHandler {
    isLoading = false;
    isRefetching = false;
    isFetchingMore = false;
    isFetched = false;
    error: any = null;

    status = QueryStatus.Active;
    result: any;
    options: any;
    model: any;
    type: any;

    disposer?: IDisposer;
    onRequestSnapshotDisposer?: IDisposer;
    abortController?: AbortController;
    toBeRemovedTimeout?: number;

    isDisposed = false;

    constructor(model: any) {
        this.model = model;
        this.type = getType(model) as any;

        makeObservable(this, {
            isLoading: observable,
            isRefetching: observable,
            isFetchingMore: observable,
            isFetched: observable,
            error: observable,
            updateData: action.bound,
            setResult: action.bound,
            run: action.bound,
            query: action.bound,
            queryMore: action.bound,
            refetch: action.bound,
            remove: action.bound,
        });
    }

    init(options: any = {}) {
        this.options = options;

        if (isStateTreeNode(this.model.request)) {
            this.onRequestSnapshotDisposer =
                options.onRequestSnapshot &&
                onSnapshot(this.model.request, options.onRequestSnapshot);
        }
    }

    run(queryFn: QueryFnType, options?: any) {
        this.abortController = new AbortController();

        if (!this.disposer) {
            this.disposer = addDisposer(this.model, () => this.onDispose());
        }

        this.isLoading = true;
        this.error = null;

        const opts = {
            ...options,
            context: {
                ...options?.context,
                fetchOptions: {
                    signal: this.abortController.signal,
                },
            },
        };

        return queryFn(options.variables, opts).then((result: any) => {
            if (this.isDisposed) {
                throw new DisposedError();
            }
            if (options.convert) {
                return options.convert(result);
            }
            return result;
        });
    }

    query(
        queryFn: QueryFnType,
        variables = {},
        options = {}
    ): Promise<<T extends IAnyType>() => QueryReturn<T>> {
        const opts = {
            variables,
            ...options,
        };

        return this.run(queryFn, opts).then(
            (result) => this.onSuccess(result),
            (err) => this.onError(err)
        );
    }

    queryMore(
        queryFn: QueryFnType,
        variables?: any,
        options = {}
    ): Promise<<T extends IAnyType>() => QueryReturn<T>> {
        this.isFetchingMore = true;

        const opts = {
            variables,
            ...options,
        };

        return this.run(queryFn, opts).then(
            (result) => this.onSuccess(result, false),
            (err) => this.onError(err, false)
        );
    }

    refetch(...params: any) {
        this.isRefetching = true;

        return this.model.run(...params);
    }

    onSuccess(result: any, shouldUpdate = true) {
        return () => {
            this.setResult(result);

            let data;
            if (shouldUpdate) {
                data = this.updateData(result, { isLoading: false, error: null });
            } else {
                data = this.prepareData(result);
            }
            
            this.options.onSuccess?.(data);

            return { data, error: null, result };
        };
    }

    onError(err: any, shouldUpdate = true) {
        return () => {
            if (err instanceof DisposedError) {
                return { data: null, error: null, result: null };
            }

            if (shouldUpdate) {
                this.updateData(null, { isLoading: false, error: err });
            }

            this.options.onError?.(err);

            return { data: null, error: err, result: null };
        };
    }

    abort() {
        this.abortController?.abort();
        this.abortController = undefined;
    }

    setResult(result: any) {
        this.result = result;
    }

    prepareData(data: any) {
        return merge(data, this.type.properties.data, config.env, true);
    }

    updateData(data: any, status?: any) {
        if (data) {
            this.model.__MstQueryHandlerAction(() => {
                this.model.data = merge(data, this.type.properties.data, config.env);
            });
        }
        if (!this.isFetched) {
            this.isFetched = true;
            this.options.onFetched?.(this.model.data, this.model);
        }
        if (this.isRefetching) {
            this.isRefetching = false;
        }
        if (this.isFetchingMore) {
            this.isFetchingMore = false;
        }
        if (status) {
            this.error = status.error;
            this.isLoading = status.isLoading;
        }

        return this.model.data;
    }

    remove() {
        this.status = QueryStatus.Stale;

        if (this.options.cacheMaxAge) {
            this.toBeRemovedTimeout = window.setTimeout(() => {
                queryCache.removeQuery(this.model);
            }, this.options.cacheMaxAge * 1000);

            return;
        }

        queryCache.removeQuery(this.model);
    }

    onDispose() {
        this.isDisposed = true;
        this.abort();
        this.onRequestSnapshotDisposer?.();
        this.toBeRemovedTimeout && clearTimeout(this.toBeRemovedTimeout);
    }
}
