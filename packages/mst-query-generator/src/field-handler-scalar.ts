import { isPrimitive } from 'util';
import { GeneratedField } from './models';
import { FieldOverride } from './models/FieldOverride';
import { FieldHandlerProps, IHandleField, HandlerOptions } from './types';
import { primitiveFieldNames, requiredTypes } from './utils';

export const handleScalarField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { fieldType, isNullable = false, isNested = false, override } = props;

    if (fieldType?.kind.isScalar) {
        const primitiveType = getFieldTypeOrDefault(fieldType.name, override);
        const isRequired = requiredTypes.includes(primitiveType);

        let value = `types.${primitiveType}`;

        if (override && override.typeImportPath) {
            value = primitiveType;
            options.addImport?.(override.typeImportPath, override.newFieldType);
        }

        return new GeneratedField({
            value,
            isRequired,
            isNullable,
            isNested,
        });
    }
    return null;
};

const getFieldTypeOrDefault = (
    fieldTypeName: string | null | undefined,
    override: FieldOverride | undefined
) => {
    if (!fieldTypeName) {
        return 'frozen()';
    }

    if (override) {
        return override.newFieldType;
    }

    return primitiveFieldNames[fieldTypeName] ?? 'frozen()';
};
