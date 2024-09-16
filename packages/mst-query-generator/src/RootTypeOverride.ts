// import { RootType } from './models';
// import { FieldOverride } from './models/FieldOverride';
// import { Overrides } from './models/Overrides';
// import { isIdType } from './utils';

// export class RootTypeOverride {
//     rootType: RootType;
//     overrides: Overrides;

//     constructor(params: any) {
//         this.rootType = params.rootType;
//         this.overrides = params.overrides;
//     }

//     public getMstTypeForField(fieldName: string, oldFieldType: string) {
//         const mostSpecificIdOverride = this.getMostSpecificIdOverride();
//         const hasIdOverride = () => mostSpecificIdOverride !== null;

//         const override = this.overrides.getOverrideForField(
//             this.rootType.name,
//             fieldName,
//             oldFieldType
//         );

//         if (hasIdOverride() && override && isIdType(override, oldFieldType)) {
//             if (override && override.specificity === mostSpecificIdOverride?.specificity) {
//                 return [override.newFieldType, override.typeImportPath];
//             }

//             return ['frozen()', undefined];
//         }

//         return override && [override.newFieldType, override.typeImportPath];
//     }

//     private getMostSpecificIdOverride() {
//         if (!this.rootType.fields) {
//             return null;
//         }

//         const scalarFields = this.rootType.fields
//             .map((field) => {
//                 const type = field.GetTypeOrDefault();
//                 return { name: field.name, type };
//             })
//             .filter(({ type }) => type !== null)
//             .filter(({ type }) => type!.kind.isScalar);

//         const overrides = scalarFields.map(({ name, type }) => {
//             return this.overrides.getOverrideForField(this.rootType.name, name, type!.name!);
//         });
//         const idOverrides = overrides
//             .filter((override) => override !== null)
//             .filter((override) => override!.isIdentifier());

//         const mostSpecificIdOverride = this.overrides.getMostSpecificOverride(idOverrides);

//         const mostSpecificIdOverrides = idOverrides.filter((override) => {
//             return override.specificity === mostSpecificIdOverride?.specificity;
//         });

//         if (mostSpecificIdOverrides.length > 1) {
//             console.warn(`Type: ${this.rootType.name} has multiple matching id field overrides`);
//             console.warn('Consider adding a more specific override.');
//         }

//         return mostSpecificIdOverride;
//     }
// }
