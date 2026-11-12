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
        isLoading,
        isFetched,
        isRefetching,
        isFetchingMore,
        query,
        refetch,
        cachedAt,
    } = useQuery(rootStore.messageStore.messageQuery, {
        data: snapshot,
        request: { id },
        enabled: !!id,
        onError(data, self) {},
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
if the entities it references survive. Placeholder data uses the normal model conversion and is
available through both `data` and `query.data`, so other consumers of the same query also see it.
It does not mark the query as fetched or populate the response cache. Existing data is kept during a refetch, and cached
data takes precedence. The response replaces the placeholder; a failed request clears it. Queries
with `enabled: false` do not apply placeholders.

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
import { createInfiniteQuery, RequestModel } from 'mst-query';
import { MessageModel } from './models';

const MessagesQuery = createInfiniteQuery('MessagesQuery', {
    data: types.model({ items: types.array(types.reference(MessageModel)) }),
    pagination: types.model({ offset: types.number, limit: types.number }),
    endpoint({ request }) {
        return fetch(`messages?offset=${request.offset}&limit=${request.limit}`).then((res) =>
            res.json()
        );
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

Parallel `queryMore` calls can finish out of order and each calls `onQueryMore` while the
request remains the same. Changing the request (for example, its filter) discards pending
pages from the previous request before they update models or call `onQueryMore`, even if
the request later changes back. An obsolete page's promise still returns its raw `result`
with `data: null`, or its original `error`, without updating the current query state.

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
    const [addMessage, { isLoading }] = useMutation(messageStore.addMessageMutation);
    return (
        <div>
            <textarea value={message} onChange={(ev) => setMessage(ev.target.value)} />
            <button
                type="button"
                disabled={!message.length || isLoading}
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
- `useSuspenseQuery` suspends until the query has data, and throws errors to the nearest error boundary. It fetches by itself when nothing was prefetched. To avoid refetching right after suspending, `staleTime` is at least 1000 ms. It doesn't support `useVolatileQuery`.
- Infinite queries only dehydrate their first page.

## Model generator (GraphQL)

Generate mobx-state-tree models from your graphql schema.

```ts
npx mst-query-generator schema.graphql
```

## Cache

The option `staleTime` controls how much time should pass before a cached value needs to be refetched from the server.

### Garbage collection

```tsx
rootStore.runGc();
```

### Globally interacting with queries

```tsx
const queriesWithId = rootStore.getQueries(MessageQuery, (q) => q.request.id === 'message-id');
queriesWithId.forEach((q) => q.refetch());

const allMessageMutations = rootStore.getQueries(UpdateMessageMutation);
allMessageMutations.forEach((m) => m.abort());
```
