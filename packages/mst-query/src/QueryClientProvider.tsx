import { IAnyModelType } from 'mobx-state-tree';
import * as React from 'react';
import { QueryClient } from './QueryClient';

type QueryClientProviderProps = {
    env?: any;
    initialData?: any;
    children: React.ReactNode;
};

export const Context = React.createContext<QueryClient<any> | undefined>(undefined);

export function createContext<T extends IAnyModelType>(queryClient: QueryClient<T>) {
    const QueryClientProvider = ({
        env,
        initialData,
        children,
    }: QueryClientProviderProps) => {
        const q = React.useRef<any>(null);
        if (!q.current) {
            q.current = queryClient.init(initialData, env);
        }
        return <Context.Provider value={q.current}>{children}</Context.Provider>;
    };
    const useQueryClient = () => {
        const qc = React.useContext(Context) as QueryClient<T>;
        if (!qc) {
            throw new Error('No QueryClient set, use QueryClientProvider to set one');
        }
        return qc;
    };
    const useRootStore = () => {
        const qc = React.useContext(Context) as QueryClient<T>;
        return qc.rootStore;
    };
    return {
        queryClient,
        useQueryClient,
        useRootStore,
        QueryClientProvider,
    };
}
