import { Config, RootType, Type, Field, GeneratedField, GeneratedFile, InterfaceOrUnionTypeResult } from './models';

export type ModelFieldRef = {
    fieldName: string;
    modelType: string;
    isNested: boolean;
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
} & TypeHandlerProps;

export type HandlerOptions = {
    config?: Config;
    typeResolver?: ITypeResolver;
    fieldHandler?: IHandleField;
    typeHandlers?: IHandleType[];
    addImport?: (modelName: string, importToAdd: string) => void;
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
