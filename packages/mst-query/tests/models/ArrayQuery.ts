import { types } from "mobx-state-tree";
import { createQuery } from "../../src";
import { api } from "../api/api";
import { ItemModel } from "./ItemModel";

export const ArrayQuery = createQuery('ListQuery', {
    data: types.array(types.reference(ItemModel)),
    async endpoint(args) {
        const result = await api.getItems(args);
        return result.items;
    },
});
