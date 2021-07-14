import queryCache from './cache';

export type { QueryFnType } from './MstQueryHandler';
export { queryCache };
export { config, configure } from './config';
export { useQuery, useLazyQuery, useMutation, useSubscription } from './hooks';
export { create, createQuery, createMutation, createSubscription } from './create';
export { MstQueryRef } from './MstQueryRef';
export { createOptimisticData } from './merge';
