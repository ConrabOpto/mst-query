import {
    getIdentifier,
    getType,
    IAnyModelType,
    isAlive,
    isArrayType,
    isStateTreeNode,
    destroy,
    Instance,
} from 'mobx-state-tree';

export async function gc(node: Instance<IAnyModelType>) {
    const promises: Promise<any>[] = [];
    gcInternal(node, promises);
    return Promise.all(promises);
}

function gcInternal(node: any, promises: Promise<any>[]) {
    if (node && node.__MstQueryHandler) {
        promises.push(node.__MstQueryHandler.remove());
        return;
    }

    if (
        !node ||
        !isStateTreeNode(node) ||
        !isAlive(node) ||
        node instanceof Date ||
        typeof node !== 'object'
    ) {
        return;
    }

    const t = getType(node) as any;
    if (isArrayType(t)) {
        (node as any).forEach((n: any) => destroy(n));
        return;
    }

    const nodeIdentifier = getIdentifier(node);
    if (nodeIdentifier) {
        return;
    }

    for (const key in t.properties) {
        gcInternal((node as any)[key], promises);
    }
}
