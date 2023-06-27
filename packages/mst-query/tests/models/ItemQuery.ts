import { types } from 'mobx-state-tree';
import { createQuery } from '../../src';
import { api } from '../api/api';
import { ItemModel } from './ItemModel';

export const ItemQuery = createQuery('ItemQuery', {
    request: types.model({ id: types.string }),
    data: types.reference(ItemModel),
    async endpoint(args) {
        return args.meta.getItem ? args.meta.getItem(args) : api.getItem(args);
    },
});

const onUpdate = (url: string, callback: any) => (data: any) => callback(data);

export const SubscriptionItemQuery = createQuery('SubscriptionItemQuery', {
    data: types.reference(ItemModel),
    request: types.model({ id: types.string }),
    async endpoint({ request, setData, meta }) {
        meta.updater = onUpdate(`item/${request.id}`, (data: any) => {
            setData(data);
        });
    },
});
