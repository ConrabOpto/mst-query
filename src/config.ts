type MstQueryConfig = {
    env: any;
    queryOptions: {
        cacheMaxAge: number;
    };
};

export const config: MstQueryConfig = {
    env: {},
    queryOptions: {
        cacheMaxAge: 0,
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
