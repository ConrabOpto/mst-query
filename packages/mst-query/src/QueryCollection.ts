import {
    flow,
    IAnyModelType,
    IAnyType,
    IMapType,
    IModelType,
    Instance,
    isMapType,
    SnapshotIn,
    types,
} from 'mobx-state-tree';
import { hashRequest, normalizeRequest, validateCacheTime } from './requestKey';
import { getSubType } from './utils';

const mapEntryTypes = new WeakSet<IAnyModelType>();

/** @internal Distinguish map definitions from singleton extensions also named entries. */
export function getQueryMapEntryType(type: IAnyModelType): IAnyModelType | undefined {
    const property = type.properties?.entries;
    if (!property) return;
    const map = getSubType(property);
    if (!isMapType(map)) return;
    const entry = (map as any).getChildType();
    return mapEntryTypes.has(entry) ? entry : undefined;
}

export type EntryOf<T> = T extends {
    isQueryCollection: true;
    entries: { get(key: string): infer E };
}
    ? NonNullable<E>
    : T;
export type QuerySelector<TRequest = unknown> = { request?: TRequest; scope?: string };
export type CollectionOptions<TRequest, TPagination = never> = QuerySelector<TRequest> & {
    pagination?: TPagination;
    meta?: Record<string, any>;
    cacheTime?: number;
    /** Legacy explicit response cache. Request entries are cached automatically. */
    cacheKey?: string;
};
export type QueryResponse<TEntry, TResult = any> = {
    data: TEntry extends { data: infer D } ? D : never;
    error: any;
    result: TResult;
    query: TEntry;
};
export type QueryCollectionModel<
    TEntry extends IAnyModelType,
    TRequest extends IAnyType,
    TPagination extends IAnyType,
> = IModelType<
    { entries: IMapType<TEntry> },
    {
        isQueryCollection: true;
        isInfinite: boolean;
        __entryType: TEntry;
        __cacheTime: number | undefined;
        __getKey(request?: SnapshotIn<TRequest>, scope?: string): string;
        get(request?: SnapshotIn<TRequest>, scope?: string): Instance<TEntry> | undefined;
        getOrCreate(
            options?: CollectionOptions<SnapshotIn<TRequest>, SnapshotIn<TPagination>>,
        ): Instance<TEntry>;
        __removeEntry(key: string, entry: Instance<TEntry>): void;
        query<TResult = any>(
            options?: CollectionOptions<SnapshotIn<TRequest>, SnapshotIn<TPagination>>,
        ): Promise<QueryResponse<Instance<TEntry>, TResult>>;
        refetch<TResult = any>(
            options?: CollectionOptions<SnapshotIn<TRequest>, SnapshotIn<TPagination>>,
        ): Promise<QueryResponse<Instance<TEntry>, TResult>>;
        queryMore<TResult = any>(
            options?: CollectionOptions<SnapshotIn<TRequest>, SnapshotIn<TPagination>>,
        ): Promise<QueryResponse<Instance<TEntry>, TResult>>;
        invalidate(selector?: QuerySelector<SnapshotIn<TRequest>>): void;
        setData(
            data: any,
            options?: CollectionOptions<SnapshotIn<TRequest>, SnapshotIn<TPagination>>,
        ): Instance<TEntry>['data'];
        abort(selector?: QuerySelector<SnapshotIn<TRequest>>): void;
    }
>;

export function createQueryCollection<
    TEntry extends IAnyModelType,
    TRequest extends IAnyType,
    TPagination extends IAnyType,
>(
    name: string,
    Entry: TEntry,
    request: TRequest,
    options: {
        infinite?: boolean;
        requestKey?: (request: SnapshotIn<TRequest>) => unknown;
        cacheTime?: number;
    },
    _pagination?: TPagination,
): QueryCollectionModel<TEntry, TRequest, TPagination> {
    mapEntryTypes.add(Entry);
    if (options.cacheTime !== undefined) validateCacheTime(options.cacheTime);
    type EntryInstance = Instance<TEntry>;
    type Selector = QuerySelector<SnapshotIn<TRequest>>;
    type Options = CollectionOptions<SnapshotIn<TRequest>, SnapshotIn<TPagination>>;
    type Response<TResult = any> = {
        data: EntryInstance['data'];
        error: any;
        result: TResult;
        query: EntryInstance;
    };
    type Execute = <TResult = any>(options?: Options) => Promise<Response<TResult>>;

    return types
        .model(name, { entries: types.map(Entry) })
        .volatile(() => ({
            isQueryCollection: true as const,
            isInfinite: !!options.infinite,
            __entryType: Entry,
            __cacheTime: options.cacheTime,
        }))
        .views((self) => ({
            /** @internal Request identity is scoped to this collection instance. */
            __getKey(value?: SnapshotIn<TRequest>, scope?: string) {
                const normalized = normalizeRequest(request, value);
                return hashRequest({
                    scope: scope ?? null,
                    request:
                        options.requestKey && normalized !== undefined
                            ? options.requestKey(normalized)
                            : normalized,
                });
            },
        }))
        .views((self) => ({
            /** Read an existing entry without creating it or extending its lifetime. */
            get(value?: SnapshotIn<TRequest>, scope?: string): EntryInstance | undefined {
                return self.entries.get(self.__getKey(value, scope));
            },
        }))
        .actions((self) => ({
            /** Create/select an entry from an MST action or a committed hook. */
            getOrCreate(params: Options = {}): EntryInstance {
                if (params.cacheTime !== undefined) validateCacheTime(params.cacheTime);
                const key = self.__getKey(params.request, params.scope);
                let entry = self.entries.get(key);
                if (!entry) {
                    self.entries.set(key, {
                        variables: {
                            request: normalizeRequest(request, params.request),
                            ...(options.infinite ? { pagination: params.pagination } : {}),
                        },
                    } as any);
                    entry = self.entries.get(key)!;
                }
                entry!.__MstQueryHandler.configureCollection(
                    self,
                    key,
                    params.cacheTime ?? options.cacheTime,
                );
                return entry as EntryInstance;
            },
            /** @internal Called only after the entry's inactivity timer expires. */
            __removeEntry(key: string, entry: EntryInstance) {
                if (self.entries.get(key) === entry) self.entries.delete(key);
            },
            afterCreate() {
                // Also arm expiry for entries restored from snapshots.
                for (const [key, entry] of self.entries) {
                    entry.__MstQueryHandler.configureCollection(self, key, options.cacheTime);
                }
            },
        }))
        .actions((self) => {
            const execute = (method: 'query' | 'refetch' | 'queryMore') =>
                flow(function* (params: Options = {}) {
                    const entry = self.getOrCreate(params);
                    const response = yield entry[method]({
                        ...params,
                        request: entry.variables.request,
                    });
                    return { ...response, query: entry };
                }) as Execute;
            return {
                query: execute('query'),
                refetch: execute('refetch'),
                queryMore: execute('queryMore'),
                invalidate(selector?: Selector) {
                    const entries =
                        selector === undefined
                            ? self.entries.values()
                            : [self.get(selector.request, selector.scope)];
                    for (const entry of entries) (entry as EntryInstance | undefined)?.invalidate();
                },
                setData(data: any, params: Options = {}): EntryInstance['data'] {
                    return self.getOrCreate(params).setData(data, params);
                },
                abort(selector?: Selector) {
                    const entries =
                        selector === undefined
                            ? self.entries.values()
                            : [self.get(selector.request, selector.scope)];
                    for (const entry of entries) (entry as EntryInstance | undefined)?.abort();
                },
            };
        });
}
