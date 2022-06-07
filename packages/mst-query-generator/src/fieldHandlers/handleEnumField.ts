import { GeneratedField } from '../models';
import { FieldHandlerProps, IHandleField, HandlerOptions } from '../types';

export const handleEnumField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { fieldType, isNullable = false, isNested = false } = props;
    const { addImport } = options;

    if (fieldType?.kind.isEnum) {
        const value = `${fieldType.name}Type`;
        const name = `${fieldType.name}Type`;
        addImport?.(name, value);

        return new GeneratedField({ value, isNullable, isNested });
    }

    return null;
};
