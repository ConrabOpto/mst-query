import { Field } from '../src/models';
import { FieldHandlerProps, HandlerOptions } from '../src/types';
import { fieldHandler } from '../src/field-handler';
import { test, expect, describe } from 'vitest';

describe('field handler', () => {
    const createGeneratedField = (field: Field, knownTypes: string[] = []) => {
        const handlerProps = { field, fieldType: field.type, knownTypes } as FieldHandlerProps;
        const handlerOptions = { addImport: () => {} } as HandlerOptions;
        return fieldHandler?.(handlerProps, handlerOptions);
    };

    test('should handle boolean field', () => {
        const field = new Field({
            name: `TestBooleanField`,
            type: {
                kind: 'NON_NULL',
                ofType: {
                    kind: 'SCALAR',
                    name: 'Boolean',
                },
            },
        });
        const expected = `types.union(types.undefined, types.boolean)`;

        const generatedField = createGeneratedField(field);
        const value = generatedField?.toString();

        expect(expected).toStrictEqual(value);
    });

    test('should handle string field', () => {
        const field = new Field({
            name: `TestStringField`,
            type: {
                kind: 'NON_NULL',
                ofType: {
                    kind: 'SCALAR',
                    name: 'String',
                },
            },
        });

        const expected = `types.union(types.undefined, types.string)`;

        const generatedField = createGeneratedField(field);
        const value = generatedField?.toString();

        expect(expected).toStrictEqual(value);
    });

    test('should handle id field', () => {
        const field = new Field({
            name: `TestIdField`,
            type: {
                kind: 'NON_NULL',
                ofType: {
                    kind: 'SCALAR',
                    name: 'ID',
                },
            },
        });

        const expected = `types.identifier`;

        const generatedField = createGeneratedField(field);
        const value = generatedField?.toString();

        expect(expected).toStrictEqual(value);
    });

    test('should handle nullable path field', () => {
        const field = new Field({
            name: `TestPathField`,
            type: {
                kind: 'SCALAR',
                name: 'String',
            },
        });

        const expected = `types.union(types.undefined, types.null, types.string)`;

        const generatedField = createGeneratedField(field);
        const value = generatedField?.toString();

        expect(value).toStrictEqual(expected);
    });

    test('should handle nullable object field', () => {
        const field = new Field({
            name: `TestObjectField`,
            type: {
                kind: 'OBJECT',
                name: 'TestObject',
            },
        });
        const expected = `types.union(types.undefined, types.null, types.late(():any => TestObjectModel))`;

        const generatedField = createGeneratedField(field, ['TestObject']);
        const value = generatedField?.toString();

        expect(expected).toStrictEqual(value);
    });

    test('should handle non null object field', () => {
        const field = new Field({
            name: `TestObjectField`,
            type: {
                kind: 'NON_NULL',
                ofType: {
                    kind: 'OBJECT',
                    name: 'TestObject',
                },
            },
        });
        const expected = `types.union(types.undefined, types.late(():any => TestObjectModel))`;

        const generatedField = createGeneratedField(field, ['TestObject']);
        const value = generatedField?.toString();

        expect(expected).toStrictEqual(value);
    });

    test('should handle enum field', () => {
        const field = new Field({
            name: `TestEnumField`,
            type: {
                kind: 'NON_NULL',
                ofType: {
                    kind: 'ENUM',
                    name: 'Origin',
                },
            },
        });
        const expected = `types.union(types.undefined, OriginTypeEnum)`;

        const generatedField = createGeneratedField(field);
        const value = generatedField?.toString();

        expect(expected).toStrictEqual(value);
    });
});
