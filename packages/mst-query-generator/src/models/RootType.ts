import { Field } from './Field';
import { InputField } from './InputField';
import { Type } from './Type';
import { EnumValue } from './EnumValue';
import { Kind } from './Kind';

export class RootType {
    kind: Kind;
    name: string;
    originalName: string;
    description: string | null;
    inputFields: InputField[];
    interfaces: Type[];
    enumValues: EnumValue[];
    possibleTypes: Type[];
    fields: Field[];

    constructor(params: any) {
        this.kind = new Kind(params.kind);
        this.name = params.name;
        this.originalName = params.name;
        this.description = params.description;

        this.fields = params.fields ? params.fields.map((f: any) => new Field(f)) : [];

        this.inputFields = params.inputFields
            ? params.inputFields.map((f: any) => new InputField(f))
            : [];

        this.interfaces = params.interfaces ? params.interfaces.map((i: any) => new Type(i)) : [];

        this.enumValues = params.enumValues
            ? params.enumValues.map((ev: any) => new EnumValue(ev))
            : [];

        this.possibleTypes = params.possibleTypes
            ? params.possibleTypes.map((pt: any) => new Type(pt))
            : [];
    }

    public updateName(value: string): void {
        this.name = value;
    }

    public get canCamelCase(): boolean {
        return this.name.startsWith('__') && this.kind.canCamelCase;
    }

    public get isActualRootType(): boolean {
        function skipNonNullKind(type: Type | null) {
            if (!type) {
                return null;
            }
            return type.kind.isNonNull ? type.ofType : type;
        }
        return this.fields.some(
            (field) =>
                field.isIdentifier() &&
                skipNonNullKind(field.type)?.kind.isScalar &&
                skipNonNullKind(field.type)?.isIdentifier()
        );
    }
}
