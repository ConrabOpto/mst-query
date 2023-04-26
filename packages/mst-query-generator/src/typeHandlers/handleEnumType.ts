import { GeneratedFile } from '../models';
import { IHandleType, TypeHandlerProps } from '../types';
import { header, indent, nameToCamelCase, newRow } from '../utils';

export const handleEnumType: IHandleType = (props: TypeHandlerProps): GeneratedFile[] => {
    const { rootType } = props;
    if (rootType.kind.isEnum) {
        return handle(props);
    }
    return [];
};

const handle = (props: TypeHandlerProps): GeneratedFile[] => {
    const { rootType } = props;

    const values = rootType.enumValues
        .map((enumValue) => {
            const camelCaseName = nameToCamelCase(enumValue.name);
            const upperCaseName = enumValue.name.toUpperCase();
            return `${indent}${camelCaseName}: '${upperCaseName}'`;
        })
        .join(`,${newRow}`);

    const content = [
        header,
        newRow,
        `import { types } from 'mobx-state-tree';`,
        newRow,
        newRow,
        `export const ${rootType.name} = {`,
        newRow,
        `${values}`,
        newRow,
        '};',
        newRow,
        newRow,
        `export type ${rootType.name}Type = `,
        `typeof ${rootType.name}[keyof typeof ${rootType.name}];`,
        newRow,
        newRow,
        `export const ${rootType.name}TypeEnum = types.enumeration<${rootType.name}Type>(`,
        newRow,
        `${indent}'${rootType.name}TypeEnum',`,
        newRow,
        `${indent}Object.values(${rootType.name})`,
        newRow,
        `);`,
    ];

    return [new GeneratedFile({ name: `${rootType.name}`, content })];
};
