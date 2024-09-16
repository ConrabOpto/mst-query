import {
    Config,
    RootType,
    Type,
    Field,
    GeneratedField,
    GeneratedFile,
    InterfaceOrUnionTypeResult,
} from './models';
import { FieldOverride } from './models/FieldOverride';
import { Overrides } from './models/Overrides';

export type ModelFieldRef = {
    fieldName: string;
    modelType: string;
    isNested: boolean;
    isList: boolean;
};

export type TypeHandlerProps = {
    rootType: RootType;
    knownTypes: string[];
    excludes?: string[];
    imports?: Map<string, Set<string>>;
};

export type FieldHandlerProps = {
    field: Field;
    fieldType: Type | null;
    isNullable: boolean;
    isNested: boolean;
    fieldHandlers?: Map<string, IHandleField>;
    refs: ModelFieldRef[];
    override?: FieldOverride;
} & TypeHandlerProps;

export type HandlerOptions = {
    config?: Config;
    typeResolver?: ITypeResolver;
    fieldHandler?: IHandleField;
    typeHandlers?: IHandleType[];
    addImport?: (modelName: string, importToAdd: string) => void;
    overrides?: Overrides;
};

export type FieldOverrideProps = {
    rootTypeName: string;
    fieldName: string;
    oldFieldType: string;
    newFieldType: string;
    typeImportPath: string;
};

export interface ITypeResolver {
    GetInterfaceAndUnionTypeResults(): Map<string, InterfaceOrUnionTypeResult>;
}

export interface IHandleType {
    (props: TypeHandlerProps, options: HandlerOptions): GeneratedFile[];
}

export interface IHandleField {
    (props: FieldHandlerProps, options: HandlerOptions): GeneratedField | null;
}
