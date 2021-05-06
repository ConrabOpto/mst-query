type MstQueryConfig = {
    env: any;
    getId: (data: any) => any;
    queryOptions: {
        cacheMaxAge: number;
    };
};

export const config: MstQueryConfig = {
    env: {},
    getId: (data: any) => data['id'],
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
