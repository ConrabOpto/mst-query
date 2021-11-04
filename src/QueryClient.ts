import { getEnv, IAnyModelType, Instance } from 'mobx-state-tree';
import { QueryStore } from './QueryStore';
import { RootStore } from './RootStore';

type QueryClientConfig<T extends Instance<IAnyModelType>> = {
    env: any;
    queryOptions: {
        staleTime?: number;
        cacheTime?: number;
    };
    rootStore?: T;
};

const defaultConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        cacheTime: 300,
    }
};

export class QueryClient<T extends Instance<IAnyModelType>> {
    config = defaultConfig as QueryClientConfig<T>;
    rootStore: T;
    queryStore: QueryStore;

    constructor(config: Partial<QueryClientConfig<T>> = {}) {
        if (config.rootStore && getEnv(config.rootStore) !== config.env) {
            throw new Error('Environment of rootStore and env should be the same object');
        }
        Object.assign(this.config, {
            ...config,
            queryOptions: {
                ...this.config.queryOptions,
                ...config.queryOptions,
            }
        });
        this.config.env.queryClient = this;

        this.rootStore = this.config.rootStore ?? RootStore.create({}, this.config.env) as T;
        this.queryStore = new QueryStore(this);
    }
}
