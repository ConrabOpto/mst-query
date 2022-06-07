import path from 'path';
import { Config, Schema } from '../src/models';
import { TypeResolver } from '../src/TypeResolver';
import { filterTypes } from '../src/utils';
import { scaffold } from '../generator/scaffold';
import { test, expect, describe } from 'vitest';

describe('TypeResolver', () => {
    test('should combine interface and union types to result model', () => {
        const expected = ['Owner', 'Todo'];

        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/unionTypes.graphql`,
            outDir: 'somepath',
            verbose: false,
        });
        const json = scaffold(config);
        const schema = new Schema(json.__schema);
        const rootTypes = filterTypes(schema.types);

        const typeResolver = new TypeResolver({ rootTypes });
        const typeResults = typeResolver.GetInterfaceAndUnionTypeResults();
        const result = Array.from(typeResults.keys());

        expect(result.length).toBe(2);
        expect(expected).toStrictEqual(result);
    });

    test('should match snapshot', () => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/unionTypes.graphql`,
            outDir: 'somepath',
        });
        const json = scaffold(config);
        const schema = new Schema(json.__schema);
        const rootTypes = filterTypes(schema.types);
        const typeResolver = new TypeResolver({ rootTypes });

        const result = typeResolver.GetInterfaceAndUnionTypeResults();

        expect(result).toMatchSnapshot();
    });
});
