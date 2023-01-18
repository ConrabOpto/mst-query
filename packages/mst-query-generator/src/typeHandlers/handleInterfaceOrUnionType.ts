import { GeneratedFile } from '../models';
import { IHandleType, HandlerOptions, TypeHandlerProps } from '../types';
import { header, newRow } from '../utils';

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

    const interfaceOrUnionActualTypes = interfaceOrUnionType?.rootTypes
        .map((type) => `${type.name}ModelType`)
        .join(' | ');

    const content = [
        header,
        newRow,
        newRow,
        printRelativeImports(imports),
        `export type ${interfaceOrUnionType?.name}Union = `,
        interfaceOrUnionActualTypes,
        newRow,
        newRow,
    ];

    return [new GeneratedFile({ name: rootType.name, content })];
};

const printRelativeImports = (imports: Map<string, Set<string>> | undefined): string | null => {
    if (!imports) {
        return null;
    }

    const moduleNames = [...imports.keys()].sort();
    return moduleNames
        .map((moduleName) => {
            const result = imports.get(moduleName) ?? '';
            const sortedImports = [...result].sort();
            return `import { ${[...sortedImports].join(', ')} } from "./${moduleName}`;
        })
        .join(newRow);
};
