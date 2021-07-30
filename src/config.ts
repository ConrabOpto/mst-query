import { getEnv } from 'mobx-state-tree';
import { RootStore } from './RootStore';

type MstQueryConfig = {
    env: any;
    queryOptions: {
        staleTime?: number;
        cacheTime?: number;
    };
    rootStore?: any;
};

export const config: MstQueryConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        cacheTime: 300,
    },
};

export const configure = (options: Partial<MstQueryConfig>) => {
    if (options.rootStore && getEnv(options.rootStore) !== options.env) {
        throw new Error('Environment of rootStore and env should be the same object');
    }
    Object.assign(config, {
        ...options,
        queryOptions: {
            ...config.queryOptions,
            ...options.queryOptions,
        },
    });
    config.rootStore = options.rootStore ?? RootStore.create({}, config.env);
};
