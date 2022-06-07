import { GeneratedField } from './models';
import { FieldHandlerProps, IHandleField, HandlerOptions } from './types';
import {
    handleEnumField,
    handleInterfaceOrUnionField,
    handleListField,
    handleObjectField,
    handleScalarField,
} from './fieldHandlers';

export const defaultFieldHandlers = new Map<string, IHandleField>([
    ['ENUM', handleEnumField],
    ['INTERFACE', handleInterfaceOrUnionField],
    ['LIST', handleListField],
    ['OBJECT', handleObjectField],
    ['SCALAR', handleScalarField],
    ['UNION', handleInterfaceOrUnionField],
]);

export const fieldHandler = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { field, fieldHandlers = defaultFieldHandlers } = props;
    const actualFieldType = field.type?.asActualType;
    const isNullable = field.type?.isNullable;

    const handlerProps = {
        ...props,
        fieldType: actualFieldType,
        isNullable,
        fieldHandlers,
    } as FieldHandlerProps;

    const handlerName = actualFieldType?.kind.value ?? '';
    const fieldHandler = fieldHandlers.get(handlerName);
    return fieldHandler?.(handlerProps, options) ?? null;
};
