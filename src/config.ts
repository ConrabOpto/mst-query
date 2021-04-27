type MstQueryConfig = {
    env?: any;
};

export const config: MstQueryConfig = {
    env: {},
};

export const configure = (c: MstQueryConfig) => {
    config.env = c.env ?? config.env;
};
