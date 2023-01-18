export class EnumValue {
    name: string;
    description: string;
    isDeprecated: boolean;
    deprecationReason: string | null;

    constructor(params: any) {
        this.name = params.name;
        this.description = params.description;
        this.isDeprecated = params.isDeprecated;
        this.deprecationReason = params.deprecationReason;
    }
}
