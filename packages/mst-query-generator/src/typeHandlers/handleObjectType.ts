import { Field, GeneratedFile } from '../models';
import { FieldHandlerProps } from '../types';
import { IHandleType, ModelFieldRef, HandlerOptions, TypeHandlerProps } from '../types';
import { header, indent, newRow } from '../utils';

export const handleObjectType: IHandleType = (
    props: TypeHandlerProps,
    options: HandlerOptions
): GeneratedFile[] => {
    const { rootType } = props;
    if (rootType.kind.isObject) {
        return handle(props, options);
    }
    return [];
};

const handle = (props: TypeHandlerProps, options: HandlerOptions): GeneratedFile[] => {
    const { rootType, imports } = props;
    const { config } = options;
    const refs = [] as ModelFieldRef[];

    const fields = rootType.fields
        ? rootType.fields.map((field) => createField(field, props, options, refs))
        : [];
    const modelFields = rootType.fields ? fields.join(newRow) : '';

    const withTypeRefsOrEmpty = refs.length > 0 ? 'withTypedRefs<Refs>()(' : '';

    const modelBaseContent = [
        header,
        newRow,
        `import { types } from 'mobx-state-tree';`,
        newRow,
        `import { ModelBase } from './ModelBase';`,
        printMstQueryRefImport(fields),
        printWithTypeRefImport(refs),
        printRelativeImports(imports),
        newRow,
        newRow,
        printTypeRefValue(refs),
        `export const ${rootType.name}ModelBase = ${withTypeRefsOrEmpty}ModelBase.named('${rootType.name}').props({`,
        newRow,
        `${indent}__typename: types.optional(types.literal('${rootType.originalName}'), '${rootType.originalName}'),`,
        newRow,
        `${modelFields}`,
        `${modelFields.length > 0 ? newRow : ''}`,
        `})${refs.length > 0 ? ')' : ''};`,
    ];

    const modelContent = [
        `import { Instance } from 'mobx-state-tree';`,
        newRow,
        `import { ${rootType.name}ModelBase } from './${rootType.name}Model.base';`,
        newRow,
        newRow,
        `export const ${rootType.name}Model = ${rootType.name}ModelBase;`,
        newRow,
        newRow,
        `export interface ${rootType.name}ModelType extends Instance<typeof ${rootType.name}Model> {}`,
    ];

    const modelBaseName = `${rootType.name}Model.base`;
    const modelName = `${rootType.name}Model`;

    const files = [
        new GeneratedFile({ name: modelBaseName, content: modelBaseContent }),
    ] as GeneratedFile[];

    if (config?.models) {
        files.push(new GeneratedFile({ name: modelName, content: modelContent }));
    }
    return files;
};

const createField = (
    field: Field,
    props: TypeHandlerProps,
    options: HandlerOptions,
    refs: ModelFieldRef[]
) => {
    const { rootType } = props;
    const { fieldHandler } = options;
    const fieldHandlerProps = { ...props, field, rootType, refs } as FieldHandlerProps;
    const result = fieldHandler?.(fieldHandlerProps, options);
    return `${indent}${field.name}: ${result?.toString()},`;
};

const printTypeRefValue = (modelFieldRefs: ModelFieldRef[]) => {
    const typeRefValues = modelFieldRefs.map(({ fieldName, modelType }) => {
        return `${indent}${fieldName}: ${modelType};${newRow}`;
    });
    const textRows = ['type Refs = {', newRow, `${typeRefValues.join('')}`, '};', newRow];
    return modelFieldRefs.length > 0 ? `${textRows.join('')}${newRow}` : '';
};

const printWithTypeRefImport = (refs: ModelFieldRef[]) => {
    return refs.length > 0
        ? `${newRow}import { withTypedRefs } from '../Utils/WithTypedRefs';`
        : '';
};

const printMstQueryRefImport = (fields: string[]) => {
    const shouldImportMstQueryRef = fields.some((x) => x.includes('MstQueryRef'));
    return shouldImportMstQueryRef ? `${newRow}import { MstQueryRef } from 'mst-query';` : '';
};

const printRelativeImports = (imports: Map<string, Set<string>> | undefined): string | null => {
    if (!imports) {
        return null;
    }

    const moduleNames = [...imports.keys()].sort();
    const relativeImports = moduleNames
        .map((moduleName) => {
            const result = imports.get(moduleName) ?? '';
            const sortedImports = [...result].sort();
            const importValue = [...sortedImports].join(', ');
            return `import { ${importValue} } from './${moduleName}';`;
        })
        .join(newRow);

    return relativeImports.length > 0 ? `${newRow}${relativeImports}` : '';
};
