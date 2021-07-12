import { Instance, toGeneratorFunction } from 'mobx-state-tree';
import QueryModelBase from './QueryModelBase';

export const QueryModel = QueryModelBase.named('QueryModel')
    .views((self) => ({
        get isRefetching() {
            return self.__MstQueryHandler.isRefetching;
        },
        get isFetchingMore() {
            return self.__MstQueryHandler.isFetchingMore;
        },
        get isFetched() {
            return self.__MstQueryHandler.isFetched;
        }
    }))
    .actions((self) => {
        return {
            query: toGeneratorFunction(self.__MstQueryHandler.query),
            queryMore: toGeneratorFunction(self.__MstQueryHandler.queryMore),
            refetch: self.__MstQueryHandler.refetch,
            __MstQueryHandlerAction(action: any) {
                return action();
            }
        };
    });

export interface QueryModelType extends Instance<typeof QueryModel> {}

export default QueryModel;
