import path from 'path';
import { Config } from '../src/models';
import { scaffold } from '../generator/scaffold';
import { test, expect, describe, vi } from 'vitest';

describe('scaffold', () => {
    test('should return json', () => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/abstractTypes.graphql`,
            outDir: 'somepath',
        });
        const json = scaffold(config);
        expect(json).not.toBeNull();
    });

    test('should be able to log configuration', () => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/abstractTypes.graphql`,
            outDir: 'somepath',
            verbose: true,
        });
        const mockConfigLogger = vi.fn(() => {});

        scaffold(config, mockConfigLogger, () => {});

        expect(mockConfigLogger).toBeCalledTimes(1);
    });

    test('should be able to log schema types', () => {
        const config = new Config({
            input: `${path.resolve(__dirname)}/schema/abstractTypes.graphql`,
            outDir: 'somepath',
            verbose: true,
        });
        const mockSchemaTypesLogger = vi.fn(() => {});

        scaffold(config, () => {}, mockSchemaTypesLogger);

        expect(mockSchemaTypesLogger).toBeCalledTimes(1);
    });
});
