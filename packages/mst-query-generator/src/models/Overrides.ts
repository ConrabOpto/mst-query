import { FieldOverride } from './FieldOverride';

export class Overrides {
    public readonly fieldOverrides: FieldOverride[];
    public static Empty = new Overrides({ overrides: [] });

    constructor(params: { overrides: FieldOverride[] }) {
        this.fieldOverrides = params.overrides;
    }

    public findOverridesForRootType(rootTypeName: string) {
        return this.fieldOverrides.filter((o) => o.rootTypeName === rootTypeName);
    }

    private getMatchingOverridesForField(
        rootTypeName: string,
        fieldName: string,
        oldFieldType?: string | null
    ) {
        return this.fieldOverrides.filter((fieldOverride) => {
            return fieldOverride.matches(rootTypeName, fieldName, oldFieldType);
        });
    }

    public getMostSpecificOverride(fieldOverrides: FieldOverride[]) {
        return fieldOverrides.reduce((acc: FieldOverride | null, fieldOverride) => {
            if (acc === null || fieldOverride.specificity > acc.specificity) {
                return fieldOverride;
            }
            return acc;
        }, null);
    }

    public getOverrideForField(
        rootTypeName: string,
        fieldName: string,
        oldFieldType?: string | null
    ) {
        const matchingOverrides = this.getMatchingOverridesForField(
            rootTypeName,
            fieldName,
            oldFieldType
        );
        return this.getMostSpecificOverride(matchingOverrides);
    }

    public getMstTypeForField(rootTypeName: string, fieldName: string, oldFieldType: string) {
        const fieldOverride = this.getOverrideForField(rootTypeName, fieldName, oldFieldType);
        return fieldOverride && fieldOverride.newFieldType;
    }
}
