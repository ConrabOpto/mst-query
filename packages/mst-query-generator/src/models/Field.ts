import { Arg } from './Arg';
import { Type } from './Type';

export class Field {
    name: string;
    originalName: string;
    description: string;
    args: Arg[] | null;
    type: Type | null;
    isDeprecated: boolean;
    deprecationReason: string | null;

    constructor(params: any) {
        this.name = params.name;
        this.originalName = params.name;
        this.description = params.description ?? '';
        this.args = params.args ? params.args.map((a: any) => new Arg(a)) : [];
        this.type = params.type ? new Type(params.type) : null;
        this.isDeprecated = params.isDeprecated;
        this.deprecationReason = params.deprecationReason;
    }

    public updateName(value: string) {
        this.name = value;
    }

    public isIdentifier(): boolean {
        return Boolean(this.name === 'id');
    }
}
