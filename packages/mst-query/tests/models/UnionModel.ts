import { types } from "mobx-state-tree";

export const FixedModel = types.model('FixedModel', {
    id: types.identifier,
    kind: types.literal('FIXED'),
    fixedValue: types.string,
});

export const FormatModel = types.model('FormatModel', {
    id: types.identifier,
    kind: types.literal('FORMAT'),
    formatValue: types.string,
});


export const UnionModel = types.union(FixedModel, FormatModel);