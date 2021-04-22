import { IPatchRecorder, recordPatches, Instance, getSnapshot } from 'mobx-state-tree';
import QueryModelBase, { QueryFnType, DisposedError } from './QueryModelBase';
import { equal } from '@wry/equality';

export const MutationModel = QueryModelBase.named('MutationModel')
    .views(self => ({
        get hasChanged() {
            return !equal((self as any)._requestSnapshot, getSnapshot((self as any).request));
        }
    }))
    .actions(self => ({
        commitChanges() {
            const request = (self as any).request;
            self._requestSnapshot = getSnapshot(request);
        },
        mutate(mutateFn: QueryFnType, variables?: any, options: any = {}) {
            const { optimisticUpdate } = options;

            let recorder: IPatchRecorder | null = null;
            if (optimisticUpdate) {
                const { query, data } = optimisticUpdate;

                // TODO: Re-add this when we track down the bug that onPatch is not triggered for root node

                // Always cancel outgoing refetches, so that they don't overwrite our optimistic update
                //query.abort();

                const preparedData = self._prepareData(data);
                recorder = recordPatches(query);
                options.onMutate(preparedData);
                recorder.stop();
            }

            const opts = {
                variables,
                ...options
            };

            const nextSuccess = (result: any) => () => {
                if (recorder) {
                    recorder.undo();
                }
                self._updateData(result, { isLoading: false, error: null });
                options.onMutate?.((self as any).data);
                return { data: (self as any).data, error: null, result };
            };
            const nextError = (err: any) => () => {
                if (err instanceof DisposedError) {
                    return { data: null,  error: null, result: null };
                }
                if (recorder) {
                    recorder.undo();
                }
                self._updateData(null, { isLoading: false, error: err });
                options.onError?.(err, self);
                return { data: null, error: err, result: null };
            };

            return self._run(mutateFn, opts).then(
                (result: any) => {
                    return nextSuccess(result);
                },
                (err: any) => {
                    return nextError(err);
                }
            );
        },
        _updateStatus(status: any) {
            self.error = status.error;
            self.isLoading = status.isLoading;
        }
    }));

export interface MutationModelType extends Instance<typeof MutationModel> {}

export default MutationModel;
