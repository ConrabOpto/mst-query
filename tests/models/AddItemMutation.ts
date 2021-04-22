import { flow, types } from "mobx-state-tree";
import { createMutation, MstQueryRef, queryCache } from "../../src";
import { ItemModel } from "./ItemModel";
import { ListQuery } from "./ListQuery";

export const AddItemMutation = createMutation('AddMutation', {
    data: MstQueryRef(ItemModel),
    env: types.frozen(),
    request: types.frozen()
}).actions(self => ({
    run: flow(function* () {
        const next = yield self.mutate(self.env.api.addItem);
        const { data } = next();

        const query = queryCache.find(ListQuery, q => q.request.id === 'test');
        query?.addItem(data);
    })
}))