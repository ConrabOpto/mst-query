import { IAnyType, types, getIdentifier } from "mobx-state-tree";
import { getSubType } from "./Utils";

export const objMap = new Map();

export const MstQueryRef = <IT extends IAnyType>(type: IT) =>
    types.reference(type, {
        get(id) {
            const t = getSubType(type);
            const key = `${t.name}:${id}`;
            return objMap.get(key) ?? id;
        },
        set(value) {
            const id = getIdentifier(value)!;
            return id;
        }
    });
