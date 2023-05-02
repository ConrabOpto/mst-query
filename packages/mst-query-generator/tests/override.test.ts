import path from 'path';
import { FieldHandlerProps, HandlerOptions, TypeHandlerProps } from '../src/types';
import { FieldOverrideType } from '../src/types';
import { Schema, Config } from '../src/models';
import { TypeResolver } from '../src/TypeResolver';
import { filterTypes } from '../src/utils';
import { parseFieldOverrides } from '../src/overrides';
import { scaffold } from '../generator/scaffold';
import { test, expect, describe } from 'vitest';
import { typeHandler } from '../src/typeHandler';

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
            },
        ] as FieldOverrideType[];

        const result: FieldOverrideType[] = parseFieldOverrides(override);

        expect(result).toEqual(expected);
    });

    test.only('should parse string or array overrides', () => {
        const overrideValue = 'User.user_id:ID:string';
        const overrideList = ['User.user_id:ID:string'];
        const expected = [
            {
                rootTypeName: 'User',
                fieldName: 'user_id',
                oldFieldType: 'ID',
                newFieldType: 'string',
            },
        ];

        const overrideValueResult: FieldOverrideType[] = parseFieldOverrides(overrideValue);
        expect(overrideValueResult).toEqual(expected);

        const overrideListResult: FieldOverrideType[] = parseFieldOverrides(overrideList);
        expect(overrideListResult).toEqual(expected);
    });

    test('should override model fields', () => {
        const expected = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';
import { ModelBase } from './ModelBase';

export const TodoModelBase = ModelBase.named('Todo').props({
    __typename: types.optional(types.literal('Todo'), 'Todo'),
    id: types.union(types.undefined, types.null, types.string),
    text: types.union(types.undefined, types.testType),
    complete: types.union(types.undefined, types.boolean),
});`;

        const override = 'Todo.text:string:testType,Todo.id:ID:string';
        const files = createGeneratedFiles('todos.graphql', 'Todo', override);
        const content = files[0].toString();

        expect(content).toStrictEqual(expected);
    });
});
