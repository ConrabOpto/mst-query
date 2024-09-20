import { GeneratedField } from './models';
import { FieldHandlerProps, IHandleField, HandlerOptions } from './types';
import { handleEnumField } from './field-handler-enum';
import { handleListField } from './field-handler-list';
import { handleObjectField } from './field-handler-object';
import { handleInterfaceOrUnionField } from './field-handler-interface-union';
import { handleScalarField } from './field-handler-scalar';

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
    const { rootType, field, fieldHandlers = defaultFieldHandlers } = props;
    const { overrides } = options;
    const actualFieldType = field.type?.asActualType;
    const isNullable = field.type?.isNullable;
    const fieldOverride = overrides?.getOverrideForField(
        rootType.name,
        field.name,
        actualFieldType?.name
    );

    const handlerProps = {
        ...props,
        fieldType: actualFieldType,
        isNullable,
        fieldHandlers,
        override: fieldOverride,
    } as FieldHandlerProps;

    const handlerName = actualFieldType?.kind.value ?? '';
    const fieldHandler = fieldHandlers.get(handlerName);
    return fieldHandler?.(handlerProps, options) ?? null;
};
