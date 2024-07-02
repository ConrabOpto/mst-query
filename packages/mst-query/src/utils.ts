import {
    isUnionType,
    isModelType,
    isLateType,
    isOptionalType,
    isArrayType,
    isReferenceType,
    isFrozenType,
} from 'mobx-state-tree';
import { isObservableArray } from 'mobx';
import * as React from 'react';

export function getRealTypeFromObject(typeDef: any, data: any, key: any) {
    const modelOrBaseType = getSubType(typeDef, data[key]);
    if (modelOrBaseType && modelOrBaseType.properties && !modelOrBaseType.properties[key]) {
        return null;
    }
    const subType =
        modelOrBaseType.properties && !isFrozenType(modelOrBaseType)
            ? getSubType((modelOrBaseType as any).properties[key], data[key])
            : modelOrBaseType;
    return subType;
}

export function getSubType(t: any, data?: any): any {
    if (isUnionType(t)) {
        const actualType = t.determineType && data !== undefined && t.determineType(data);
        if (actualType) {
            return actualType;
        }
        if (!t.determineType) {
            return getSubType(t._subtype);
        }
        const subTypes = t._types.map((t: any) => getSubType(t, data));
        const modelWithProperties = subTypes.find((x: any) => isModelType(x) || isReferenceType(x));
        if (modelWithProperties) {
            return getSubType(modelWithProperties, data);
        }
        return t;
    } else if (isLateType(t)) {
        return getSubType((t as any).getSubType(), data);
    } else if (isOptionalType(t)) {
        return getSubType((t as any)._subtype, data);
    } else if (isArrayType(t)) {
        return getSubType((t as any)._subType, data);
    } else if (isReferenceType(t)) {
        return getSubType((t as any).targetType, data);
    } else {
        return t;
    }
}

function isArray(a: any) {
    return Array.isArray(a) || isObservableArray(a);
}

export function isObject(a: any) {
    return a && typeof a === 'object' && !isArray(a);
}

// From https://github.com/scottrippey/react-use-event-hook

type AnyFunction = (...args: any[]) => any;

/**
 * Suppress the warning when using useLayoutEffect with SSR. (https://reactjs.org/link/uselayouteffect-ssr)
 * Make use of useInsertionEffect if available.
 */
const useInsertionEffect =
    typeof window !== 'undefined'
        ? // useInsertionEffect is available in React 18+
          React.useInsertionEffect || React.useLayoutEffect
        : () => {};

/**
 * Similar to useCallback, with a few subtle differences:
 * - The returned function is a stable reference, and will always be the same between renders
 * - No dependency lists required
 * - Properties or state accessed within the callback will always be "current"
 */
export function useEvent<TCallback extends AnyFunction>(callback: TCallback): TCallback {
    // Keep track of the latest callback:
    const latestRef = React.useRef<TCallback>(useEvent_shouldNotBeInvokedBeforeMount as any);
    useInsertionEffect(() => {
        latestRef.current = callback;
    }, [callback]);

    // Create a stable callback that always calls the latest callback:
    // using useRef instead of useCallback avoids creating and empty array on every render
    const stableRef = React.useRef<TCallback>(null as any);
    if (!stableRef.current) {
        stableRef.current = function (this: any) {
            return latestRef.current.apply(this, arguments as any);
        } as TCallback;
    }

    return stableRef.current;
}

/**
 * Render methods should be pure, especially when concurrency is used,
 * so we will throw this error if the callback is called while rendering.
 */
function useEvent_shouldNotBeInvokedBeforeMount() {
    throw new Error(
        'INVALID_USEEVENT_INVOCATION: the callback from useEvent cannot be invoked before the component has mounted.'
    );
}
