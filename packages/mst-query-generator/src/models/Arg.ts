import { Type } from './Type';

export class Arg {
    name: string;
    originalName: string;
    description?: any;
    type: Type;
    defaultValue: string;

    constructor(params: any) {
        this.name = params.name;
        this.originalName = params.name;
        this.description = params.description;
        this.type = params.type;
        this.defaultValue = params.defaultValue;
    }

    public updateName(value: string) {
        this.name = value;
    }
}
