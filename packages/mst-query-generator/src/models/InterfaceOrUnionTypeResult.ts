import { RootType } from './RootType';
import { Field } from './Field';
import { Kind } from './Kind';

export class InterfaceOrUnionTypeResult {
    kind: Kind;
    name: string;
    rootTypes: RootType[];
    fields: Field[];

    constructor(params: any) {
        this.kind = new Kind(params.kind);
        this.name = params.name;
        this.rootTypes = params.rootTypes ? params.rootTypes : [];
        this.fields = params.fields ? params.fields : [];
    }
}
