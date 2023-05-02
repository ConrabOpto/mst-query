import { GeneratedField } from '../models';
import { FieldHandlerProps, IHandleField, ModelFieldRef, HandlerOptions } from '../types';

export const handleObjectField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const {
        rootType,
        field,
        fieldType,
        knownTypes,
        isNullable = false,
        isNested = false,
        refs,
    } = props;
    const { addImport } = options;

    if (fieldType?.kind.isObject) {
        const isSelf = Boolean(fieldType.name === rootType?.name);
        const isKnownType = fieldType.name ? knownTypes?.includes(fieldType.name) : false;

        if (!isKnownType) {
            // unknown or unhandled type. make it frozen.
            return new GeneratedField({ value: `types.frozen()` });
        }

        const modelType = `${fieldType.name}Model`;
        const modelTypeType = `${fieldType.name}ModelType`;
        addImport?.(modelType, modelType);
        addImport?.(modelType, modelTypeType);

        // use late to prevent circular dependency
        const realType = `types.late(():any => ${fieldType.name}Model)`;

        // this object is not a root type, so assume composition relationship
        if (!isSelf && !isKnownType) {
            return new GeneratedField({ value: realType, isNullable, isNested });
        }

        const fieldMatch = refs?.find((ref) => ref.fieldName === field.name);
        const fieldName = field.name;
        const isList = field.type?.kind.isList;

        // handle union fields for withTypeRefs
        if (fieldMatch) {
            const index = refs.indexOf(fieldMatch);
            const modelType = isList ? `${modelTypeType}[]` : modelTypeType;
            const unionModelType = `${fieldMatch.modelType} | ${modelType}`;
            refs[index] = { fieldName, modelType: unionModelType, isNested } as ModelFieldRef;
        } else {
            const modelType = isList ? `${modelTypeType}[]` : modelTypeType;
            const refItem = { fieldName, modelType, isNested } as ModelFieldRef;
            refs?.push(refItem);
        }

        return new GeneratedField({ value: `${realType}`, isNullable, isNested });
    }

    return null;
};
