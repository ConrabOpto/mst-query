import { createQuery, createMutation, createSubscription } from "./create";
import { MutationModelType } from "./MutationModel";
import { QueryModelType } from "./QueryModel";
import { SubscriptionModelType } from "./SubscriptionModel";

export type QueryReturnType = ReturnType<typeof createQuery>;
export type MutationReturnType = ReturnType<typeof createMutation>;
export type SubscriptionReturnType = ReturnType<typeof createSubscription>;

export type AnyQueryType = QueryReturnType | MutationReturnType | SubscriptionReturnType;

export type QueryType = QueryModelType | MutationModelType | SubscriptionModelType;