import { RootType } from './RootType';
import { Directive } from './Directive';

export interface ISchema {
    types: RootType[];
    directives: Directive[];
}

export class Schema implements ISchema {
    types: RootType[];
    directives: Directive[];

    constructor(params: any) {
        this.types = params.types ? params.types.map((t: any) => new RootType(t)) : [];

        this.directives = params.directives
            ? params.directives.map((d: any) => new Directive(d))
            : [];
    }
}
