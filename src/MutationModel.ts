import { Instance, toGeneratorFunction } from 'mobx-state-tree';
import QueryModelBase from './QueryModelBase';

export const MutationModel = QueryModelBase.named('MutationModel')
    .views((self) => ({
        get result() {
            return self.__MstQueryHandler.result;
        },
    }))
    .actions((self) => ({
        mutate: toGeneratorFunction(self.__MstQueryHandler.query),
        abort: self.__MstQueryHandler.abort,
    }));

export interface MutationModelType extends Instance<typeof MutationModel> {}

export default MutationModel;
