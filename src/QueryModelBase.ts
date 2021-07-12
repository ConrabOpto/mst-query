import { types } from 'mobx-state-tree';
import { MstQueryHandler } from './MstQueryHandler';

export const QueryModelBase = types
    .model('QueryModel', {})
    .volatile((self) => ({
        __MstQueryHandler: new MstQueryHandler(self),
    }))
    .views((self) => ({
        get isLoading() {
            return self.__MstQueryHandler.isLoading;
        },
        get error() {
            return self.__MstQueryHandler.error;
        },
    }))
    .actions((self) => {
        return {
            __MstQueryHandlerAction(action: any) {
                return action();
            },
        };
    });

export default QueryModelBase;
