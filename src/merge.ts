import {
    clone,
    getIdentifier,
    getRoot,
    getSnapshot,
    getType,
    IAnyType,
    Instance,
    isFrozenType,
    isStateTreeNode,
    protect,
    unprotect,
} from 'mobx-state-tree';
import { config } from './config';
import { objMap } from './MstQueryRef';
import { getRealTypeFromObject, getSubType, isObject } from './utils';

let optimisticId = 1;

export function createOptimisticData<T extends IAnyType>(typeOrNode: T | Instance<T>, data: any) {
    const type: IAnyType = isStateTreeNode(typeOrNode) ? getType(typeOrNode) : typeOrNode;
    const instance = merge(
        { ...data, [type.identifierAttribute ?? '']: `optimistic-${optimisticId}` },
        type,
        config.env
    );
    optimisticId++;
    return instance as Instance<T>;
}

export function merge(data: any, typeDef: any, ctx: any, cloneInstances = false): any {
    if (!data || data instanceof Date || typeof data !== 'object') {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map((d) => merge(d, getSubType(typeDef, d), ctx));
    }

    // convert values deeply first to MST objects as much as possible
    const snapshot: any = {};
    for (const key in data) {
        snapshot[key] = merge(data[key], getRealTypeFromObject(typeDef, data, key), ctx);
    }

    // GQL object with known type, instantiate or recycle MST object
    // Try to reuse instance.
    const modelType = getSubType(typeDef);
    const id = data[modelType.identifierAttribute];

    const key = `${modelType.name}:${id}`;
    let instance = id && objMap.get(key);

    instance = cloneInstances && instance ? clone(instance) : instance;

    if (instance) {
        // update existing object
        const root = getRoot(instance);
        unprotect(root);
        Object.assign(instance, mergeObjects(instance, snapshot, typeDef));
        protect(root);
        return instance;
    } else if (!instance) {
        // create a new one
        instance = modelType.create(snapshot, ctx);
        const storedId = isStateTreeNode(instance) ? getIdentifier(instance) : id;
        if (storedId) {
            const key = `${modelType.name}:${storedId}`;
            objMap.set(key, instance);
        }
        return instance;
    }
    return snapshot;
}

export function mergeObjects(instance: any, data: any, typeDef: any): any {
    const snapshot: any = {};
    const properties = data && isStateTreeNode(data) ? (getType(data) as any).properties : data;
    for (const key in properties) {
        const realType = getRealTypeFromObject(typeDef, data, key);
        if (
            !isFrozenType(realType) &&
            isObject(data[key]) &&
            !(data[key] instanceof Date) &&
            isObject(instance[key]) &&
            !getIdentifier(instance[key])
        ) {
            // Non-identifier object that's not frozen and is updating an existing instance
            const mergedValue = mergeObjects(instance[key], data[key], realType);
            const isNode = isStateTreeNode(data);
            isNode && unprotect(data);
            snapshot[key] = Object.assign(instance[key], mergedValue);
            isNode && protect(data);
        } else if (isStateTreeNode(data[key]) && !getIdentifier(data[key])) {
            // Non-identifier instance in the merged data needs to be converted
            // to a snapshot for merging with the instance later
            snapshot[key] = getSnapshot(data[key]);
        } else {
            snapshot[key] = data[key];
        }
    }
    return snapshot;
}
