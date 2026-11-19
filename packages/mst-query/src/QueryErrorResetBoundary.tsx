'use client';
import * as React from 'react';

export type QueryErrorResetBoundaryValue = {
    /** Lets queries in the boundary retry instead of rethrowing their error. */
    reset: () => void;
    clearReset: () => void;
    isReset: () => boolean;
};

function createValue(): QueryErrorResetBoundaryValue {
    let isReset = false;
    return {
        clearReset: () => {
            isReset = false;
        },
        reset: () => {
            isReset = true;
        },
        isReset: () => isReset,
    };
}

const QueryErrorResetBoundaryContext = React.createContext(createValue());

/** Resets query errors in the closest `QueryErrorResetBoundary`, or globally without one. */
export const useQueryErrorResetBoundary = () => React.useContext(QueryErrorResetBoundaryContext);

type QueryErrorResetBoundaryProps = {
    children: ((value: QueryErrorResetBoundaryValue) => React.ReactNode) | React.ReactNode;
};

export function QueryErrorResetBoundary({ children }: QueryErrorResetBoundaryProps) {
    const [value] = React.useState(createValue);
    return (
        <QueryErrorResetBoundaryContext.Provider value={value}>
            {typeof children === 'function' ? children(value) : children}
        </QueryErrorResetBoundaryContext.Provider>
    );
}
