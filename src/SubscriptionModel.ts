import { Instance, addDisposer } from 'mobx-state-tree';
import QueryModelBase from './QueryModelBase';

export const SubscriptionModel = QueryModelBase.named('SubscriptionModel').actions((self) => {
    return {
        subscribe(queryFn: any, variables = {}, options = {}) {
            const opts = {
                variables,
                ...options,
            };

            const subscriber = {
                next(data: any) {
                    const selfAny = self as any;

                    if (selfAny.shouldUpdate) {
                        const update = selfAny.shouldUpdate(data);
                        if (!update) {
                            return;
                        }
                    }

                    self.__MstQueryHandler.updateData(data);

                    const currentData = selfAny.data;
                    selfAny.onUpdate?.(currentData, data);
                    selfAny.__MstQueryHandler.options?.onUpdate?.(currentData, data);
                },
                error(error: any) {
                    self.__MstQueryHandler.setError(error);
                },
            };

            const subscription = queryFn(subscriber, opts.variables, opts);
            if (subscription) {
                addDisposer(self, subscription);
            }
        },
    };
});

export interface SubscriptionModelType extends Instance<typeof SubscriptionModel> {}

export default SubscriptionModel;
