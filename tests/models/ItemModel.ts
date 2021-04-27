import { types } from "mobx-state-tree";
import { MstQueryRef } from "../../src";
import { UserModel } from "./UserModel";

export const DataModel = types
  .model("DataModel", {
    name: types.string,
  })
  .volatile((self) => ({
    newName: "",
  }));

export const ItemModel = types.model("ItemModel", {
  id: types.identifier,
  description: types.string,
  created: types.Date,
  count: types.number,
  createdBy: MstQueryRef(UserModel),
  data: types.maybe(DataModel),
});
