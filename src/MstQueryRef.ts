import { types, getIdentifier, IAnyComplexType } from 'mobx-state-tree';
import { config } from './config';
import { getSubType } from './utils';

export const MstQueryRef = <IT extends IAnyComplexType>(type: IT) =>
    types.reference(type, {
        get(id) {
            const t = getSubType(type);
            return config.rootStore.get(t, id) ?? id;
        },
        set(value) {
            const id = getIdentifier(value)!;
            return id;
        },
    });
