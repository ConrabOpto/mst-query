export interface IFile {}

export class GeneratedFile implements IFile {
    name: string;
    content: string[];

    constructor(params: any) {
        this.name = params.name;
        this.content = params.content ? params.content : [];
    }

    public toString = (): string => {
        return this.content.join('');
    };
}
