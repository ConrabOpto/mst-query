import { FieldOverride } from './FieldOverride';
import { Overrides } from './Overrides';

export type ConfigProps = {
    force?: boolean;
    input?: string;
    outDir?: string;
    excludes?: string | Array<string>;
    verbose?: boolean;
    models?: boolean;
    index?: boolean;
    fieldOverrides?: string | Array<string>;
    withTypeRefsPath?: string;
};

export class Config {
    force: boolean;
    input: string;
    outDir: string;
    excludes: Array<string>;
    verbose: boolean;
    models?: boolean;
    index?: boolean;
    overrides?: Overrides;
    withTypeRefsPath: string;

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
        this.withTypeRefsPath = params.withTypeRefsPath ?? '@utils';

        const overrides: FieldOverride[] = !Array.isArray(params.fieldOverrides)
            ? FieldOverride.parse(params.fieldOverrides)
            : (params.fieldOverrides as string[]).map((o) => FieldOverride.parse(o)).flat(1);

        this.overrides = new Overrides({ overrides });
    }
}
