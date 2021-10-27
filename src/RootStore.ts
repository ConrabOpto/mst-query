import { destroy, IAnyModelType, ModelPropertiesDeclaration, types } from 'mobx-state-tree';

const getKey = (type: IAnyModelType, id: string | number) => {
    return `${type.name}:${id}`;
};

const getStoreNameDefault = (typeName: string) => {
    const str = typeName.replace(/Model$/, '');
    return `${str[0].toLowerCase()}${str.slice(1)}Store`;
};

type MstQueryAction = 'get' | 'put' | 'delete';

export const createModelStore = <T extends ModelPropertiesDeclaration>(props: T) => {
    return types.model(props).actions((self) => ({
        __MstQueryAction(action: MstQueryAction, id: string, instance: any) {
            const map = self[Object.keys(props)[0]] as any;
            switch (action) {
                case 'get':
                    return map.get(id);
                case 'put':
                    map.put(instance);
                    break;
                case 'delete':
                    map.delete(id);
                    break;
            }
        },
    }));
};

export const createRootStore = <T extends ModelPropertiesDeclaration>(
    props: T,
    getStoreName = getStoreNameDefault
) => {
    return types.model('RootStore', props).actions((self) => ({
        __MstQueryAction(action: MstQueryAction, type: IAnyModelType, id: string, instance?: any) {
            const store = self[getStoreName(type.name)] as any;
            const result = store.__MstQueryAction(action, id, instance);

            if (action === 'delete') {
                destroy(instance);
            }

            return result;
        },
    }));
};

export const RootStore = types
    .model('RootStore')
    .volatile(() => ({
        models: new Map(),
    }))
    .actions((self) => ({
        __MstQueryAction(action: MstQueryAction, type: IAnyModelType, id: string, instance?: any) {
            switch (action) {
                case 'get':
                    return self.models.get(getKey(type, id));
                case 'put':
                    self.models.set(getKey(type, id), instance);
                    break;
                case 'delete':
                    self.models.delete(id);
                    destroy(instance);
                    break;
            }
        },
    }));
