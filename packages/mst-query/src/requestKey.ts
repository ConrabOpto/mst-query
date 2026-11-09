import {
    getIdentifier,
    getSnapshot,
    IAnyType,
    isArrayType,
    isLateType,
    isMapType,
    isModelType,
    isOptionalType,
    isReferenceType,
    isStateTreeNode,
    isUnionType,
    resolveIdentifier,
    IAnyStateTreeNode,
} from 'mobx-state-tree';

// Normalize snapshots without creating a detached request model. In particular,
// creating one would invalidate safe references before it reaches the root.
export function normalizeRequest(type: IAnyType, value: any): any {
    if (isOptionalType(type) && (type as any).optionalValues) {
        const optional = type as any;
        if (optional.optionalValues.includes(value))
            value = optional.getDefaultInstanceOrSnapshot();
        return normalizeRequest(optional.getSubTypes(), value);
    }
    if (isUnionType(type) && (type as any).determineType) {
        const subtype = (type as any).determineType(value);
        return subtype ? normalizeRequest(subtype, value) : value;
    }
    if (isLateType(type)) return normalizeRequest((type as any).getSubTypes(), value);
    if (isReferenceType(type) && (type as any).targetType)
        return isStateTreeNode(value) ? getIdentifier(value) : value;
    if (isStateTreeNode(value)) value = getSnapshot(value);
    if (value == null) return value;
    if (isModelType(type)) {
        return Object.fromEntries(
            Object.entries((type as any).properties as Record<string, IAnyType>).map(
                ([key, child]) => [key, normalizeRequest(child, value[key])],
            ),
        );
    }
    if (isArrayType(type))
        return value.map((item: any) => normalizeRequest((type as any).getChildType(), item));
    if (isMapType(type)) {
        const entries = value instanceof Map ? [...value] : Object.entries(value);
        return Object.fromEntries(
            entries.map(([key, item]) => [
                key,
                normalizeRequest((type as any).getChildType(), item),
            ]),
        );
    }
    return value instanceof Date ? value.getTime() : value;
}

export function hashRequest(value: unknown): string {
    const ancestors = new Set<object>();
    const normalize = (input: any): any => {
        if (isStateTreeNode(input)) input = getSnapshot(input);
        if (input instanceof Date) return input.getTime();
        if (
            input === undefined ||
            input === null ||
            typeof input === 'string' ||
            typeof input === 'boolean'
        )
            return input;
        if (typeof input === 'number' && Number.isFinite(input)) return input;
        if (
            typeof input !== 'object' ||
            (!Array.isArray(input) &&
                Object.getPrototypeOf(input) !== Object.prototype &&
                Object.getPrototypeOf(input) !== null)
        ) {
            throw new TypeError(
                'Query requests must contain serializable snapshot values. Supply requestKey for other request types.',
            );
        }
        if (ancestors.has(input)) throw new TypeError('Query requests cannot contain cycles.');
        ancestors.add(input);
        const result = Array.isArray(input)
            ? input.map((item) => {
                  if (item === undefined)
                      throw new TypeError(
                          'Query request arrays cannot contain undefined values. Supply requestKey to customize identity.',
                      );
                  return normalize(item);
              })
            : Object.fromEntries(
                  Object.keys(input)
                      .sort()
                      .filter((key) => input[key] !== undefined)
                      .map((key) => [key, normalize(input[key])]),
              );
        ancestors.delete(input);
        return result;
    };
    return JSON.stringify(normalize(value));
}

export function validateCacheTime(value: number) {
    if (value !== Infinity && (!Number.isFinite(value) || value < 0 || value > 2 ** 31 - 1)) {
        throw new RangeError(
            'cacheTime must be between 0 and 2147483647 milliseconds, or Infinity.',
        );
    }
}

/** Resolve reference placeholders without writing into the shared entry. */
export function resolvePlaceholder(type: IAnyType, value: any, root: IAnyStateTreeNode): any {
    if (value == null || isStateTreeNode(value)) return value;
    if (isOptionalType(type) && (type as any).optionalValues)
        return resolvePlaceholder((type as any).getSubTypes(), value, root);
    if (isUnionType(type) && (type as any).determineType) {
        const subtype = (type as any).determineType(value);
        return subtype ? resolvePlaceholder(subtype, value, root) : value;
    }
    if (isLateType(type)) return resolvePlaceholder((type as any).getSubTypes(), value, root);
    if (isReferenceType(type) && (type as any).targetType)
        return typeof value === 'object'
            ? value
            : resolveIdentifier((type as any).targetType, root, value);
    if (isModelType(type)) {
        const properties = (type as any).properties as Record<string, IAnyType>;
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                key,
                properties[key] ? resolvePlaceholder(properties[key], child, root) : child,
            ]),
        );
    }
    if (isArrayType(type))
        return value.map((child: any) =>
            resolvePlaceholder((type as any).getChildType(), child, root),
        );
    if (isMapType(type))
        return new Map(
            Object.entries(value).map(([key, child]) => [
                key,
                resolvePlaceholder((type as any).getChildType(), child, root),
            ]),
        );
    return value;
}
