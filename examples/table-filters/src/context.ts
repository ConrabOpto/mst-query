import { createContext, QueryClient } from 'mst-query';
import { RootStore } from './models/stores';

export const queryClient = new QueryClient({ RootStore });

export const { QueryClientProvider, useRootStore } = createContext(queryClient);
