import { describe, expect, test } from 'vitest';
import { types, type IAnyType, type IAnyModelType } from 'mobx-state-tree';
import { createModelStore, createRootStore, QueryClient } from '../src';
import { merge } from '../src/merge';
import { runInAction } from 'mobx';

// Mirrors Opto's FieldModel: concrete models in separate stores, with Copy/Ref
// models holding an optional reference to the same union through types.late.
const FieldBase = types.model('FieldModelBase', { id: types.identifier });
const FieldStringModel = FieldBase.named('FieldStringModel').props({
    kind: types.optional(types.literal('String'), 'String'),
    value: types.maybe(types.string),
});
const FieldDecimalModel = FieldBase.named('FieldDecimalModel').props({
    kind: types.optional(types.literal('Decimal'), 'Decimal'),
    value: types.maybe(types.number),
});
const FieldCopyModel: IAnyModelType = FieldBase.named('FieldCopyModel').props({
    kind: types.optional(types.literal('Copy'), 'Copy'),
    field: types.maybe(types.reference(types.late((): IAnyType => FieldModel))),
});
const FieldRefModel: IAnyModelType = FieldBase.named('FieldRefModel').props({
    kind: types.optional(types.literal('Ref'), 'Ref'),
    field: types.maybe(types.reference(types.late((): IAnyType => FieldModel))),
});
const FieldModel = types.union(FieldCopyModel, FieldDecimalModel, FieldRefModel, FieldStringModel);
const TemplateModel = types.model('TemplateModel', {
    id: types.identifier,
    fields: types.union(types.null, types.undefined, types.array(types.reference(FieldModel))),
});
const Root = createRootStore({
    strings: types.optional(createModelStore('StringStore', FieldStringModel), {}),
    decimals: types.optional(createModelStore('DecimalStore', FieldDecimalModel), {}),
    copies: types.optional(createModelStore('CopyStore', FieldCopyModel), {}),
    refs: types.optional(createModelStore('RefStore', FieldRefModel), {}),
    templates: types.optional(createModelStore('TemplateStore', TemplateModel), {}),
});

describe('FieldModel nested union normalization', () => {
    test.each([
        ['Copy', 'String'],
        ['Copy', 'Decimal'],
        ['Ref', 'String'],
        ['Ref', 'Decimal'],
    ])('%s resolves its nested %s field and reuses cached models', (kind, valueKind) => {
        const client = new QueryClient({ RootStore: Root });
        client.init();
        const snapshot = {
            id: 'template',
            fields: [
                {
                    id: 'account',
                    kind,
                    field: {
                        id: 'account:value',
                        kind: valueKind,
                        value: valueKind === 'String' ? '1000' : 1000,
                    },
                },
            ],
        };

        const template = runInAction(() => merge(snapshot, TemplateModel, client.config.env));
        const wrapper = template.fields[0];
        const value = wrapper.field;
        const store = valueKind === 'String' ? client.rootStore.strings : client.rootStore.decimals;
        expect(value).toBe(store.models.get('account:value'));
        expect(value.value).toBe(valueKind === 'String' ? '1000' : 1000);

        const updated = runInAction(() =>
            merge(
                {
                    ...snapshot,
                    fields: [
                        {
                            ...snapshot.fields[0],
                            field: {
                                ...snapshot.fields[0].field,
                                value: valueKind === 'String' ? '1500' : 1500,
                            },
                        },
                    ],
                },
                TemplateModel,
                client.config.env,
            ),
        );
        expect(updated).toBe(template);
        expect(updated.fields[0]).toBe(wrapper);
        expect(updated.fields[0].field).toBe(value);
        expect(value.value).toBe(valueKind === 'String' ? '1500' : 1500);
    });

    test('normalizes multiple nested wrappers', () => {
        const client = new QueryClient({ RootStore: Root });
        client.init();
        const template = runInAction(() =>
            merge(
                {
                    id: 'template',
                    fields: [
                        {
                            id: 'copy',
                            kind: 'Copy',
                            field: {
                                id: 'ref',
                                kind: 'Ref',
                                field: { id: 'value', kind: 'Decimal', value: 5 },
                            },
                        },
                    ],
                },
                TemplateModel,
                client.config.env,
            ),
        );
        expect(template.fields[0]).toBe(client.rootStore.copies.models.get('copy'));
        expect(template.fields[0].field).toBe(client.rootStore.refs.models.get('ref'));
        expect(template.fields[0].field.field).toBe(client.rootStore.decimals.models.get('value'));
    });

    test.each([null, undefined])('preserves absent optional fields (%s)', (fields) => {
        const client = new QueryClient({ RootStore: Root });
        client.init();
        const template = runInAction(() =>
            merge({ id: 'template', fields }, TemplateModel, client.config.env),
        );
        expect(template.fields).toBe(fields);
    });
});
