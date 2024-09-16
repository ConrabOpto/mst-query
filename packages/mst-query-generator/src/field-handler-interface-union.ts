import { Type, GeneratedField } from './models';
import { FieldHandlerProps, IHandleField, HandlerOptions } from './types';

export const handleInterfaceOrUnionField: IHandleField = (
    props: FieldHandlerProps,
    options: HandlerOptions
): GeneratedField | null => {
    const { field, fieldType, fieldHandlers, isNullable = false, isNested = false } = props;
    const typeResolver = options.typeResolver;

    if (fieldType?.kind.isInterface || fieldType?.kind.isUnion) {
        const objectFieldHandler = fieldHandlers?.get('OBJECT');
        const interfaceAndUnionTypes = typeResolver?.GetInterfaceAndUnionTypeResults();
        const interfaceOrUnionType = interfaceAndUnionTypes?.get(fieldType?.name ?? '');

        const mstUnionArgs =
            interfaceOrUnionType?.rootTypes.map((rootType) => {
                const { name, kind } = rootType;
                const ofType = new Type({ name, kind: kind.value });

                // since we're already "inside a field" (nested),
                // child types are neither required or nullable
                const objectProps = {
                    ...props,
                    field,
                    rootType,
                    fieldType: ofType,
                    fieldHandlers,
                    isNullable: false,
                    isNested: fieldType.isNested,
                } as FieldHandlerProps;

                const generatedObjectField = objectFieldHandler?.(objectProps, options);

                return generatedObjectField;
            }) ?? [];

        const hasChildrenWithIds = interfaceOrUnionType?.rootTypes.some((rootType) => {
            return rootType.fields.some((field) => field.isIdentifier());
        });

        const generatedFields = mstUnionArgs.map((f) => f?.toString());

        if (hasChildrenWithIds) {
            const value =
                generatedFields.length > 1
                    ? `MstQueryRef(types.union(${generatedFields.join(', ')}))`
                    : `MstQueryRef(${generatedFields.join(', ')})`;
            return new GeneratedField({ value, isNullable, isNested });
        }

        const value = `types.union(${generatedFields.join(', ')})`;
        return new GeneratedField({ value, isNullable, isNested });
    }
    return null;
};
