import { createSubscription, MstQueryRef } from "../../src";
import { ItemModel } from "./ItemModel";

export const ItemSubscription = createSubscription('ItemSubscription', {
    data: MstQueryRef(ItemModel)
}).actions(() => ({
    run() {
        // TODO: Not implemented
    }
}));
