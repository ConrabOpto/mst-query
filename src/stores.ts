import {
    destroy,
    getEnv,
    IAnyModelType,
    Instance,
    ModelPropertiesDeclaration,
    types,
} from 'mobx-state-tree';
import { merge } from './merge';

const getStoreNameDefault = (typeName: string) => {
    const str = typeName.replace(/Model$/, '');
    return `${str[0].toLowerCase()}${str.slice(1)}Store`;
};

type MstQueryAction = 'get' | 'put' | 'delete';

export const createModelStore = <T extends IAnyModelType>(type: T) => {
    return types
        .model({
            models: types.map(type)
        })
        .actions((self) => ({
            __MstQueryAction(action: MstQueryAction, id: string, instance: any) {
                switch (action) {
                    case 'get':
                        return self.models.get(id);
                    case 'put':
                        self.models.put(instance);
                        break;
                    case 'delete':
                        self.models.delete(id);
                        break;
                }
            },
            merge(data: any): Instance<T> {
                return merge(
                    data,
                    type,
                    getEnv(self)
                );
            }
        }));
};

export const createRootStore = <T extends ModelPropertiesDeclaration>(
    props: T,
    getStoreName = getStoreNameDefault
) => {
    return types.model('RootStore', props).actions((self) => {
        const queryClient = getEnv(self).queryClient as any;
        return {
            __MstQueryAction(
                action: MstQueryAction,
                type: IAnyModelType,
                id: string,
                instance?: any
            ) {
                const store = self[getStoreName(type.name)] as any;
                const result = store.__MstQueryAction(action, id, instance);

                if (action === 'delete') {
                    destroy(instance);
                }

                return result;
            },
            getQueries<T extends IAnyModelType, InstanceType = Instance<T>>(
                query: T,
                matcherFn?: (query: InstanceType) => boolean
            ): InstanceType[] {
                return queryClient.queryStore.getQueries(query, matcherFn);
            },
            getAllQueries(): any[] {
                return queryClient.queryStore.getAllQueries();
            },
            runGc() {
                return queryClient.queryStore.runGc();
            },
        };
    });
};
