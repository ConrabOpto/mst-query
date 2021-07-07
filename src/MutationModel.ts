import {
    Instance,
    getSnapshot,
    IAnyType,
    SnapshotIn,
    toGeneratorFunction,
} from 'mobx-state-tree';
import { equal } from '@wry/equality';
import QueryModelBase, { QueryFnType, DisposedError } from './QueryModelBase';

type MutationReturn<T extends IAnyType> = {
    data: Instance<T>['data'];
    error: any;
    result: SnapshotIn<T>['data'];
};

export const MutationModel = QueryModelBase.named('MutationModel').extend((s) => {
    const self = s as CreatedMutationModelType;
    const mutate = (
        mutateFn: QueryFnType,
        variables?: any,
        options: any = {}
    ): Promise<<T extends IAnyType>() => MutationReturn<T>> => {
        const opts = {
            variables,
            ...options,
        };

        const nextSuccess = (result: any) => () => {
            self._setResult(result);

            self._updateData(result, { isLoading: false, error: null });
            options.onMutate?.(self.data);
            return { data: self.data, error: null, result };
        };
        const nextError = (err: any) => () => {
            if (err instanceof DisposedError) {
                return { data: null, error: null, result: null };
            }
            self._updateData(null, { isLoading: false, error: err });
            options.onError?.(err, self);
            return { data: null, error: err, result: null };
        };

        return self._run(mutateFn, opts).then(nextSuccess, nextError);
    };
    return {
        views: {
            get hasChanged() {
                return !equal(self._requestSnapshot, getSnapshot(self.request as any));
            },
        },
        actions: {
            mutate: toGeneratorFunction(mutate),
            commitChanges() {
                const request = self.request;
                self._requestSnapshot = getSnapshot(request as any);
            },
        },
    };
});

export interface MutationModelType extends Instance<typeof MutationModel> {}

type CreatedMutationModelType = MutationModelType & {
    data: unknown;
    request: unknown;
    env: unknown;
    run: any;
};

export default MutationModel;
