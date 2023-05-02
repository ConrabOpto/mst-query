import { parseFieldOverrides } from '../overrides';
import { FieldOverrideType } from '../types';

export type ConfigProps = {
    force?: boolean;
    input?: string;
    outDir?: string;
    excludes?: Array<string>;
    verbose?: boolean;
    models?: boolean;
    index?: boolean;
    fieldOverrides?: string;
};

export class Config {
    force: boolean;
    input: string;
    outDir: string;
    excludes: Array<string>;
    verbose: boolean;
    models?: boolean;
    index?: boolean;
    fieldOverrides?: FieldOverrideType[];

    constructor(params: ConfigProps = {}) {
        this.force = params.force ?? false;
        this.input = params.input ?? '';
        this.outDir = params.outDir ?? '';
        this.excludes = [] as string[];
        this.verbose = params.verbose ?? false;
        this.models = params.models ?? false;
        this.index = params.index ?? false;
        this.fieldOverrides = params.fieldOverrides
            ? parseFieldOverrides(params.fieldOverrides)
            : [];
    }
}
