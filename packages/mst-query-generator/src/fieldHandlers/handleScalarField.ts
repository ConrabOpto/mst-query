import { GeneratedField } from '../models';
import { FieldHandlerProps, IHandleField, HandlerOptions, FieldOverrideType } from '../types';
import { primitiveFieldNames, requiredTypes } from '../utils';

export const handleScalarField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { fieldType, isNullable = false, isNested = false, override } = props;

    if (fieldType?.kind.isScalar) {
        const primitiveType = getFieldTypeOrDefault(fieldType.name, override);
        const isRequired = requiredTypes.includes(primitiveType);

        return new GeneratedField({
            value: `types.${primitiveType}`,
            isRequired,
            isNullable,
            isNested,
        });
    }
    return null;
};

const getFieldTypeOrDefault = (
    fieldTypeName: string | null | undefined,
    override: FieldOverrideType | undefined
) => {
    if (!fieldTypeName) {
        return 'frozen()';
    }

    if (override) {
        return override.newFieldType;
    }
    return primitiveFieldNames[fieldTypeName] ?? 'frozen()';
};
