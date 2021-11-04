import { getEnv, IAnyModelType, IAnyType, Instance, IStateTreeNode } from 'mobx-state-tree';
import * as React from 'react';
import { mergeOptimisticData } from './merge';
import { QueryClient } from './QueryClient';

type QueryClientProviderProps<T> = {
    client: QueryClient<T>;
};

export const Context = React.createContext<QueryClient<any> | undefined>(undefined);

export function createContext<T extends Instance<IAnyModelType>>(queryClient: QueryClient<T>) {
    const QueryClientProvider: React.FC<QueryClientProviderProps<T>> = ({ client, children }) => {
        React.useEffect(() => {
            return () => {
                client.queryStore.clear();
            };
        }, [client]);
        return <Context.Provider value={client}>{children}</Context.Provider>;
    };
    const useQueryClient = () => {
        const qc = React.useContext(Context) as QueryClient<T>;
        if (!qc) {
            throw new Error('No QueryClient set, use QueryClientProvider to set one');
        }
        return qc;
    };
    const getQueryClient = (node: IStateTreeNode) => {
        return getEnv(node).queryClient as QueryClient<T>;
    };
    const createOptimisticData = <TNode extends IAnyType>(typeOrNode: TNode | Instance<TNode>, data: any) => {
        return mergeOptimisticData(typeOrNode, data, queryClient.config.env);
    };
    return {
        queryClient,
        useQueryClient,
        QueryClientProvider,
        getQueryClient,
        createOptimisticData
    };
}
