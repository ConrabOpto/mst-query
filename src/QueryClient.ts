import { IAnyModelType, Instance } from 'mobx-state-tree';
import { QueryStore } from './QueryStore';
import { RootStore } from './RootStore';

type QueryClientConfig<T extends IAnyModelType> = {
    env: any;
    queryOptions: {
        staleTime?: number;
        cacheTime?: number;
    };
    RootStore?: T;
};

const defaultConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        cacheTime: 300,
    },
};

export class QueryClient<T extends IAnyModelType> {
    config = defaultConfig as QueryClientConfig<T>;
    rootStore!: Instance<T>;
    queryStore: QueryStore;
    #initialized = false;

    constructor(config: Partial<QueryClientConfig<T>> = {}) {
        Object.assign(this.config, {
            ...config,
            queryOptions: {
                ...this.config.queryOptions,
                ...config.queryOptions,
            },
        });

        this.queryStore = new QueryStore(this);
    }

    init(env = {}) {
        if (this.#initialized) {
            return this;
        }

        this.config.env = env;
        this.config.env.queryClient = this;

        this.rootStore = this.config.RootStore
            ? this.config.RootStore.create({}, this.config.env)
            : (RootStore.create({}, this.config.env) as Instance<T>);

        this.#initialized = true;

        return this;
    }
}
