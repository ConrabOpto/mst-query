import { Type } from './Type';

export class InputField {
    name: string;
    description: string;
    type: Type;
    defaultValue: any | null;

    constructor(params: any) {
        this.name = params.name;
        this.description = params.description;
        this.type = params.type;
        this.defaultValue = params.defaultValue;
    }

    public updateName(value: string) {
        this.name = value;
    }
}
