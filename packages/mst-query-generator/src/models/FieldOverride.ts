import { isOnlyWildcard } from '../utils';
import { Specificity } from './Specificity';

export type FieldOverrideProps = {
    rootTypeName: string;
    fieldName: string;
    oldFieldType: string;
    newFieldType: string;
    typeImportPath: string;
};

export class FieldOverride {
    public rootTypeName: string;
    fieldName: string;
    oldFieldType: string;
    newFieldType: string;
    typeImportPath: string;
    rootTypeRegExp: RegExp;
    fieldNameRegExp: RegExp;
    specificity: Specificity;

    constructor(params: FieldOverrideProps) {
        this.rootTypeName = params.rootTypeName;
        this.fieldName = params.fieldName;
        this.oldFieldType = params.oldFieldType;
        this.newFieldType = params.newFieldType;
        this.typeImportPath = params.typeImportPath;

        this.specificity = new Specificity(params);

        this.rootTypeRegExp = this.wildcardToRegExp(params.rootTypeName);
        this.fieldNameRegExp = this.wildcardToRegExp(params.fieldName);
    }

    public json() {
        return {
            rootTypeName: this.rootTypeName,
            fieldName: this.fieldName,
            oldFieldType: this.oldFieldType,
            newFieldType: this.newFieldType,
            typeImportPath: this.typeImportPath,
        };
    }

    public isIdentifier() {
        const mstIdTypes = ['identifier', 'identifierNumber'];
        return mstIdTypes.includes(this.newFieldType);
    }

    public static parse(overrideValue: string | string[] | undefined): FieldOverride[] {
        if (!overrideValue) {
            return [];
        }

        const overrideValues = Array.isArray(overrideValue)
            ? overrideValue
            : overrideValue?.split(',');

        const fieldOverrideValues = overrideValues
            .map((value) => value.trim())
            .map((value) => {
                const override = value.split(':').map((part) => part.trim());
                const isValid = override.length === 3 || override.length === 4;

                if (!isValid) {
                    throw new Error(`--fieldOverrides used with invalid override: ${value}`);
                }

                return override;
            });

        const fieldOverrides = fieldOverrideValues.map((splitValues) => {
            const [unsplitFieldName, oldFieldType, newFieldType, typeImportPath] = splitValues;
            const splitField = unsplitFieldName.split('.');
            const rootTypeName = splitField.length === 2 ? splitField[0] : '*';
            const fieldName = splitField.length === 1 ? splitField[0] : splitField[1];

            return new FieldOverride({
                rootTypeName,
                fieldName,
                oldFieldType,
                newFieldType,
                typeImportPath,
            });
        });

        return fieldOverrides;
    }

    public matches(rootTypeName: string, newFieldType: string, oldFieldType?: string | null) {
        const matchRootType = this.rootTypeRegExp.test(rootTypeName);
        const matchFieldName = this.fieldNameRegExp.test(newFieldType);
        const matchOldField = oldFieldType === this.oldFieldType;
        const matchOldOrWildcard = matchOldField || isOnlyWildcard(this.oldFieldType);
        return matchRootType && matchFieldName && matchOldOrWildcard;
    }

    private wildcardToRegExp(text: string) {
        const escapeStringRegexp = (value: string) => value;
        return new RegExp('^' + text.split(/\*+/).map(escapeStringRegexp).join('.+') + '$');
    }
}
