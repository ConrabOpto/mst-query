import { RootType, GeneratedFile } from './models';
import { IHandleType, HandlerOptions, TypeHandlerProps } from './types';
import { handleEnumType } from './type-handler-enum';
import { handleInterfaceOrUnionType } from './type-handler-interface-union';
import { handleObjectType } from './type-handler-object';
import { fieldHandler as defaultFieldHandler } from './field-handler';
import { Overrides } from './models/Overrides';

export const defaultTypeHandlers = [handleEnumType, handleInterfaceOrUnionType, handleObjectType];

export const typeHandler = (props: TypeHandlerProps, options: HandlerOptions): GeneratedFile[] => {
    const { rootType } = props;
    const { config } = options;
    const typeHandlers = options.typeHandlers ?? defaultTypeHandlers;
    const fieldHandler = options.fieldHandler ?? defaultFieldHandler;
    const imports = new Map<string, Set<string>>();

    validateTypeHandlers(rootType, typeHandlers);

    if (!canHandleCurrentRootType(props)) {
        return [];
    }

    const addImport = (modelName: string, importToAdd: string) => {
        handleAddImport(rootType, imports, modelName, importToAdd);
    };

    const generatedFiles = typeHandlers.map((handleType) => {
        const handlerProps = { ...props, rootType, imports };
        const handlerOptions = {
            ...options,
            fieldHandler,
            addImport,
            overrides: config?.overrides ?? Overrides.Empty,
        };
        return handleType(handlerProps, handlerOptions);
    });

    return generatedFiles.flat(1);
};

const validateTypeHandlers = (rootType: RootType, typeHandlers?: IHandleType[]) => {
    if (!typeHandlers?.length) {
        throw new Error(
            `Unable to create file for type ${rootType.name}. No handlers registered for kind ${rootType.kind.value}`
        );
    }
};

const canHandleCurrentRootType = (props: TypeHandlerProps) => {
    const { rootType, excludes = [] } = props;
    return (
        !excludes.includes(rootType.name) &&
        !rootType.name.startsWith('__') &&
        !rootType.kind.isScalar &&
        !rootType.kind.isInputObject
    );
};

const handleAddImport = (
    rootType: RootType,
    imports: Map<string, Set<string>>,
    modelName: string,
    importToAdd: string
): void => {
    const currentModelName = `${rootType.name}Model.base`;

    if (modelName === currentModelName) {
        return;
    }

    if (imports.has(modelName)) {
        const importSet = imports.get(modelName);
        importSet?.add(importToAdd);
    } else {
        const importSet = new Set<string>();
        importSet.add(importToAdd);
        imports.set(modelName, importSet);
    }
};
