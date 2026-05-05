import { IAnyModelType } from 'mobx-state-tree';
import * as React from 'react';
import { QueryClient } from './QueryClient';

type QueryClientProviderProps = {
    env?: any;
    initialData?: any;
    children: React.ReactNode;
};

type CreateContextOptions = {
    context?: React.Context<QueryClient<any> | undefined>;
};

export const Context = React.createContext<QueryClient<any> | undefined>(undefined);

export function createContext<T extends IAnyModelType>(queryClient: QueryClient<T>, options?: CreateContextOptions) {
    const ctx = options?.context ?? Context;

    const QueryClientProvider = ({
        env,
        initialData,
        children,
    }: QueryClientProviderProps) => {
        const q = React.useRef<any>(null);
        if (!q.current) {
            q.current = queryClient.init(initialData, env);
        }
        return <ctx.Provider value={q.current}>{children}</ctx.Provider>;
    };
    const useQueryClient = () => {
        const qc = React.useContext(ctx) as QueryClient<T>;
        if (!qc) {
            throw new Error('No QueryClient set, use QueryClientProvider to set one');
        }
        return qc;
    };
    const useRootStore = () => {
        const qc = React.useContext(ctx) as QueryClient<T>;
        return qc.rootStore;
    };
    return {
        queryClient,
        useQueryClient,
        useRootStore,
        QueryClientProvider,
    };
}
