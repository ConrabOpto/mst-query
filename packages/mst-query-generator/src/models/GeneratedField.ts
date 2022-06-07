export class GeneratedField {
    isRequired: boolean;
    isNullable: boolean;
    isNested: boolean;
    value: string;
    imports: string[];
    canBeUndefined: boolean;
    canBeNull: boolean;

    constructor(params: any) {
        this.isRequired = params.isRequired ?? false;
        this.isNullable = params.isNullable ?? true;
        this.isNested = params.isNested ?? false;
        this.value = params.value;
        this.imports = params.imports ? params.imports : [];
        this.canBeUndefined = !this.isRequired && !this.isNested;
        this.canBeNull = !this.isRequired && this.isNullable;
    }

    public toString = (): string => {
        if (this.canBeNull || this.canBeUndefined) {
            const undefinedOrEmpty = this.canBeUndefined ? 'types.undefined, ' : '';
            const nullOrEmpty = this.canBeNull ? 'types.null, ' : '';
            return `types.union(${undefinedOrEmpty}${nullOrEmpty}${this.value})`;
        }
        return this.value;
    };
}
