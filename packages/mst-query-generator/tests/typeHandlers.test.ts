import path from 'path';
import { RootType, Schema, Config } from '../src/models';
import { FieldHandlerProps, HandlerOptions, TypeHandlerProps } from '../src/types';
import { TypeResolver } from '../src/TypeResolver';
import { filterTypes } from '../src/utils';
import { scaffold } from '../generator/scaffold';
import { test, expect, describe } from 'vitest';
import { typeHandler } from '../src/typeHandler';
import { Generate } from '../generator/generate';

describe('type handler', () => {
    const createGeneratedFiles = (schemaFile: string, rootTypeName: string) => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/${schemaFile}`,
            outDir: 'somepath',
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

    test('should generate model file content for object type', () => {
        const expectedContent = `\
import { Instance } from 'mobx-state-tree';
import { TestObjectModelBase } from './TestObjectModel.base';

export const TestObjectModel = TestObjectModelBase;

export interface TestObjectModelType extends Instance<typeof TestObjectModel> {}`;

        const rootType = new RootType({
            name: 'TestObject',
            kind: 'OBJECT',
        });
        const typeResolver = new TypeResolver({ rootTypes: [rootType] });
        const config = new Config({ models: true });

        const props = { rootType, knownTypes: [] } as TypeHandlerProps;
        const options = { config, typeResolver } as HandlerOptions;
        const files = typeHandler(props, options);

        const content = files[1].toString();
        expect(content).toStrictEqual(expectedContent);
    });

    test('should generate enum file content', () => {
        const expected = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';

export const TestType = {
    SomeValue: 'SOME_VALUE',
    SomeOtherValue: 'SOME_OTHER_VALUE'
};

export type TestTypeType = typeof TestType[keyof typeof TestType];

export const TestTypeTypeEnum = types.enumeration<TestTypeType>(
    'TestTypeTypeEnum',
    Object.values(TestType)
);`;

        const rootType = new RootType({
            name: 'TestType',
            kind: 'ENUM',
            enumValues: [{ name: 'SOME_VALUE' }, { name: 'SOME_OTHER_VALUE' }],
        });

        const typeNames = [rootType.name];
        const props = { rootType, knownTypes: typeNames } as FieldHandlerProps;
        const options = {} as HandlerOptions;
        const files = typeHandler(props, options);
        const content = files[0].toString();

        expect(content).toStrictEqual(expected);
    });

    test('should generate model base file content for object type', () => {
        const expectedContent = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';
import { ModelBase } from './ModelBase';

export const TestObjectModelBase = ModelBase.named('TestObject').props({
    __typename: types.optional(types.literal('TestObject'), 'TestObject'),
});`;

        const rootType = new RootType({
            name: 'TestObject',
            kind: 'OBJECT',
        });

        const typeResolver = new TypeResolver({ types: [rootType] });
        const props = { rootType, knownTypes: [] } as TypeHandlerProps;
        const options = { typeResolver } as HandlerOptions;
        const files = typeHandler(props, options);

        const content = files[0].toString();
        expect(content).toStrictEqual(expectedContent);
    });

    test('should handle union types', () => {
        const expected = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';
import { ModelBase } from './ModelBase';
import { MstQueryRef } from 'mst-query';
import { withTypedRefs } from '../Utils/WithTypedRefs';
import { BasicTodoModel, BasicTodoModelType } from './BasicTodoModel';
import { FancyTodoModel, FancyTodoModelType } from './FancyTodoModel';

type Refs = {
    todos: BasicTodoModelType | FancyTodoModelType;
};

export const TodoListModelBase = withTypedRefs<Refs>()(ModelBase.named('TodoList').props({
    __typename: types.optional(types.literal('TodoList'), 'TodoList'),
    id: types.identifier,
    todos: types.union(types.undefined, types.array(MstQueryRef(types.union(types.late(():any => BasicTodoModel), types.late(():any => FancyTodoModel))))),
}));`;

        const files = createGeneratedFiles('unionTypes.graphql', 'TodoList');
        const content = files[0].toString();

        expect(content).toStrictEqual(expected);
    });

    test('should handle nullable interface types', () => {
        const expected = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';
import { ModelBase } from './ModelBase';
import { MstQueryRef } from 'mst-query';
import { withTypedRefs } from '../Utils/WithTypedRefs';
import { UserModel, UserModelType } from './UserModel';

type Refs = {
    owner: UserModelType;
};

export const FancyTodoModelBase = withTypedRefs<Refs>()(ModelBase.named('FancyTodo').props({
    __typename: types.optional(types.literal('FancyTodo'), 'FancyTodo'),
    id: types.identifier,
    label: types.union(types.undefined, types.null, types.string),
    color: types.union(types.undefined, types.null, types.string),
    complete: types.union(types.undefined, types.null, types.boolean),
    owner: types.union(types.undefined, types.null, MstQueryRef(types.late(():any => UserModel))),
}));`;

        const files = createGeneratedFiles('unionTypes.graphql', 'FancyTodo');
        const content = files[0].toString();

        expect(content).toStrictEqual(expected);
    });

    test.only('should handle array Refs', () => {
        const expected = `\
/* This is a generated file, don't modify it manually */
/* eslint-disable */
/* tslint:disable */
import { types } from 'mobx-state-tree';
import { ModelBase } from './ModelBase';
import { withTypedRefs } from '../Utils/WithTypedRefs';
import { BookModel, BookModelType } from './BookModel';
import { MovieModel, MovieModelType } from './MovieModel';

type Refs = {
    items: MovieModelType | BookModelType;
};

export const SearchResultModelBase = withTypedRefs<Refs>()(ModelBase.named('SearchResult').props({
    __typename: types.optional(types.literal('SearchResult'), 'SearchResult'),
    items: types.union(types.undefined, types.array(types.union(types.late(():any => MovieModel), types.late(():any => BookModel)))),
}));`;

        const files = createGeneratedFiles('abstractTypes.graphql', 'SearchResult');
        const content = files[0].toString();
        console.log(files);

        expect(content).toStrictEqual(expected);
    });

    test.skip('asdf', () => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/../../../../schema.graphql`,
            outDir: 'somepath',
            models: true,
        });
        const json = scaffold(config);
        const schema = new Schema(json.__schema);
        const rootTypes = filterTypes(schema.types);
        const typeResolver = new TypeResolver({ rootTypes });

        var generate = new Generate({
            rootTypes,
            typeHandler,
            typeResolver,
            excludes: [],
            config,
        });

        generate.GenerateTypes();

        const files = generate.files;
        const result = files.find((f) => f.name.startsWith('SavedSearchColumnSetting'));
        console.log(result);
    });
});
