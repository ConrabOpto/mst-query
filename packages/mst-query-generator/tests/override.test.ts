import path from 'path';
import { FieldHandlerProps, HandlerOptions } from '../src/types';
import { Schema, Config } from '../src/models';
import { TypeResolver } from '../src/models/TypeResolver';
import { filterTypes } from '../src/utils';
import { scaffold } from '../generator/scaffold';
import { test, expect, describe } from 'vitest';
import { typeHandler } from '../src/type-handler';
import { FieldOverride } from '../src/models/FieldOverride';
import { Overrides } from '../src/models/Overrides';

describe('field overrides', () => {
    const createGeneratedFiles = (
        schemaFile: string,
        rootTypeName: string,
        fieldOverrides: string
    ) => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/${schemaFile}`,
            outDir: 'somepath',
            fieldOverrides,
        });
        const json = scaffold(config);
        const schema = new Schema(json.__schema);
        const rootTypes = filterTypes(schema.types);
        const typeNames = rootTypes.map((t) => t.name);
        const typeResolver = new TypeResolver({ rootTypes });

        const rootType = rootTypes.find((r) => r.name === rootTypeName)!;
        const props = { rootType, knownTypes: typeNames } as FieldHandlerProps;
        const options = { config, typeResolver } as HandlerOptions;

        return typeHandler(props, options);
    };
    test('should generate type field override result', () => {
        const override = 'User.user_id:ID:string';
        const expected = [
            {
                rootTypeName: 'User',
                fieldName: 'user_id',
                oldFieldType: 'ID',
                newFieldType: 'string',
                typeImportPath: undefined,
            },
        ];

        const fieldOverrides = FieldOverride.parse(override);
        const overrides = new Overrides({ overrides: fieldOverrides });

        expect(overrides.fieldOverrides.map((o) => o.json())).toEqual(expected);
    });

    test('should parse string or array overrides', () => {
        const override = 'User.user_id:ID:string';
        const overrides = ['User.user_id:ID:string'];
        const expected = [
            {
                rootTypeName: 'User',
                fieldName: 'user_id',
                oldFieldType: 'ID',
                newFieldType: 'string',
                typeImportPath: undefined,
            },
        ];

        const overrideResult: FieldOverride[] = FieldOverride.parse(override);
        expect(overrideResult.map((x) => x.json())).toEqual(expected);

        const overridesResult: FieldOverride[] = FieldOverride.parse(overrides);
        expect(overridesResult.map((x) => x.json())).toEqual(expected);
    });

    test('should override model fields', () => {
        const expected = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';
import { ModelBase } from './ModelBase';
import { CustomDateTime } from '@conrabopto/components';

export const TodoModelBase = ModelBase.named('Todo').props({
    __typename: types.optional(types.literal('Todo'), 'Todo'),
    id: types.union(types.undefined, types.null, types.string),
    text: types.union(types.undefined, types.testType),
    complete: types.union(types.undefined, types.boolean),
    date: types.union(types.undefined, types.null, CustomDateTime),
});`;

        const idOverride = 'Todo.id:ID:string';
        const testTypeOverride = 'Todo.text:String:testType';
        const dateOverride = 'Todo.date:DateTime:CustomDateTime:-@conrabopto/components';
        const override = `${idOverride},${testTypeOverride},${dateOverride}`;

        const files = createGeneratedFiles('todos.graphql', 'Todo', override);
        const content = files[0].toString();

        expect(content).toStrictEqual(expected);
    });
});
