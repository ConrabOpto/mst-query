import {
    types,
    getType,
    getEnv,
    IDisposer,
    addDisposer,
    onSnapshot,
    isStateTreeNode,
    getSnapshot,
    applySnapshot,
} from 'mobx-state-tree';
import { when } from 'mobx';
import { merge } from './merge';
import QueryCache from './cache';

export type QueryFnType = (variables: any, options: any) => Promise<any>;

export class DisposedError extends Error {}

export const QueryModelBase = types
    .model('QueryModelBase', {})
    .volatile(() => ({
        isLoading: false,
        error: null as any,
        options: {} as any,
        result: null as any,
        _queryFn: null as null | QueryFnType,
        _abortController: null as AbortController | null,
        _disposer: null as null | IDisposer,
        _requestSnapshot: null as any,
    }))
    .actions((self) => {
        let requestSnapshotDisposer = null as null | IDisposer;
        let isDisposed = false;
        return {
            whenIsDoneLoading() {
                return when(() => !self.isLoading);
            },
            reset() {
                self.isLoading = false;
                self.error = null;
                (self as any).result = null;

                // TODO: Also reset data from snapshot
                (self as any).data = null;
                if (self._requestSnapshot) {
                    const request = (self as any).request;
                    applySnapshot(request, self._requestSnapshot);
                    self._requestSnapshot = getSnapshot(request);
                }
            },
            abort() {
                if (self._abortController) {
                    self._abortController.abort();
                    self._abortController = null;
                }
            },
            _init(options: any = {}) {
                self.options = options;

                const request = (self as any).request;
                if (isStateTreeNode(request)) {
                    self._requestSnapshot = getSnapshot(request);
                    requestSnapshotDisposer =
                        options.onRequestSnapshot && onSnapshot(request, options.onRequestSnapshot);
                }
            },
            _remove() {
                if (self.options.cacheMaxAge) {
                    setTimeout(() => {
                        QueryCache.removeQuery(self as any);
                    }, self.options.cacheMaxAge * 60);

                    return;
                }

                QueryCache.removeQuery(self as any);
            },
            _setResult(result: any) {
                (self as any).result = result;
            },
            _setIsLoading() {
                self.error = null;
                self.isLoading = true;
            },
            _prepareData(data: any, type?: any) {
                type = type ?? (getType(self) as any).properties.data;
                return merge(data, type, getEnv(self));
            },
            _updateData(data: any, status?: any) {
                const selfAny = self as any;

                if (data) {
                    selfAny.data = merge(
                        data,
                        (getType(self) as any).properties.data,
                        getEnv(self)
                    );
                }

                if (!selfAny.isFetched) {
                    selfAny.isFetched = true;
                    self.options.onFetched?.(selfAny.data, selfAny);
                }
                if (selfAny.isRefetching) {
                    selfAny.isRefetching = false;
                }
                if (selfAny.isFetchingMore) {
                    selfAny.isFetchingMore = false;
                }

                if (status) {
                    self.error = status.error;
                    self.isLoading = status.isLoading;
                }
            },
            _run(queryFn: QueryFnType, options?: any) {
                self._queryFn = queryFn;
                self._abortController = new AbortController();

                if (!self._disposer) {
                    self._disposer = addDisposer(self, () => {
                        isDisposed = true;
                        this.abort();
                        requestSnapshotDisposer?.();
                    });
                }

                this._setIsLoading();

                let runner: any;
                if (self.options.initialResult) {
                    const result = self.options.initialResult;
                    self.options.initialResult = undefined;

                    runner = () => new Promise((resolve) => resolve(result));
                } else {
                    runner = queryFn;
                }

                const opts = {
                    ...options,
                    context: {
                        ...options?.context,
                        fetchOptions: {
                            signal: self._abortController.signal,
                        },
                    },
                };

                return runner(options.variables, opts).then((result: any) => {
                    if (isDisposed) {
                        throw new DisposedError();
                    }
                    if (options.convert) {
                        return options.convert(result);
                    }
                    return result;
                });
            },
            _runInAction(fn: any) {
                return fn();
            },
        };
    });

export default QueryModelBase;
