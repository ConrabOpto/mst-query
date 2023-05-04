import { types } from "mobx-state-tree";
import { createQuery } from "../../src/create";
import { api } from "../api/api";
import { ItemModel } from "./ItemModel";

export const ItemQueryWithOptionalRequest = createQuery('ItemQuery', {
    request: types.model({ id: types.string, filter: types.maybeNull(types.string) }),
    data: types.reference(ItemModel),
    async endpoint(args) {
        return args.meta.getItem ? args.meta.getItem(args) : api.getItem(args);
    },
});
