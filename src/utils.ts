import {
    isUnionType,
    isModelType,
    isLateType,
    isOptionalType,
    isArrayType,
    isReferenceType,
    unprotect,
    protect,
    isStateTreeNode,
    isFrozenType,
    getSnapshot,
    getIdentifier,
    getType,
    isIdentifierType,
    getRoot,
} from 'mobx-state-tree';
import { isObservableArray } from 'mobx';
import { objMap } from './MstQueryRef';
import { config } from './config';

export function getRealTypeFromObject(typeDef: any, data: any, key: any) {
    const modelOrBaseType = getSubType(typeDef, data[key]);
    if (modelOrBaseType && modelOrBaseType.properties && !modelOrBaseType.properties[key]) {
        throw new Error(`${key} property missing from ${modelOrBaseType.name} model`);
    }
    const subType =
        modelOrBaseType.properties && !isFrozenType(modelOrBaseType)
            ? getSubType((modelOrBaseType as any).properties[key], data[key])
            : modelOrBaseType;
    return subType;
}

export function getSubType(t: any, data?: any): any {
    if (isUnionType(t)) {
        const actualType = t.determineType && data !== undefined && t.determineType(data);
        if (actualType) {
            return actualType;
        }
        if (!t.determineType) {
            return getSubType(t._subtype);
        }
        const subTypes = t._types.map((t: any) => getSubType(t, data));
        const modelWithProperties = subTypes.find((x: any) => isModelType(x) || isReferenceType(x));
        if (modelWithProperties) {
            return getSubType(modelWithProperties, data);
        }
        return t;
    } else if (isLateType(t)) {
        return getSubType((t as any).getSubType(), data);
    } else if (isOptionalType(t)) {
        return getSubType((t as any)._subtype, data);
    } else if (isArrayType(t)) {
        return getSubType((t as any)._subType, data);
    } else if (isReferenceType(t)) {
        return getSubType((t as any).targetType, data);
    } else if (isLateType(t)) {
        return getSubType((t as any).getSubType(), data);
    } else {
        return t;
    }
}

function isArray(a: any) {
    return Array.isArray(a) || isObservableArray(a);
}

export function isObject(a: any) {
    return a && typeof a === 'object' && !isArray(a);
}

export function merge(data: any, typeDef: any, ctx: any): any {
    if (!data || data instanceof Date || typeof data !== 'object') {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map((d) => merge(d, getSubType(typeDef, d), ctx));
    }
    const id = config.getId(data);

    // convert values deeply first to MST objects as much as possible
    const snapshot: any = {};
    for (const key in data) {
        snapshot[key] = merge(data[key], getRealTypeFromObject(typeDef, data, key), ctx);
    }

    // GQL object with known type, instantiate or recycle MST object
    // Try to reuse instance.
    const modelType = getSubType(typeDef);
    const hasIdentifier =
        modelType && modelType.properties && isIdentifierType(config.getId(modelType.properties));
    if (hasIdentifier && !id) {
        console.warn(
            'You are mapping data to a model with identifier, but no unique id was found in the data.'
        );
    }

    const key = `${modelType.name}:${id}`;
    let instance = hasIdentifier && objMap.get(key);
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
        if (hasIdentifier) {
            const key = `${modelType.name}:${config.getId(instance)}`;
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
