import camelcase from 'camelcase';
import { RootType } from './models';

export const primitiveFieldNames = {
    ID: 'identifier',
    Int: 'integer',
    String: 'string',
    Float: 'number',
    Boolean: 'boolean',
};
export const requiredTypes = ['identifier', 'identifierNumber'];
export const reservedGraphqlNames = ['Mutation', 'CacheControlScope', 'Query', 'Subscription'];
export const newRow = '\n';
export const indent = '    ';
export const header = [
    `/* This is a generated file, don't modify it manually */`,
    `/* eslint-disable */`,
    `/* tslint:disable */`,
].join(newRow);

export const nameToCamelCase = (value: string) => {
    return camelcase(value, { pascalCase: true });
};

export const filterTypes = (
    rootTypes: RootType[],
    excludes: string[] = [...reservedGraphqlNames]
): RootType[] => {
    return rootTypes
        .filter((type) => !excludes.includes(type.name))
        .filter((type) => !type.name.startsWith('__'))
        .filter((type) => !type.kind.isScalar);
};

export const validateTypes = (
    rootTypes: RootType[] = [],
    excludes: string[] = [...reservedGraphqlNames]
): void => {
    const filteredTypes = filterTypes(rootTypes, excludes);

    const objectTypeNames = filteredTypes
        .filter((type) => type.kind.isObject)
        .map((type) => type.originalName);

    const filteredActualRootTypes = rootTypes.filter(
        (type) => objectTypeNames.includes(type.name) && type.isActualRootType
    );
    const invalidTypes = filteredActualRootTypes.filter(
        (type) => !objectTypeNames.includes(type.name)
    );

    invalidTypes.forEach((type) => {
        if (reservedGraphqlNames.includes(type.name)) {
            throw new Error(
                `Cannot generate ${type.name}Model, ${type.name} is a graphql reserved name`
            );
        }
        throw new Error(
            `The root type specified: '${type.name}' is unknown, excluded or not an OBJECT type!`
        );
    });
};
