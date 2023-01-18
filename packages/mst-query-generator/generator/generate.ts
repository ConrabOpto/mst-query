import { RootType, Config, GeneratedFile } from '../src/models';
import { IHandleType, ITypeResolver, HandlerOptions, TypeHandlerProps } from '../src/types';
import {
    filterTypes,
    header,
    nameToCamelCase,
    newRow,
    reservedGraphqlNames,
    validateTypes,
} from '../src/utils';
import { typeHandler as defaultTypeHandler } from '../src/typeHandler';

export interface GenerateProps {
    rootTypes: RootType[];
    typeResolver?: ITypeResolver;
    typeHandler?: IHandleType;
    excludes?: string[];
    config?: Config;
}

export class Generate implements GenerateProps {
    rootTypes: RootType[];
    typeResolver: ITypeResolver | undefined;
    typeHandler: IHandleType | undefined;
    files: GeneratedFile[];
    excludes: string[];
    config?: Config;

    knownTypes: string[];
    refs: string[];

    constructor(params: GenerateProps) {
        this.rootTypes = params.rootTypes;
        this.typeResolver = params.typeResolver;
        this.typeHandler = params.typeHandler ? params.typeHandler : defaultTypeHandler;
        this.files = [] as GeneratedFile[];
        this.config = params.config ?? undefined;

        const excludes = params.excludes ? params.excludes : [];
        this.excludes = [...excludes, ...reservedGraphqlNames];
    }

    public UpdateNamesToCamelCase() {
        this.rootTypes
            .filter((type) => !type.canCamelCase)
            .forEach((type) => {
                type.updateName(nameToCamelCase(type.name));

                type.fields?.forEach((field) => {
                    field.updateName(nameToCamelCase(field.name));
                    field.args?.forEach((arg) => {
                        arg.updateName(nameToCamelCase(arg.name));
                    });
                });

                type.inputFields.forEach((inputField) => {
                    inputField.updateName(nameToCamelCase(inputField.name));
                });
            });
    }

    public GenerateModelBase() {
        const content = [
            `import { types } from "mobx-state-tree"`,
            `\n`,
            `export const ModelBase = types.model({});`,
        ];
        const file = new GeneratedFile({ name: 'ModelBase', content });

        this.files.push(file);
    }

    public GenerateTypes = () => {
        validateTypes(this.rootTypes, this.excludes);

        const rootTypes = filterTypes(this.rootTypes, this.excludes);
        this.knownTypes = rootTypes.map((x) => x.name);

        rootTypes.forEach((rootType) => {
            const props = {
                rootType,
                knownTypes: this.knownTypes,
            } as TypeHandlerProps;

            const options = {
                config: this.config,
                typeResolver: this.typeResolver,
            } as HandlerOptions;

            const generatedFiles = this.typeHandler?.(props, options);

            if (generatedFiles?.length) {
                this.files.push(...generatedFiles);
            }
        });
    };

    public GenerateIndexFile(): void {
        const content = [
            `${header}`,
            newRow,
            `${this.files.map((file) => `export * from "./${file.name}"`).join(newRow)}`,
        ];

        const file = new GeneratedFile({ name: 'index', content });

        this.files.push(file);
    }
}
