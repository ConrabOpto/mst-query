import { FieldOverrideType } from './types';

export const parseFieldOverrides = (
    overrideValue: string | Array<string> | undefined
): FieldOverrideType[] => {
    if (!overrideValue) {
        return [];
    }

    const overrideValues = Array.isArray(overrideValue) ? overrideValue : overrideValue.split(',');
    const fieldOverrideValues = overrideValues
        .map((value) => value.trim())
        .map((value) => {
            const override = value.split(':').map((part) => part.trim());
            if (!(override.length === 3 || override.length === 4)) {
                throw new Error(`--fieldOverrides used with invalid override: ${value}`);
            }
            return override;
        });

    const fieldOverrides = fieldOverrideValues.map((splitValues) => {
        // TODO: typeImportPath (for e.g. utils imports)
        const [unsplitFieldName, oldFieldType, newFieldType, typeImportPath] = splitValues;
        const splitField = unsplitFieldName.split('.');
        const rootTypeName = splitField.length === 2 ? splitField[0] : '*';
        const fieldName = splitField.length === 1 ? splitField[0] : splitField[1];
        return { rootTypeName, fieldName, oldFieldType, newFieldType };
    });

    return fieldOverrides;
};
