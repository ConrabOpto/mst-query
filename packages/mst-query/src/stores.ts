import {
    destroy,
    getEnv,
    getRoot,
    IAnyModelType,
    Instance,
    ModelPropertiesDeclaration,
    types,
} from 'mobx-state-tree';
import { merge } from './merge';

type MstQueryAction = 'get' | 'put' | 'delete';

export const createModelStore = <T extends IAnyModelType>(name: string, type: T) => {
    const modelStore = types
        .model(name, {
            models: types.map(type),
        })
        .actions((self) => {
            (self as any).$treenode.registerHook('afterCreate', () => {
                const root: any = getRoot(self);
                const modelStores = root.__getModelStores();
                if (!modelStores.get(type.name)) {
                    modelStores.set(type.name, self);
                }
            });
            return {
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
                    return merge(data, type, getEnv(self));
                },
            };
        });

    return modelStore;
};

export const createRootStore = <T extends ModelPropertiesDeclaration>(props: T) => {
    return types.model('RootStore', props).extend((self) => {
        const queryClient = getEnv(self).queryClient as any;
        const modelStores = new Map();

        // nodes are lazily created on property access, we need to
        // loop over them to setup our model store map
        (self as any).$treenode.registerHook('afterCreate', () => {
            for (let key in self as any) {
                self[key];
            }
        });

        return {
            actions: {
                __MstQueryAction(
                    action: MstQueryAction,
                    type: IAnyModelType,
                    id: string,
                    instance?: any
                ) {
                    const store = modelStores.get(type.name);
                    if (!store) {
                        throw new Error(`Missing model store for type: ${type.name}`);
                    }

                    const result = store.__MstQueryAction(action, id, instance);

                    if (action === 'delete') {
                        destroy(instance);
                    }

                    return result;
                },
                runGc() {
                    return queryClient.queryStore.runGc();
                },
            },
            views: {
                __getModelStores() {
                    return modelStores;
                },
                getQueries<T extends IAnyModelType, InstanceType = Instance<T>>(
                    query: T,
                    matcherFn?: (query: InstanceType) => boolean
                ): InstanceType[] {
                    return queryClient.queryStore.getQueries(query, matcherFn);
                },
            },
        };
    });
};
