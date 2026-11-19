Query library for mobx-state-tree

<a href="https://github.com/ConrabOpto/mst-query/actions/workflows/unit-tests.yml">
<img src="https://github.com/ConrabOpto/mst-query/actions/workflows/unit-tests.yml/badge.svg" />
</a><a href="https://bundlephobia.com/package/mst-query" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/mst-query@latest" />
</a>

# Features

-   Automatic Normalization
-   Garbage Collection
-   Infinite Scroll + Pagination Queries
-   Optimistic Mutations
-   Request Argument Type Validation
-   Opt-in Request-keyed Query Maps
-   Abort Requests
-   Generate Models From Graphql Schema

# Examples

-   [Basic](https://codesandbox.io/p/devbox/mst-query-basic-example-nk49ds?file=%2Fsrc%2Findex.tsx)
-   [Table Filters](https://codesandbox.io/p/devbox/mst-query-table-filters-example-2j3h3v?file=%2Fsrc%2Findex.tsx%3A18%2C26)

# Basic Usage

First, create a query...

```ts
import { createQuery, createModelStore } from 'mst-query';

const MessageQuery = createQuery('MessageQuery', {
    data: types.reference(MessageModel),
    request: types.model({ id: types.string }),
    endpoint({ request }) {
        return fetch(`messages/${request.id}`).then((res) => res.json());
    },
});
```

...then use the query in a React component!

```tsx
const MesssageView = observer((props) => {
    const { id, messageStore } = props;
    const { data, error, isLoading } = useQuery(messageStore.messageQuery, {
        request: { id },
    });
    if (error) {
        return <div>An error occured...</div>;
    }
    if (!data) {
        return <div>Loading...</div>;
    }
    return <div>{data.message}</div>;
});
```

# Documentation

The API follows [TanStack Query](https://tanstack.com/query) (React Query) where it fits mobx-state-tree.
Upgrading from version 4? See the [migration notes](MIGRATION.md).

## Installation

```
npm install --save mst-query mobx-state-tree
```

## Configuration

```tsx
import { createModelStore, createRootStore, QueryClient, createContext } from 'mst-query';

const MessageQuery = createQuery('MessageQuery', {
    data: types.reference(MessageModel),
    request: types.model({ id: types.string }),
    endpoint({ request }) {
        return fetch(`messages/${request.id}`).then((res) => res.json());
    },
});

const MessageStore = createModelStore('MessageStore', MessageModel).props({
    messageQuery: types.optional(MessageQuery, {}),
});

const RootStore = createRootStore({
    messageStore: types.optional(MessageStore, {}),
});

const queryClient = new QueryClient({ RootStore });
const { QueryClientProvider, useRootStore } = createContext(queryClient);

function App() {
    return (
        <QueryClientProvider>
            <Messages />
        </QueryClientProvider>
    );
}
```

When rendering on the server, avoid sharing a single client between requests. Pass a client per request with the `client` prop instead:

```tsx
let browserQueryClient: QueryClient<typeof RootStore> | undefined;

function getQueryClient() {
    if (typeof window === 'undefined') {
        return new QueryClient({ RootStore });
    }
    return (browserQueryClient ??= new QueryClient({ RootStore }));
}

function App() {
    const [queryClient] = useState(getQueryClient);
    return (
        <QueryClientProvider client={queryClient}>
            <Messages />
        </QueryClientProvider>
    );
}
```

## Queries

### `createQuery`

```tsx
import { types } from 'mobx-state-tree';
import { createQuery } from 'mst-query';
import { MessageModel } from './models';
import { getItems } from './api';

const MessageListQuery = createQuery('MessageListQuery', {
    data: types.array(types.reference(MessageModel)),
    request: types.model({ filter: '' }),
    endpoint({ request }) {
        return fetch(`messages?filter=${request.filter}`).then((res) => res.json());
    },
});
```

### `useQuery`

```tsx
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageQuery } from './MessageQuery';

const MesssageView = observer((props) => {
    const { id, snapshot, result } = props;
    const rootStore = useRootStore();
    const {
        data,
        error,
        status,
        isPending,
        isLoading,
        isFetching,
        isRefetching,
        isFetched,
        query,
        refetch,
        dataUpdatedAt,
    } = useQuery(rootStore.messageStore.messageQuery, {
        initialData: snapshot,
        request: { id },
        enabled: !!id,
        staleTime: 0,
    });
    if (error) {
        return <div>An error occured...</div>;
    }
    if (isLoading) {
        return <div>Loading...</div>;
    }
    return <div>{data.message}</div>;
});
```

Mount only one `useQuery` or `useInfiniteQuery` hook per query instance. A second hook throws,
even when the requests match, `request` is omitted, or `enabled` is false. The hook coordinates
the query's fetching and updates; other `observer` components can read `query.data`,
`query.isFetching`, and `query.error` directly through MobX reactivity. Use separate query
instances when components need independent control. After the hook unmounts, another hook
can take over the same instance.

`createQuery` and `createInfiniteQuery` remain singleton model factories: direct `query.data`,
`query.error`, loading flags, mutable requests, and requestless `query.refetch()` are preserved.
Their snapshots remain `{ data, variables }`. Use `createQueryMap` or `createInfiniteQueryMap`
when multiple hooks need to coordinate requests through the same store property.

### Status

Hook results and query nodes have these status fields:

| Field | Meaning |
| --- | --- |
| `status` | `'pending'` until there is data or an error, then `'success'` or `'error'` |
| `isPending` | `status === 'pending'` |
| `isSuccess` / `isError` | `status === 'success'` / `status === 'error'` |
| `isFetching` | a request is running, including background refetches and `queryMore` |
| `fetchStatus` | `'fetching'`, `'paused'` or `'idle'` |
| `isPaused` | a retry is waiting for the tab to become visible, see [Retries](#retries) |
| `isLoading` | the first request is running: `isPending && isFetching` |
| `isRefetching` | a request is running for a query that has data or an error, not counting `queryMore` |
| `failureCount` / `failureReason` | failed attempts of the current request, see [Retries](#retries) |

Use `isLoading` (or `isPending`) for a first-load spinner, and `isFetching` for a background
indicator. Infinite queries also have `isFetchingMore`.

Mutations have `status` (`'idle'`, `'pending'`, `'success'` or `'error'`), `isIdle`,
`isPending`, `isPaused`, `isSuccess`, `isError`, `failureCount` and `failureReason`.

### Retries

A failed query is retried 3 times in the browser before its `error` is set,
waiting 1, 2 and 4 seconds (doubling up to 30 seconds). Queries don't retry on the server, and
mutations don't retry by default. While retrying, the query keeps fetching and `failureCount` and
`failureReason` describe the failed attempts.

```tsx
useQuery(messageStore.messageQuery, {
    request: { id },
    retry: 1, // false, a number, or (failureCount, error) => boolean
    retryDelay: 500, // or (failureCount, error) => milliseconds
});

const queryClient = new QueryClient({
    RootStore,
    queryOptions: { retry: (failureCount, error) => error.status !== 404 && failureCount < 2 },
    mutationOptions: { retry: 1 },
});
```

`retry` and `retryDelay` can also be passed to `useMutation` and `mutate`. Aborting a query, or
starting a newer request for it, stops its retries.

Retries don't run while the tab is hidden. A retry that comes due then waits until the tab is
visible again; meanwhile `isPaused` is true, `fetchStatus` is `'paused'`, and `isFetching` and
`isLoading` are false. Mutations have `isPaused` too.

### Errors

A failed fetch keeps the data from the last successful fetch of the same
request, so a failed background refetch doesn't remove what's on screen. `error` is set either
way, and two flags tell the cases apart:

- `isLoadingError`: the query failed and has no data to show.
- `isRefetchError`: the query failed but still has data from an earlier fetch.

Data from a previous request and placeholder data are cleared when a request fails. Mutations
clear their data on error.

Hooks return errors instead of throwing them. Set `throwOnError` to throw them to the nearest
error boundary instead:

```tsx
useQuery(messageStore.messageQuery, { request: { id }, throwOnError: true });

// Only throw when there's nothing to show
useQuery(messageStore.messageQuery, {
    request: { id },
    throwOnError: (error, query) => query.data == null,
});
```

Set it for all queries with `new QueryClient({ RootStore, queryOptions: { throwOnError } })`.
Errors aren't thrown while the query is fetching again.

A failed query without data is retried when its hook mounts again. A hook that throws its error
never mounts, so to retry after the error boundary resets, wrap it in a `QueryErrorResetBoundary`:

```tsx
import { QueryErrorResetBoundary } from 'mst-query';
import { ErrorBoundary } from 'react-error-boundary';

<QueryErrorResetBoundary>
    {({ reset }) => (
        <ErrorBoundary
            onReset={reset}
            fallbackRender={({ resetErrorBoundary }) => (
                <button onClick={resetErrorBoundary}>Try again</button>
            )}>
            <Messages />
        </ErrorBoundary>
    )}
</QueryErrorResetBoundary>;
```

`useQueryErrorResetBoundary()` returns the `reset` function of the closest boundary, or of a
global one when there is no boundary.

Use `placeholderData` to keep previous data visible while a changed request is loading:

```tsx
const { data, isLoading } = useQuery(messageStore.messageQuery, {
    request: { id },
    placeholderData: (previousData) => previousData,
});
```

You can also pass custom data directly (`placeholderData: message`) or return it from a callback
(`placeholderData: (previousData) => previousData ?? message`). The callback receives `null` when
there is no current or live previous data. When switching query instances, a previous MST data node
is only reused while it is alive; destroying its query or service may destroy a data wrapper even
if the entities it references survive. For singleton queries, placeholder data uses the normal model conversion and is
available through both `data` and `query.data`, so other consumers of the same query also see it.
It does not mark the query as fetched or populate the response cache. Existing data is kept during a refetch, and cached
data takes precedence. The response replaces the placeholder; a failed request clears it. Queries
with `enabled: false` do not apply placeholders.

For query maps, placeholders belong to each hook and do not overwrite entry data or another
hook's placeholder. Existing MST values are preserved, and reference identifiers resolve
against the root store; snapshot placeholders are display values and do not create entities.

Use `refetchOnWindowFocus` to refresh a query when the user returns to the tab:

```tsx
useQuery(messageStore.messageQuery, {
    request: { id },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
});
```

The default is `true`: returning to a visible tab refetches stale data. Set it to `false`
to disable this behavior, or `'always'` to refetch even fresh data, including with
`staleTime: Infinity`. A callback receives the current MST query node and returns `true`,
`false`, or `'always'`; it is evaluated on each focus event using the latest query state.
Browser focus detection uses `visibilitychange` when the document becomes visible.
Disabled, unmounted, and already-loading queries do not start a focus refetch.

Set the default for all queries through the client configuration:

```tsx
const queryClient = new QueryClient({
    RootStore,
    queryOptions: { refetchOnWindowFocus: false },
});
```

Per-hook settings override the client default. This option works with `useQuery`,
`useInfiniteQuery`, and `useVolatileQuery`. Focus refetches use the current request,
pagination, and latest hook meta; infinite queries use their normal refetch behavior.

Use `refetchInterval` to poll a regular query, independently of `staleTime`:

```tsx
useQuery(messageStore.messageQuery, {
    request: { id },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
});
```

The interval is in milliseconds. Pass `false` to disable polling, or a callback
`(query) => number | false | undefined` to choose an interval using the MST query model's
current data or error. Returning `false` or `undefined` stops polling; zero, negative,
and non-finite intervals also disable it. Polling waits for pending requests to finish
and stops when `enabled` is false or the component unmounts. Hidden tabs skip interval
fetches unless `refetchIntervalInBackground` is true (the default is false).
These options also work with `useVolatileQuery`; infinite queries do not support polling.

## Paginated and infinite lists

```tsx
import { types } from 'mobx-state-tree';
import { createInfiniteQuery } from 'mst-query';
import { MessageModel } from './models';

const MessagesQuery = createInfiniteQuery('MessagesQuery', {
    data: types.model({ items: types.array(types.reference(MessageModel)) }),
    pagination: types.model({ offset: types.number, limit: types.number }),
    endpoint({ pagination }) {
        return fetch(`messages?offset=${pagination.offset}&limit=${pagination.limit}`).then((res) =>
            res.json()
        );
    },
    onQueryMore({ query, data }) {
        query.data?.items.push(...data.items);
    },
});

const MessageStore = createModelStore('MessageStore', MessageModel).props({
    messagesQuery: types.optional(MessagesQuery, {}),
});
```

```tsx
import { useInfiniteQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageListQuery } from './MessageListQuery';

const MesssageListView = observer((props) => {
    const [offset, setOffset] = useState(0);
    const { data, isFetchingMore, query } = useInfiniteQuery(messageStore.messagesQuery, {
        request: { filter: '' },
        pagination: { offset, limit: 20 },
    });
    if (isFetchingMore) {
        return <div>Is fetching more results...</div>;
    }
    return (
        <div>
            {data.items.map((item) => (
                <Message />
            ))}
            <button onClick={() => setOffset(data.items.length)}>Get more messages</button>
        </div>
    );
});
```

Instead of changing `pagination`, you can keep it at its initial value (or omit it) and call the
`queryMore` function returned by the hook:

```tsx
const { data, queryMore } = useInfiniteQuery(messageStore.messagesQuery, {
    request: { filter: '' },
    pagination: { offset: 0, limit: 20 },
});

<button onClick={() => queryMore({ pagination: { offset: data.items.length, limit: 20 } })}>
    Get more messages
</button>;
```

Use one or the other for a request: once the `pagination` option has loaded a page, `queryMore`
rejects, and changing `pagination` after `queryMore` has loaded a page throws. Changing the request
or unmounting the hook starts over.

A refetch of an infinite query fetches a single page and replaces the data with it, so loaded
pages aren't fetched again. Refetches on mount use the hook's `pagination` option, which starts the
list over from the first page when the data is stale. Other refetches, such as on window focus,
use the current pagination. Set `refetchOnMount: 'never'` or `refetchOnWindowFocus: false` to keep
the loaded pages instead.

Parallel `queryMore` calls can finish out of order and each calls `onQueryMore` while the
request remains the same. Changing the request (for example, its filter) discards pending
pages from the previous request before they update models or call `onQueryMore`, even if
the request later changes back. An obsolete page's promise still returns its raw `result`
with `data: null`, or its original `error`, without updating the current query state.

## Query maps

`createQueryMap` opts into request-keyed entries while keeping the same `useQuery` hook:

```tsx
const MessageQueryMap = createQueryMap('MessageQueryMap', {
    data: types.reference(MessageModel),
    request: types.model({ id: types.string }),
    endpoint: ({ request }) => fetch(`messages/${request.id}`).then((res) => res.json()),
});

const Service = types.model({ messages: types.optional(MessageQueryMap, {}) });

// These can be in separate components. Matching requests share an entry and fetch.
const first = useQuery(service.messages, { request: { id: 'a' } });
const second = useQuery(service.messages, { request: { id: 'a' } });
const third = useQuery(service.messages, { request: { id: 'b' } });
```

Each collection instance owns an `entries` map. Each entry owns its data, error, variables,
loading state, and fetch lifecycle. Changing one hook's request selects another entry without
changing other observers' requests. Equivalent concurrent fetches share a promise and apply
the response once. Disabled hooks can still read results fetched by enabled observers;
unmounting one observer does not abort another observer's request.

Keys use normalized request snapshots. Object property order and object identity do not matter;
declared defaults apply, references use identifiers, and array order matters. Values must be
serializable, with defined array slots. Defaults used in identity must be deterministic; supply
generated identifiers and timestamps explicitly. An optional `requestKey: (request) => key`
on the definition customizes identity. Include every response-affecting value in the request
or a `scope`; `meta` is execution context and does not participate in identity.

The returned `query` is the selected entry and can be undefined before the first committed
effect creates it. Render with the returned `data` and loading flags, or guard `query?.data`.
Abandoned React renders never create entries or start requests. `initialData` seeds each entry
once; existing data takes precedence. Placeholder data is observer-local, and previous entries
remain alive while a hook displays their data as a placeholder.

### Imperative map operations

Collection methods select entries internally and return `{ data, error, result, query }`:

```ts
.actions((self) => ({
    selectMessage: flow(function* (id: string) {
        self.selectedMessageId = id;
        const { data, error } = yield self.messages.refetch({ request: { id } });
        if (error) throw error;
        self.selectedMessageText = data.message;
        return data;
    }),
}))
```

Both `map.query({ request })` and `map.refetch({ request })` explicitly fetch, even when hooks
are disabled. Requestless map calls select the default entry; they never infer a previous
request. `map.invalidate({ request })` marks one existing entry stale and refreshes it when
an enabled observer is attached. `map.invalidate()` targets all entries. Invalidation during
an in-flight fetch schedules one fresh fetch afterwards. Use `refetch` when an action needs
the result, without invalidating first.

`map.get(request, scope?)` reads an existing entry without extending its lifetime.
`map.getOrCreate({ request, scope? })` selects/creates an entry from an action.
`map.setData(data, { request, scope? })` updates one entry. Selected entries expose
`entry.refetch()`, `entry.invalidate()`, `entry.setData(data)`, and `entry.abort()`.
An entry's request is fixed; select another entry through the map to change it.

### Infinite query maps

`createInfiniteQueryMap` is the shared counterpart to the singleton `createInfiniteQuery`:

```tsx
const Messages = createInfiniteQueryMap('Messages', {
    data: types.model({ items: types.array(types.reference(MessageModel)) }),
    request: types.model({ filter: '', limit: 20 }),
    pagination: types.model({ offset: 0 }),
    endpoint: ({ request, pagination }) => fetch(
        `messages?filter=${request.filter}&limit=${request.limit}&offset=${pagination.offset}`,
    ).then((res) => res.json()),
    onQueryMore({ query, data }) {
        query.data?.items.push(...data.items);
    },
});

const { data, queryMore } = useInfiniteQuery(service.messages, {
    request: { filter, limit: 20 },
    pagination: { offset: 0 },
    scope: 'main-list',
});

// Advance explicitly. Hook pagination props initialize a map entry only once.
await queryMore({ pagination: { offset: data?.items.length ?? 0 } });
```

The cursor/offset is entry state rather than identity, and observers share accumulated pages.
Include page size, filters, sorting, and different starting windows in the request when they
distinguish results, or use `scope` for independent lists with the same request. For ordinary
paginated views that replace one page, put the page number in a regular query map's request.

Equivalent concurrent page calls share one fetch and one `onQueryMore` call. Distinct pages
may finish in parallel and merge as they arrive. Refetches wait for pages; pages wait for a
pending refetch. Refetch retains the library's existing behavior of fetching the current
pagination and replacing entry data, rather than replaying the complete page history.
Switching requests leaves earlier pages attached to their original entry. Normalized entities
remain shared reactively across results.

### Map retention and optional migration

Map `cacheTime` defaults to five minutes in browsers and `Infinity` on the server. Configure it
through `QueryClient({ queryOptions: { cacheTime } })`, the map definition, or an individual
hook/call. The longest duration applies when observers specify different values. Retention
begins after the last hook unmounts, placeholder releases its data, or imperative request
finishes. Mounted hooks and unfinished requests prevent expiry; remounting cancels the timer.
Use `Infinity` to retain entries until reset/destruction or `0` for next-turn expiry.
The legacy singleton response-cache default remains zero.

Existing singleton code needs no migration. To opt in, replace `createQuery` with
`createQueryMap`, or `createInfiniteQuery` with `createInfiniteQueryMap`. Model declarations
such as `types.optional(Query, {})` and hook calls can stay. Replace direct collection
data/loading/error reads with hook results or `map.get(request)`. Supply requests to map
fetches, and replace pagination-prop changes with explicit `queryMore` calls. Singleton
`refetchOnChanged` remains supported; maps always select by identity and ignore it.

Only opted-in models change snapshots to `{ entries: { ... } }`; migrate their saved snapshots
before restoring them. Singleton and mutation snapshots remain unchanged. Map extensions
apply to the collection, and `EntryOf<Instance<typeof MessageQueryMap>>` names its entry type.

## Mutations

### `createMutation`

```tsx
import { types } from 'mobx-state-tree';
import { createMutation } from 'mst-query';

const AddMessageMutation = createMutation('AddMessage', {
    data: types.reference(MessageModel),
    request: types.model({ message: types.string }),
});

const MessageStore = createModelStore('MessageStore', MessageModel)
    .props({
        messagesQuery: types.optional(MessagesQuery, {}),
        addMessageMutation: types.optional(AddMessageMutation, {}),
    })
    .actions((self) => ({
        afterCreate() {
            onMutate(self.addMessageMutation, (data) => {
                self.messagesQuery.data?.items.push(data);
            });
        },
    }));
```

### `useMutation`

```tsx
import { useMutation } from 'mst-query';
import { observer } from 'mobx-react';
import { AddMessageMutation } from './AddMessageMutation';

const AddMessage = observer((props) => {
    const { messageStore } = props;
    const [message, setMessage] = useState('');
    const [addMessage, { isPending }] = useMutation(messageStore.addMessageMutation);
    return (
        <div>
            <textarea value={message} onChange={(ev) => setMessage(ev.target.value)} />
            <button
                type="button"
                disabled={!message.length || isPending}
                onClick={() => {
                    addMessage({
                        request: { message },
                        optimisticUpdate() {
                            return {
                                id: 'temp' + Math.random(),
                                message,
                            };
                        },
                    });
                    setMessage('');
                }}>
                Send
            </button>
        </div>
    );
});
```

### Global mutation indicator

Each mutation's `isPending` stays true until all of its calls finish, including overlapping
calls and scoped calls waiting in a queue. `queryClient.isMutating` derives a reactive boolean
from those loading states across the client's registered mutations. It also covers imperative
`mutation.mutate()` calls; ordinary queries do not affect it. Completed, failed, and aborted
calls clear their pending state. Destroyed mutation nodes and client resets also clear loading.

```tsx
const GlobalLoadingIndicator = observer(() => (
    queryClient.isMutating ? <span>Saving...</span> : null
));
```

You can also obtain the client through `useQueryClient`, returned by `createContext`.

## Server components and streaming

Prefetch queries in a server component and pass them to client components with `HydrationBoundary`.
Create a new `QueryClient` per request on the server, for example with React's `cache`:

```tsx
// get-server-query-client.ts
import { cache } from 'react';
import { QueryClient } from 'mst-query';

export const getServerQueryClient = cache(() => new QueryClient({ RootStore }).init());
```

```tsx
// page.tsx (server component)
import { Suspense } from 'react';
import { HydrationBoundary } from 'mst-query';

export default function Page({ params }) {
    const queryClient = getServerQueryClient();
    const { messageStore } = queryClient.rootStore;

    // Not awaited: the response streams to the client when it resolves
    queryClient.prefetchQuery(messageStore.messageQuery, { request: { id: params.id } });

    return (
        <HydrationBoundary state={queryClient.dehydrate()}>
            <Suspense fallback={<div>Loading...</div>}>
                <Message id={params.id} />
            </Suspense>
        </HydrationBoundary>
    );
}
```

```tsx
// Message.tsx
'use client';
import { observer } from 'mobx-react';
import { useSuspenseQuery } from 'mst-query';

export const Message = observer(({ id }) => {
    const { messageStore } = useRootStore();
    const { data } = useSuspenseQuery(messageStore.messageQuery, { request: { id } });
    return <div>{data.message}</div>;
});
```

- `prefetchQuery` never rejects. Await it to block rendering until the data is available, or leave it pending to stream it.
- `dehydrate` includes queries started with `prefetchQuery` that live in the root store. Resolved queries are sent as raw endpoint results, pending ones as promises, and failed ones are left out so the client can retry them. The client normalizes results the same way as its own responses, so endpoint results must be serializable by React.
- `HydrationBoundary` matches queries by their path in the root store, so the server and client must use the same `RootStore`. Data is only applied when it is newer than what the client already has.
- `useSuspenseQuery` suspends until the query has data, including data set with `setData` while the request is in flight. It throws errors to the nearest error boundary when there is no data to show; after a failed background refetch it keeps rendering the data and returns the `error`. It fetches by itself when nothing was prefetched. To avoid refetching or evicting a query map entry right after suspending, `staleTime` and the map's `cacheTime` are at least 1000 ms. A failed query is only retried on remount after its `QueryErrorResetBoundary` is reset (see [Errors](#errors)), or after you call `refetch`. It doesn't support `useVolatileQuery`.
- `useSuspenseInfiniteQuery` is the suspense counterpart of `useInfiniteQuery`, with the same rules. It only suspends for the first page; loading more pages updates `isFetchingMore`, and a failed page keeps the loaded pages on screen and returns the `error`.
- Query maps work the same way: pass the map to `prefetchQuery` with a `request` (and optional `scope`), and to `useQuery`/`useSuspenseQuery`/`useSuspenseInfiniteQuery` on the client. Hydration creates the matching entry if the client doesn't have it yet.
- Infinite queries only dehydrate their first page.

### Multiple query clients

An app can have several clients, each with its own React context. `createContext` returns a `HydrationBoundary` and `useVolatileQuery` bound to that context. Export them from a `'use client'` module so server components can render the boundary:

```tsx
// admin-query.tsx
'use client';
import { createContext as createReactContext } from 'react';
import { QueryClient, createContext } from 'mst-query';

const AdminQueryContext = createReactContext<QueryClient<any> | undefined>(undefined);

export const {
    QueryClientProvider: AdminQueryClientProvider,
    HydrationBoundary: AdminHydrationBoundary,
    useRootStore: useAdminRootStore,
    useVolatileQuery: useAdminVolatileQuery,
} = createContext(new QueryClient({ RootStore: AdminRootStore }), { context: AdminQueryContext });
```

```tsx
// server component
<AdminHydrationBoundary state={adminQueryClient.dehydrate()}>...</AdminHydrationBoundary>
```

The exported `HydrationBoundary` and `useVolatileQuery` always use the default context. Other hooks use the client that owns the query, so they work under any provider.

## Model generator (GraphQL)

Generate mobx-state-tree models from your graphql schema.

```ts
npx mst-query-generator schema.graphql
```

## Cache

The option `staleTime` controls how much time should pass before a cached value needs to be refetched from the server.

Showing a component again with React's `<Activity>` counts as a mount: `staleTime` and `refetchOnMount` apply as they would on a remount. While hidden, its hooks are unsubscribed, so `invalidate()` only marks their queries as stale, and `useMutation`'s `onMutate` doesn't run.

### Garbage collection

GC is private and automatic. Root-store changes, query destruction, and response-cache expiry
schedule a collection batch. The default `gcInterval` is five minutes in the browser and
`Infinity` on the server. Configure it on the query client:

```tsx
const queryClient = new QueryClient({
    RootStore,
    gcInterval: 5 * 60_000,
});
```

Changes share one pending timer without postponing its deadline. There is no periodic sweep
while idle, and GC's own changes do not schedule another batch. `gcInterval` limits how often
full entity sweeps run; it is separate from response `cacheTime`, rather than a per-entity
minimum retention time. An entity released shortly before a scheduled batch can be collected
in that batch. Use `Infinity` to disable automatic collection or `0` for next-turn collection.

GC retains entities reachable through declared MST properties under the root store, including
forms, services, and attached queries' data, request, and pagination state. Unexpired cached
responses are also roots, even after their owning queries are destroyed. References are
followed transitively through models, arrays, and maps, with node identity guarding cycles.
Model stores' `models` ownership maps do not pin every entry; custom store properties are scanned.

After a selecting query is destroyed, an attached form keeps its selected entity alive.
Clearing that reference or destroying the form makes the entity eligible for a later batch.
Unmounting a hook keeps data on its still-attached query protected. Keep state that needs
retention in declared MST properties under the root store: detached nodes, volatile fields,
views, and ordinary JavaScript references are outside GC's ownership contract.

For query maps, unused entries remain roots during their retention period. Expiry removes
the entry first; a later GC batch can collect entities its response no longer retains. Forms
and other declared root-store references continue to protect their selected entities.

Loading queries and mutations under the root postpone collection with inexpensive one-second
checks. Collection runs after the current action has completed. Resetting the client or
destroying its root cancels pending work and disposes the old response cache.

### Globally interacting with queries

```tsx
const queriesWithId = rootStore.getQueries(MessageQuery, (q) => q.variables.request?.id === 'message-id');
queriesWithId.forEach((q) => q.refetch());

const allMessageMutations = rootStore.getQueries(UpdateMessageMutation);
allMessageMutations.forEach((m) => m.abort());
```

Passing a query map definition to `getQueries` returns its entries. Singleton definitions
continue to return singleton nodes, and mutation definitions return mutation nodes.
