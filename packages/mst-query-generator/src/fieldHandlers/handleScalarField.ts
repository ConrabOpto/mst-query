import { GeneratedField } from '../models';
import { FieldHandlerProps, IHandleField, HandlerOptions } from '../types';
import { primitiveFieldNames, requiredTypes } from '../utils';

export const handleScalarField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { fieldType, isNullable = false, isNested = false } = props;

    if (fieldType?.kind.isScalar) {
        const nameOrFrozen = (fieldType.name && primitiveFieldNames[fieldType.name]) ?? 'frozen()';
        const primitiveType = fieldType.name ? nameOrFrozen : 'frozen()';

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
