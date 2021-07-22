import { types, getIdentifier, IAnyComplexType } from 'mobx-state-tree';
import { getSubType } from './utils';

export const objMap = new Map();

export const MstQueryRef = <IT extends IAnyComplexType>(type: IT) =>
    types.reference(type, {
        get(id) {
            const t = getSubType(type);
            const key = `${t.name}:${id}`;
            return objMap.get(key) ?? id;
        },
        set(value) {
            const id = getIdentifier(value)!;
            return id;
        },
    });
