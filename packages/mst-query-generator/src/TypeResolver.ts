import { ITypeResolver } from './types';
import { RootType, InterfaceOrUnionTypeResult } from './models';

export class TypeResolver implements ITypeResolver {
    interfaceMap: Map<string, RootType>;
    possibleTypeMap: Map<string, Set<RootType>>;
    result: Map<string, InterfaceOrUnionTypeResult>;
    rootTypes: RootType[];

    constructor(params: any = {}) {
        this.rootTypes = params.rootTypes ?? [];
        this.result = new Map<string, InterfaceOrUnionTypeResult>();
        this.interfaceMap = new Map<string, RootType>();
        this.possibleTypeMap = new Map<string, Set<RootType>>();
    }

    GetInterfaceAndUnionTypeResults(): Map<string, InterfaceOrUnionTypeResult> {
        // combine models with kind interface and union to a single result model
        // add underlying types (e.g actual models behind union) to result model
        // add underlying fields to result model
        // returns a map with interface or union type name as key and result model as value
        this.rootTypes.forEach((rootType) => {
            this.handleInterface(rootType);
            this.handleUnion(rootType);
        });

        this.rootTypes.forEach((type) => {
            this.handleObject(type);
        });

        return this.result;
    }

    handleInterface(rootType: RootType): void {
        if (rootType.kind.isInterface) {
            this.interfaceMap.set(rootType.name, rootType);
        }
    }

    handleUnion(rootType: RootType): void {
        if (rootType.kind.isUnion) {
            const possibleTypes = rootType.possibleTypes ?? [];
            possibleTypes.forEach((possibleType) => {
                const possibleTypeName = possibleType.name ?? '';
                const unionSet = this.possibleTypeMap.get(possibleTypeName);

                if (unionSet) {
                    unionSet.add(rootType);
                } else if (possibleTypeName) {
                    this.possibleTypeMap.set(possibleTypeName, new Set([rootType]));
                }
            });
        }
    }

    handleObject(rootType: RootType): void {
        if (rootType.kind.isObject) {
            rootType.interfaces.forEach((rootTypeInterface) => {
                const interfaceName = rootTypeInterface.name ?? '';
                const interfaceRootType = this.interfaceMap.get(interfaceName);

                if (interfaceRootType) {
                    this.addToResult(interfaceRootType, rootType);

                    interfaceRootType.fields.forEach((interfaceField) => {
                        const fieldContainsName = rootType.fields.some(
                            (objectField) => objectField.name === interfaceField.name
                        );

                        if (!fieldContainsName) {
                            rootType.fields?.push(interfaceField);
                        }
                    });
                }
            });

            const possibleRootTypesSet = this.possibleTypeMap.get(rootType.originalName);

            if (!possibleRootTypesSet) {
                return;
            }

            possibleRootTypesSet.forEach((unionRootType) =>
                this.addToResult(unionRootType, rootType)
            );
        }
    }

    addToResult(type: RootType, subType: RootType) {
        if (!this.result.has(type.name)) {
            const interfaceOrUnionTypeResult = new InterfaceOrUnionTypeResult({
                name: type.name,
                kind: type.kind.value,
                rootTypes: [subType],
                fields: type.kind.isInterface ? type.fields : [],
            });
            this.result.set(type.name, interfaceOrUnionTypeResult);

            return;
        }

        const interfaceOrUnionTypeResult = this.result.get(type.name);

        if (!this.result.has(subType.name)) {
            const match = interfaceOrUnionTypeResult?.rootTypes.some(
                (x) => x.originalName === subType.originalName
            );
            if (!match) {
                interfaceOrUnionTypeResult?.rootTypes.push(subType);
            }
        }
    }
}
