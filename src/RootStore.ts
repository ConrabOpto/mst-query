import { destroy, IAnyModelType, types } from 'mobx-state-tree';

const getKey = (type: IAnyModelType, id: string | number) => {
    return `${type.name}:${id}`;
};

export const RootStore = types
    .model('RootStore', {})
    .volatile(() => ({
        models: new Map(),
    }))
    .actions((self) => ({
        put(type: IAnyModelType, id: string | number, instance: any) {
            self.models.set(getKey(type, id), instance);
        },
        get(type: IAnyModelType, id: string | number) {
            return self.models.get(getKey(type, id));
        },
        delete(type: IAnyModelType, id: string | number, instance: any) {
            destroy(instance);
            self.models.delete(id);
        },
    }));
