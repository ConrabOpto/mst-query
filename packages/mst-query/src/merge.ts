import {
    addDisposer,
    getIdentifier,
    getRoot,
    getSnapshot,
    getType,
    isFrozenType,
    isMapType,
    isAlive,
    isOptionalType,
    isStateTreeNode,
    protect,
    types,
    unprotect,
} from 'mobx-state-tree';
import { getKey } from './QueryStore';
import type { QueryClient } from './QueryClient';
import { getRealTypeFromObject, getSubType, isObject } from './utils';

// The MST environment, which also becomes the environment of created models
type MergeEnv = { queryClient: QueryClient<any>; [key: string]: any };

export function merge(data: any, typeDef: any, ctx: MergeEnv, cloneInstances = false): any {
    if (!data || data instanceof Date || typeof data !== 'object') {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map((d) => merge(d, getSubType(typeDef, d), ctx));
    }

    // convert values deeply first to MST objects as much as possible
    const snapshot: any = {};
    for (const key in data) {
        const realType = getRealTypeFromObject(typeDef, data, key);
        if (!realType) continue;
        snapshot[key] = merge(data[key], realType, ctx);
    }

    if (isMapType(typeDef)) {
        return snapshot;
    }

    return mergeInstance(snapshot, data, typeDef, ctx, cloneInstances);
}

function mergeInstance(
    snapshot: any,
    data: any,
    typeDef: any,
    ctx: MergeEnv,
    cloneInstances: boolean,
) {
    // GQL object with known type, instantiate or recycle MST object
    // Try to reuse instance.
    const modelType = getSubType(typeDef, snapshot);
    const identifierAttribute = modelType.identifierAttribute;
    let id = data[identifierAttribute];
    // Resolve generated identifiers without creating a detached model whose
    // safe references would be invalidated before reaching the model store.
    const identifierType = modelType.properties?.[identifierAttribute];
    if (id === undefined && isOptionalType(identifierType)) {
        const Identifier = types.model({ [identifierAttribute]: identifierType });
        id = Identifier.create({}, ctx)[identifierAttribute];
        snapshot[identifierAttribute] = id;
    }

    const models = ctx.queryClient.queryStore.models;
    const key = id != null ? getKey(modelType, id) : undefined;
    let instance = key !== undefined ? models.get(key) : undefined;
    if (instance && (!isAlive(instance) || getRoot(instance) !== ctx.queryClient.rootStore)) {
        models.delete(key!);
        instance = undefined;
    }

    if (cloneInstances && instance) {
        // Build the detached result from snapshots so updating reference arrays does not
        // try to resolve their old values outside the root store.
        const existingSnapshot = getSnapshot<any>(instance);
        return modelType.create(
            { ...existingSnapshot, ...mergeObjects(existingSnapshot, snapshot, typeDef) },
            ctx,
        );
    }

    if (instance) {
        // update existing object
        const root = getRoot(instance);
        unprotect(root);
        try {
            Object.assign(instance, mergeObjects(instance, snapshot, typeDef));
        } finally {
            protect(root);
        }
        return instance;
    }

    if (id != null) {
        // Instantiate inside the store so references can resolve immediately.
        instance = ctx.queryClient.rootStore.__MstQueryAction('put', modelType, id, snapshot);
    } else {
        instance = modelType.create(snapshot, ctx);
        const storedId = isStateTreeNode(instance) ? getIdentifier(instance) : undefined;
        if (storedId == null) {
            return snapshot;
        }
        instance = ctx.queryClient.rootStore.__MstQueryAction('put', modelType, storedId, instance);
    }
    const storedKey = getKey(modelType, getIdentifier(instance!) as string);
    models.set(storedKey, instance);
    addDisposer(instance, () => {
        if (models.get(storedKey) === instance) {
            models.delete(storedKey);
        }
    });
    return instance;
}

function mergeObjects(instance: any, data: any, typeDef: any): any {
    const snapshot: any = {};
    const properties = data && isStateTreeNode(data) ? (getType(data) as any).properties : data;
    for (const key in properties) {
        const realType = getRealTypeFromObject(typeDef, data, key);
        if (!realType) continue;
        if (
            !isFrozenType(realType) &&
            isObject(data[key]) &&
            !(data[key] instanceof Date) &&
            isObject(instance[key]) &&
            !(isStateTreeNode(data[key]) && getIdentifier(data[key])) &&
            !(isStateTreeNode(instance[key]) && getIdentifier(instance[key]))
        ) {
            // Non-identifier object that's not frozen and is updating an existing instance
            const current = instance[key];
            const mergedValue = mergeObjects(current, data[key], realType);
            const isNode = isStateTreeNode(data);
            isNode && unprotect(data);
            snapshot[key] = isStateTreeNode(instance)
                ? Object.assign(current, mergedValue)
                : { ...current, ...mergedValue };
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
