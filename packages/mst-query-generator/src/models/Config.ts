import { parseFieldOverrides } from '../overrides';
import { FieldOverrideType } from '../types';

export type ConfigProps = {
    force?: boolean;
    input?: string;
    outDir?: string;
    excludes?: string | Array<string>;
    verbose?: boolean;
    models?: boolean;
    index?: boolean;
    fieldOverrides?: string | Array<string>;
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
        if (params.excludes) {
            const excludeValues = Array.isArray(params.excludes)
                ? params.excludes
                : params.excludes.split(',');
            this.excludes = excludeValues;
        } else {
            this.excludes = [];
        }
        this.verbose = params.verbose ?? false;
        this.models = params.models ?? false;
        this.index = params.index ?? false;
        this.fieldOverrides = params.fieldOverrides
            ? parseFieldOverrides(params.fieldOverrides)
            : [];
    }
}
