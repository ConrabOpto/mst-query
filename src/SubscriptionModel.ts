import QueryModelBase from './QueryModelBase';
import { Instance, addDisposer, IDisposer } from 'mobx-state-tree';

export const SubscriptionModel = QueryModelBase.named('SubscriptionModel')
    .volatile(() => ({
        _subscription: null as null | IDisposer,
    }))
    .actions((self) => {
        return {
            subscribe(queryFn: any, variables = {}, options = {}) {
                const opts = {
                    variables,
                    ...options,
                };

                const subscriber = {
                    next: this._next,
                    error: this._error,
                };

                self._subscription = queryFn(subscriber, opts.variables, opts);
                if (self._subscription) {
                    addDisposer(self, self._subscription);
                }
            },
            _error(error: any) {
                self.error = error;
            },
            _next(data: any) {
                if ((self as any).shouldUpdate) {
                    const update = (self as any).shouldUpdate(data);
                    if (!update) {
                        return;
                    }
                }

                self._updateData(data);

                const currentData = (self as any).data;
                (self as any).onUpdate?.(currentData, data);
                (self as any).options?.onUpdate?.(currentData, data);
            },
        };
    });

export interface SubscriptionModelType extends Instance<typeof SubscriptionModel> {}

export default SubscriptionModel;
