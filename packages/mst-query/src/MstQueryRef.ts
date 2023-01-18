import { types, getIdentifier, IAnyComplexType, getEnv } from 'mobx-state-tree';
import { getSubType } from './utils';

export const MstQueryRef = <IT extends IAnyComplexType>(type: IT) =>
    types.reference(type, {
        get(id, parent) {
            const t = getSubType(type);
            const env = getEnv(parent);
            return env.queryClient.rootStore.__MstQueryAction('get', t, id) ?? id;
        },
        set(value) {
            const id = getIdentifier(value)!;
            return id;
        },
    });
