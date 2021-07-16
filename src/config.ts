type MstQueryConfig = {
    env: any;
    queryOptions: {
        staleTime?: number;
        cacheTime?: number;
    };
};

export const config: MstQueryConfig = {
    env: {},
    queryOptions: {
        staleTime: 0,
        cacheTime: 300
    },
};

export const configure = (options: Partial<MstQueryConfig>) => {
    Object.assign(config, {
        ...options,
        queryOptions: {
            ...config.queryOptions,
            ...options.queryOptions,
        },
    });
};
