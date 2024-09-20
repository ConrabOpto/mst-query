import { GeneratedFile, RootType } from './models';
import { IHandleType, HandlerOptions, TypeHandlerProps } from './types';
import { header, newRow } from './utils';

export const handleInterfaceOrUnionType: IHandleType = (
    props: TypeHandlerProps,
    options: HandlerOptions
): GeneratedFile[] => {
    const { rootType } = props;
    if (rootType.kind.isInterface || rootType.kind.isUnion) {
        return handle(props, options);
    }
    return [];
};

const handle = (props: TypeHandlerProps, options: HandlerOptions): GeneratedFile[] => {
    const { rootType, imports } = props;
    const { addImport, typeResolver } = options;
    const interfaceAndUnionTypes = typeResolver?.GetInterfaceAndUnionTypeResults();
    const interfaceOrUnionType = interfaceAndUnionTypes?.get(rootType.name);

    if (!interfaceOrUnionType) {
        return [];
    }

    interfaceOrUnionType.rootTypes.forEach((rootType) => {
        addImport?.(`${rootType.name}Model.base`, `${rootType.name}`);
        addImport?.(`${rootType.name}Model`, `${rootType.name}ModelType`);
    });

    const actualTypes = interfaceOrUnionType?.rootTypes;

    const interfaceOrUnionActualTypes = actualTypes
        .map((type) => `${type.name}ModelType`)
        .join(' | ');

    const content = [
        header,
        newRow,
        newRow,
        printRelativeImports(imports, actualTypes),
        newRow,
        newRow,
        `export type ${interfaceOrUnionType?.name}Type = `,
        interfaceOrUnionActualTypes,
        newRow,
        newRow,
    ];

    return [new GeneratedFile({ name: rootType.name, content })];
};

const printRelativeImports = (
    imports: Map<string, Set<string>> | undefined,
    actualTypes: RootType[]
): string | null => {
    if (!imports) {
        return null;
    }

    const actualImports = actualTypes.map((type) => `${type.name}ModelType`);
    const moduleNames = [...imports.keys()].sort();

    return moduleNames
        .map((moduleName) => {
            const result = imports.get(moduleName) ?? '';
            const sortedImports = [...result].sort();
            const filteredImports = sortedImports.filter((i) => actualImports.includes(i));

            // ignore unused imports
            if (!filteredImports.length) {
                return null;
            }

            return `import { ${[...filteredImports].join(', ')} } from './${moduleName}';`;
        })
        .filter((i) => i !== null)
        .join(newRow);
};
