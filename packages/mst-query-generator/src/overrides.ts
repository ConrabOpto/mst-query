import { FieldOverrideType } from './types';

export const parseFieldOverrides = (
    overrideValue: string | Array<string> | undefined
): FieldOverrideType[] => {
    if (!overrideValue) {
        return [];
    }

    const overrideValues = Array.isArray(overrideValue) ? overrideValue : overrideValue.split(',');

    const fieldOverrideValues = overrideValues
        .map((s) => s.trim())
        .map((item) => {
            const override = item.split(':').map((s) => s.trim());
            if (!(override.length === 3 || override.length === 4)) {
                throw new Error('--fieldOverrides used with invalid override: ' + item);
            }

            return override;
        });

    const fieldOverrides = fieldOverrideValues.map((fieldOverrideValue) => {
        // TODO: typeImportPath (for e.g. utils imports)
        const [unsplitFieldName, oldFieldType, newFieldType, typeImportPath] = fieldOverrideValue;

        const splitField = unsplitFieldName.split('.');
        const rootTypeName = splitField.length === 2 ? splitField[0] : '*';
        const fieldName = splitField.length === 1 ? splitField[0] : splitField[1];

        return { rootTypeName, fieldName, oldFieldType, newFieldType };
    });

    return fieldOverrides;
};
