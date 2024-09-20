#!/usr/bin/env node

import {
    ConfigurationLoggerType,
    SchemaTypesLoggerType,
    printConfigurationParams as defaultConfigLogger,
    printDetectedSchemaTypes as defaultSchemaTypesLogger,
} from '../src/logger';
import fs from 'fs';
import path from 'path';
import { Config, Schema, GeneratedFile } from '../src/models';
import { Generate } from './generate';
import { TypeResolver } from '../src/models/TypeResolver';
import { filterTypes } from '../src/utils';
import { getConfig } from './config';
import { typeHandler } from '../src/type-handler';
import { buildSchema, graphqlSync, getIntrospectionQuery } from 'graphql';

function main() {
    const config = getConfig();
    const json = scaffold(config);
    const schema = new Schema(json.__schema);
    const rootTypes = filterTypes(schema.types);
    const typeResolver = new TypeResolver({ rootTypes });

    var generate = new Generate({
        rootTypes,
        typeHandler,
        typeResolver,
        config,
    });

    generate.GenerateModelBase();
    generate.GenerateTypes();

    if (config.index) {
        generate.GenerateIndexFile();
    }

    const files = generate.files;

    writeFiles(config, files);
}

const getSchemaJson = (input: string | undefined) => {
    if (!input?.endsWith('.graphql')) {
        throw new Error(`Expected a .graphql file as input but got ${input}`);
    }

    const text = fs.readFileSync(input, { encoding: 'utf8' });
    const schema = buildSchema(text);
    const res = graphqlSync({ schema, source: getIntrospectionQuery() });

    if (!res.data) {
        throw new Error(`graphql parse error:\n\n${JSON.stringify(res, null, 2)}`);
    }

    return res.data as any;
};

export const scaffold = (
    config: Config,
    configLoggerFn?: ConfigurationLoggerType,
    schemaTypesLoggerFn?: SchemaTypesLoggerType
) => {
    const { input, outDir, verbose = false } = config;
    const configLogger = configLoggerFn ?? defaultConfigLogger;
    const schemaLogger = schemaTypesLoggerFn ?? defaultSchemaTypesLogger;

    if (verbose) {
        configLogger?.(input, outDir);
    }

    var json = getSchemaJson(input);

    if (verbose) {
        schemaLogger?.(json);
    }

    return json;
};

export const writeFiles = (config: Config, files: GeneratedFile[]) => {
    const { outDir, force, verbose } = config;

    files.forEach((file) => {
        const { name } = file;
        const contents = file.toString();

        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir);
        }

        writeFile(name, contents, outDir, force, verbose);
    });
};

const writeFile = (
    name: string,
    contents: string,
    outDir: string,
    force: boolean = false,
    verbose: boolean = false
) => {
    const fnName = path.resolve(outDir, name + '.' + 'ts');
    if (!fs.existsSync(fnName) || force) {
        verbose && console.log('Writing file ' + fnName);
        fs.writeFileSync(fnName, contents);
    } else {
        verbose && console.log('Skipping file ' + fnName);
    }
};

export default function () {
    main();
}
