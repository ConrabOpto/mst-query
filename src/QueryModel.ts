import QueryModelBase, { QueryFnType, DisposedError } from './QueryModelBase';
import { IAnyType, Instance, SnapshotIn, toGeneratorFunction } from 'mobx-state-tree';

type QueryReturn<T extends IAnyType> = {
    data: Instance<T>['data'];
    error: any;
    result: SnapshotIn<T>['data'];
};

export const QueryModel = QueryModelBase.named('QueryModel')
    .volatile(() => ({
        isRefetching: false,
        isFetchingMore: false,
        isFetched: false,
    }))
    .actions((s) => {
        const self = s as CreatedQueryModelType;
        const query = (
            queryFn: QueryFnType,
            variables = {},
            options = {}
        ): Promise<<T extends IAnyType>() => QueryReturn<T>> => {
            self._abortController = new AbortController();

            const opts = {
                variables,
                ...options,
            };

            const nextSuccess = (result: any) => () => {
                self._setResult(result);

                self._updateData(result, { isLoading: false, error: null });
                return { data: self.data, error: null, result };
            };
            const nextError = (err: any) => () => {
                if (err instanceof DisposedError) {
                    return { data: null, error: null, result: null };
                }

                self._updateData(null, { isLoading: false, error: err });
                return { data: null, error: err, result: null };
            };

            return self._run(queryFn, opts).then(nextSuccess, nextError);
        };
        const queryMore = (
            queryFn: QueryFnType,
            variables?: any,
            options = {}
        ): Promise<<T extends IAnyType>() => QueryReturn<T>> => {
            self.isFetchingMore = true;

            const opts = {
                variables,
                ...options,
            };

            const nextSuccess = (result: any) => () => {
                self._setResult(result);

                const data = self._prepareData(result);
                return { data, error: null, result };
            };
            const nextError = (err: any) => () => {
                if (err instanceof DisposedError) {
                    return { data: null, error: null, result: null };
                }

                return { data: null, error: err, result: null };
            };

            return self._run(queryFn, opts).then(nextSuccess, nextError);
        };
        const refetch = (...runParams: any): Promise<any> => {
            self.isRefetching = true;

            return self.run(...runParams);
        };
        return {
            query: toGeneratorFunction(query),
            queryMore: toGeneratorFunction(queryMore),
            refetch
        };
    });

export interface QueryModelType extends Instance<typeof QueryModel> {}

type CreatedQueryModelType = QueryModelType & {
    data: unknown;
    request: unknown;
    env: unknown;
    run: any;
};

export default QueryModel;
