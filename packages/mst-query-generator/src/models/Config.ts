export type ConfigProps = {
    force?: boolean;
    input?: string;
    outDir?: string;
    excludes?: Array<string>;
    verbose?: boolean;
    models?: boolean;
    index?: boolean;
};

export class Config {
    force: boolean;
    input: string;
    outDir: string;
    excludes: Array<string>;
    verbose: boolean;
    models?: boolean;
    index?: boolean;

    constructor(params: ConfigProps = {}) {
        this.force = params.force ?? false;
        this.input = params.input ?? '';
        this.outDir = params.outDir ?? '';
        this.excludes = [] as string[];
        this.verbose = params.verbose ?? false;
        this.models = params.models ?? false;
        this.index = params.index ?? false;
    }
}
