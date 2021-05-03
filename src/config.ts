type MstQueryConfig = {
    env: any;
    getId: (data: any) => any;
};

export const config: MstQueryConfig = {
    env: {},
    getId: (data: any) => data['id']
};

export const configure = (options: Partial<MstQueryConfig>) => {
    Object.assign(config, options);
};