import { destroy, IAnyModelType, Instance } from 'mobx-state-tree';
import { QueryStore } from './QueryStore';

export type EndpointType = (
    options: {
        request?: any;
        pagination?: any;
        meta: { [key: string]: any };
        signal: AbortSignal;
        setData: (data: any) => any;
    },
    model: any
) => Promise<any>;

type QueryClientConfig<T extends IAnyModelType> = {
    env?: any;
    queryOptions?: {
        staleTime?: number;
        endpoint?: EndpointType;
    };
    RootStore: T;
};

const defaultConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        refetchOnMount: 'if-stale',
        refetchOnChanged: 'all',
    },
};

export class QueryClient<T extends IAnyModelType> {
    config: QueryClientConfig<T>;
    rootStore!: Instance<T>;
    queryStore!: QueryStore;
    #initialized = false;
    #initialData = {} as any;

    constructor(config: QueryClientConfig<T>) {
        this.config = {
            ...defaultConfig,
            ...config,
            queryOptions: {
                ...defaultConfig.queryOptions,
                ...config.queryOptions,
            },
        };
    }

    init(initialData: any = {}, env = {}) {
        if (this.#initialized) {
            return this;
        }

        this.config.env = env;
        this.config.env.queryClient = this;
        this.queryStore = new QueryStore(this);

        this.rootStore = this.config.RootStore.create(initialData, this.config.env);        

        this.#initialized = true;

        return this;
    }

    reset() {
        destroy(this.rootStore);
        this.queryStore = new QueryStore(this);
        this.rootStore = this.config.RootStore.create(this.#initialData, this.config.env);
    }

    
}
