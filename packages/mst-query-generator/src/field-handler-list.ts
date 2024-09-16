import { GeneratedField } from './models';
import { FieldHandlerProps, IHandleField, HandlerOptions } from './types';

export const handleListField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { fieldType, fieldHandlers, isNullable = false } = props;

    if (fieldType?.kind.isList) {
        const listSubType = fieldType.ofType;
        const actualListType = listSubType?.kind.isNonNull ? listSubType.ofType : listSubType;
        const handlerProps = {
            ...props,
            fieldType: actualListType,
            isNullable,
            isNested: fieldType.isNested,
        } as FieldHandlerProps;

        const handlerName = actualListType?.kind.value ?? '';
        const fieldHandler = fieldHandlers?.get(handlerName);
        const generatedField = fieldHandler?.(handlerProps, options);

        if (generatedField) {
            const content = generatedField?.toString();
            const value = `types.array(${content})`;
            return new GeneratedField({ value, isNullable });
        }
        return null;
    }

    return null;
};
