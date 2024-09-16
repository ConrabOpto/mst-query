import { isOnlyWildcard } from '../utils';

export class Specificity {
    private rootTypeName: string;
    private fieldName: string;
    private oldFieldType: string;

    constructor(params: any) {
        this.rootTypeName = params.rootTypeName;
        this.fieldName = params.fieldName;
        this.oldFieldType = params.oldFieldType;
    }

    public computeOverrideSpecificity() {
        try {
            const declaringTypeSpecificity = this.getDeclaringTypeSpecificity();
            const nameSpecificity = this.getNameSpecificity();
            const typeSpecificity = this.getTypeSpecificity();

            if (nameSpecificity === 0 && typeSpecificity === 0)
                throw new Error('Both name and type cannot be wildcards');

            return declaringTypeSpecificity + nameSpecificity + typeSpecificity;
        } catch (err: any) {
            throw Error(
                `Error parsing fieldOverride ${this.fieldName}:${this.oldFieldType}:\n ${err.message}`
            );
        }
    }

    private getDeclaringTypeSpecificity() {
        if (isOnlyWildcard(this.rootTypeName)) {
            return 0b0000;
        }

        if (this.hasWildcard(this.rootTypeName)) {
            return 0b0010;
        }

        return 0b0100;
    }

    private getNameSpecificity() {
        if (isOnlyWildcard(this.fieldName)) {
            return 0b0000;
        }

        if (this.hasWildcard(this.fieldName)) {
            return 0b0001;
        }

        return 0b0010;
    }

    private getTypeSpecificity() {
        if (isOnlyWildcard(this.oldFieldType)) {
            return 0b0000;
        }

        if (this.hasWildcard(this.oldFieldType)) {
            throw new Error('type cannot be a partial wildcard: e.g. *_id');
        }

        return 0b0001;
    }

    private hasWildcard(text: string) {
        return RegExp(/\*/).test(text);
    }
}
