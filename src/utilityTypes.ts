import { createQuery, createMutation, createSubscription } from './create';

export type QueryReturnType = ReturnType<typeof createQuery>;
export type MutationReturnType = ReturnType<typeof createMutation>;
export type SubscriptionReturnType = ReturnType<typeof createSubscription>;

export type AnyQueryType = QueryReturnType | MutationReturnType | SubscriptionReturnType;

export enum QueryStatus {
    Active = 'ACTIVE',
    Stale = 'STALE'
};
