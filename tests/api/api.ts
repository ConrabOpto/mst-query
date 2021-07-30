import { itemData, moreListData, listData } from './data';

export const api = {
    async getItem() {
        return itemData;
    },
    async getItems({ pagination }: any = {}) {
        const { offset = 0 } = pagination ?? {};
        if (offset !== 0) {
            return moreListData;
        }
        return listData;
    },
    async setDescription({ request }: any) {
        const { description } = request;
        return {
            ...itemData,
            description,
        };
    },
    async addItem() {
        return {
            ...itemData,
            id: 'add-test',
            description: 'add',
        };
    },
};
