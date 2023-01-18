import { Generate } from '../generator/generate';
import { RootType } from '../src/models';
import { test, expect, describe } from 'vitest';

describe('generate', () => {
    test('should create index file', () => {
        const model = new RootType({ name: 'test', kind: 'OBJECT' });
        const generate = new Generate({ rootTypes: [model] });

        generate.GenerateIndexFile();

        expect(generate.files).toHaveLength(1);
    });

    test('should update type name to camel case', () => {
        const model = new RootType({ name: 'test' });
        const generate = new Generate({ rootTypes: [model] });

        generate.UpdateNamesToCamelCase();

        expect(model.name).toBe('Test');
    });

    test('should generate model base', () => {
        const expected = `\
import { types } from "mobx-state-tree"
export const ModelBase = types.model({});`;

        const generate = new Generate({ rootTypes: [] });
        generate.GenerateModelBase();

        expect(generate.files).toHaveLength(1);

        const content = generate.files[0].toString();

        expect(content).toStrictEqual(expected);
    });
});
