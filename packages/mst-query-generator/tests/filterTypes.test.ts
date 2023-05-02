import { Generate } from '../generator/generate';
import { Config, RootType } from '../src/models';
import { filterTypes } from '../src/utils';
import { test, expect, describe } from 'vitest';

describe('filter types', () => {
    test('should ignore types in exclude', () => {
        const model = new RootType({ name: 'test', kind: 'OBJECT' });
        const config = new Config({ excludes: 'test' });
        const generate = new Generate({ rootTypes: [model], config });

        const result = filterTypes(generate.rootTypes, generate.excludes);

        expect(result).toHaveLength(0);
    });

    test('should ignore types starting with __', () => {
        const model = new RootType({ name: '__test', kind: 'OBJECT' });
        const generate = new Generate({ rootTypes: [model] });

        const result = filterTypes(generate.rootTypes, generate.excludes);

        expect(result).toHaveLength(0);
    });

    test('should ignore scalar types', () => {
        const model1 = new RootType({ name: 'scalar-type', kind: 'SCALAR' });
        const model2 = new RootType({ name: 'object-type', kind: 'OBJECT' });
        const generate = new Generate({ rootTypes: [model1, model2] });

        const result = filterTypes(generate.rootTypes, generate.excludes);

        expect(result).toHaveLength(1);
    });
});
