import { Arg } from './Arg';

export class Directive {
    name: string;
    description: string;
    locations: string[];
    args: Arg[];

    constructor(params: any) {
        this.name = params.name;
        this.description = params.description;
        this.locations = params.locations ?? [];
        this.args = params.args ? params.args.map((a: any) => new Arg(a)) : [];
    }
}
