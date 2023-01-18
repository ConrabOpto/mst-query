import { Kind } from './Kind';

export class Type {
    kind: Kind;
    name: string | null | undefined;
    ofType: Type | null;

    constructor(params: any) {
        this.kind = new Kind(params.kind);
        this.name = params.name;
        this.ofType = params.ofType ? new Type(params.ofType) : null;
    }

    public isIdentifier(): boolean {
        return Boolean(this.name === 'ID');
    }

    public get asActualType(): Type | null {
        return this.kind.isNonNull ? this.ofType : this;
    }

    public get isNullable(): boolean {
        return this.kind.isNonNull ? false : true;
    }

    public get isNested(): boolean {
        return this.kind.isUnion || this.kind.isInterface || this.kind.isList;
    }
}
