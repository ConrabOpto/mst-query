import {
    Instance,
    toGeneratorFunction,
} from 'mobx-state-tree';
import QueryModelBase from './QueryModelBase';

export const MutationModel = QueryModelBase.named('MutationModel').actions((self) => ({
    mutate: toGeneratorFunction(self.__MstQueryHandler.query),
}));

export interface MutationModelType extends Instance<typeof MutationModel> {}

export default MutationModel;
