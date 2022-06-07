export class Kind {
    value: string | null;

    constructor(value: string | null) {
        this.value = value;
    }

    public get isInterface(): boolean {
        return this.value === 'INTERFACE';
    }

    public get isUnion(): boolean {
        return this.value === 'UNION';
    }

    public get isObject(): boolean {
        return this.value === 'OBJECT';
    }

    public get isInputObject(): boolean {
        return this.value === 'INPUT_OBJECT';
    }

    public get isNonNull(): boolean {
        return this.value === 'NON_NULL';
    }

    public get isScalar(): boolean {
        return this.value === 'SCALAR';
    }

    public get isEnum(): boolean {
        return this.value === 'ENUM';
    }

    public get isList(): boolean {
        return this.value === 'LIST';
    }

    public get canCamelCase(): boolean {
        return this.isObject || this.isInputObject || this.isEnum || this.isList || this.isNonNull;
    }
}
