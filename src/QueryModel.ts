import QueryModelBase, { QueryFnType, DisposedError } from './QueryModelBase';
import { Instance } from 'mobx-state-tree';

export const QueryModel = QueryModelBase.named('QueryModel')
    .volatile(() => ({
        isRefetching: false,
        isFetchingMore: false,
        isFetched: false,
    }))
    .actions((self) => {
        return {
            query(queryFn: QueryFnType, variables = {}, options = {}) {
                self._abortController = new AbortController();

                const opts = {
                    variables,
                    ...options,
                };

                const nextSuccess = (result: any) => () => {
                    self._updateData(result, { isLoading: false, error: null });
                    return { data: (self as any).data, error: null, result };
                };
                const nextError = (err: any) => () => {
                    if (err instanceof DisposedError) {
                        return { data: null, error: null, result: null };
                    }

                    self._updateData(null, { isLoading: false, error: err });
                    return { data: null, error: err, result: null };
                };

                return self._run(queryFn, opts).then(
                    (result: any) => {
                        return nextSuccess(result);
                    },
                    (err: any) => {
                        return nextError(err);
                    }
                );
            },
            queryMore(variables?: any, options = {}) {
                if (!self._queryFn) {
                    throw new Error(
                        'You need to run this query at least once before calling queryMore.'
                    );
                }

                self.isFetchingMore = true;

                const opts = {
                    variables,
                    ...options,
                };

                const nextSuccess = (result: any) => () => {
                    const data = self._prepareData(result);
                    return { data, error: null, result };
                };
                const nextError = (err: any) => () => {
                    if (err instanceof DisposedError) {
                        return { data: null, error: null, result: null };
                    }

                    return { data: null, error: err, result: null };
                };

                return self._run(self._queryFn, opts).then(
                    (result: any) => {
                        return nextSuccess(result);
                    },
                    (err: any) => {
                        return nextError(err);
                    }
                );
            },
            refetch(...runParams: any) {
                if (!self._queryFn) {
                    throw new Error(
                        'You need to run this query at least once before calling refetch.'
                    );
                }

                self.isRefetching = true;

                return (self as any).run(...runParams);
            },
        };
    });

export interface QueryModelType extends Instance<typeof QueryModel> {}

export default QueryModel;
