# Migrating to mst-query 5

## Requirements

mst-query 5 requires React 19, MobX 7 and mobx-state-tree 9:

| Peer dependency   | 4.x            | 5.0            |
| ----------------- | -------------- | -------------- |
| `react`           | `>=18.0.0`     | `>=19.0.0`     |
| `react-dom`       | `>=18.0.0`     | `>=19.0.0`     |
| `mobx`            | `>=6.0.0`      | `>=7.0.0`      |
| `mobx-state-tree` | `>=5.0.0`      | `>=9.0.0`      |

Version 5 also includes everything added after 4.12: server components and streaming
(`prefetchQuery`, `dehydrate`, `HydrationBoundary`, `useSuspenseQuery`), the `client` prop on
`QueryClientProvider`, multiple query clients, and `<Activity>` support. These are additive.

## Breaking changes

### Failed fetches keep their data

In 4.x, a failed fetch set `query.data` to `null`. Like React Query, a failed fetch now keeps the
data from the last successful fetch of the same request. `error` is still set, and two new hook
result flags tell the cases apart:

- `isLoadingError`: the query failed and has no data to show.
- `isRefetchError`: the query failed but still has data from an earlier fetch.

Data is still cleared when a request fails after the request changed, when the data was
placeholder data, and for mutations.

The 4.x pattern of rethrowing errors keeps working, and still throws on every failure:

```tsx
const { data, error } = useQuery(query, { request });
if (error) throw error;
```

To keep showing data after a failed background refetch, throw only when there's nothing to show,
or let the hook do it:

```tsx
const { data, error, isLoadingError } = useQuery(query, { request });
if (isLoadingError) throw error;

// or
const { data } = useQuery(query, {
    request,
    throwOnError: (error, query) => query.data == null,
});
```

Code that checks `if (error)` before rendering `data` keeps working, but can now render the stale
data alongside the error instead. Code that relied on `query.data` being `null` after a failure
should check `query.error` instead.

`useSuspenseQuery` now only throws errors when there is no data. After a failed background refetch
it keeps rendering the data and returns the `error`.

See [Errors](README.md#errors) for `throwOnError`, `QueryErrorResetBoundary` and retrying.

### One query hook per singleton query

Mounting a second `useQuery` or `useInfiniteQuery` for the same `createQuery` or
`createInfiniteQuery` instance now throws:

```
Query "MessageQuery" already has a query hook. Mount only one useQuery or useInfiniteQuery per
singleton; use createQueryMap or createInfiniteQueryMap for shared query hooks.
```

This also applies when the requests match, `request` is omitted, or a hook is disabled. Either:

- keep one hook, and read `query.data`, `query.isLoading` and `query.error` directly from other
  `observer` components,
- give each component its own query instance, or
- switch the query to `createQueryMap` / `createInfiniteQueryMap`, where any number of hooks can
  share or select entries. See [Query maps](README.md#query-maps).

### Queries refetch when the window regains focus

`refetchOnWindowFocus` is new and defaults to `true`: when the tab becomes visible again, mounted
and enabled queries with stale data refetch. To keep the 4.x behavior:

```tsx
const queryClient = new QueryClient({
    RootStore,
    queryOptions: { refetchOnWindowFocus: false },
});
```

### Garbage collection is automatic

`rootStore.runGc()` was removed. Unused models are now collected automatically after root store
changes, at most once per `gcInterval` (five minutes in the browser, `Infinity` on the server).
Remove calls to `runGc()`, and configure the interval on the client if needed:

```tsx
const queryClient = new QueryClient({ RootStore, gcInterval: 60_000 });
```

`gcInterval: 0` collects on the next turn, and `Infinity` disables collection; there is no manual
API anymore. Keep state that should be retained in declared MST properties under the root store,
see [Garbage collection](README.md#garbage-collection).

### Smaller behavior changes

- `invalidate()` only refetches when an enabled query hook is mounted. In 4.x a disabled hook was
  enough. Invalidating during a fetch of a query map entry refetches after that fetch.
- Data hydrated from a `cacheKey` response cache, or from `initialData` with
  `initialDataUpdatedAt`, keeps its original timestamp. `staleTime` counts from that time instead
  of from when it was applied, so such data may refetch right away.
- A mutation's `isLoading` stays `true` until all of its overlapping or queued calls finish,
  instead of turning `false` when the first one does.
- Query endpoints that throw synchronously now produce an `error` result, like a rejected promise,
  instead of throwing from `query()` or `refetch()`. Mutations still throw.
- `useVolatileQuery` uses the latest `endpoint` option instead of the one from the first render.
- For singleton infinite queries, only a change of the `pagination` option loads more pages; a
  fixed `pagination` option is an initial value. Loading pages both by changing `pagination` and by
  calling `queryMore` for the same request now throws, since the two would load pages twice.

## New features

- **Query maps**: `createQueryMap` and `createInfiniteQueryMap` keep one entry per request, so
  any number of hooks can share or select entries. Includes `scope`, `requestKey` and entry
  retention through `cacheTime`. Singleton queries and their snapshots are unchanged. See
  [Query maps](README.md#query-maps).
- **`useInfiniteQuery`** returns a `queryMore` function.
- **`queryClient.isMutating`** is true while any mutation of the client is running. See
  [Global mutation indicator](README.md#global-mutation-indicator).
- **`refetchOnWindowFocus`**, see above.
- **Errors**: `throwOnError`, `isLoadingError`, `isRefetchError`, `QueryErrorResetBoundary` and
  `useQueryErrorResetBoundary`. See [Errors](README.md#errors).
- **Suspense**: `useSuspenseInfiniteQuery` is new. `useSuspenseQuery` and
  `useSuspenseInfiniteQuery` accept query maps and map entries, stop suspending as soon as
  data is set (for example by an endpoint streaming with `setData`), and keeps query map entries
  for at least one second so they aren't evicted before the component mounts.
- **Server rendering** works with query maps: pass a map to `prefetchQuery`, and hydration creates
  the matching entry on the client.

## Packaging

The package is built with tsdown into one ESM (`.js`) and CommonJS (`.cjs`) file per module, so
`'use client'` directives are preserved for React Server Components. Imports from `mst-query` don't
change.
