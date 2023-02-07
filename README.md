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

# Basic Usage

First, create a query and a store...

```tsx
const MessageQuery = createQuery('MessageQuery', {
    data: MstQueryRef(MessageModel),
    request: types.model({ id: types.string }),
    endpoint({ request }) {
        return fetch(`messages/${request.id}`).then((res) => res.json());
    },
});

const MessageStore = createModelStore('MessageStore', MessageModel)
    .props({
        messageQuery: types.optional(MessageQuery, {}),
    })
    .actions((self) => ({
        getMessage: flow(function* (id: string) {
            const next = yield* self.postsQuery.query({ request: { id } });
            next();
        }),
    }));
```

...then use the query in a React component!

```tsx
const MesssageView = observer((props) => {
    const { id, messageStore } = props;
    const { data, error, isLoading } = useQuery(
        messageStore.messageQuery,
        messageStore.getMessage,
        {
            request: { id },
        }
    );
    if (error) {
        return <div>An error occured...</div>;
    }
    if (isLoading) {
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

const RootStore = createRootStore({
    messageStore: types.optional(MessageStore, {}),
});

const queryClient = new QueryClient({ RootStore });
const { QueryClientProvider } = createContext(queryClient);

function App() {
    return (
        <QueryClientProvider>
            <Messages />
        </QueryClientProvider>
    );
}
```

## Models

In general, models can be created as usual. The main difference is how we handle references.
                                                                                                                
### `MstQueryRef`

A custom reference that replaces `types.reference`.

```ts
import { types } from 'mobx-state-tree';

const UserModel = types.model({
    id: types.identifier, // a normal identifier
    name: types.string.
    age: types.number
});

const MessageModel = types.model({
    message: types.string,
    createdBy: MstQueryRef(UserModel)
});
```

Since data is garbage collected in mst-query, `MstQueryRef` doesn't throw if it cannot find a suitable model in the internal cache. Instead, it simply returns the id as a string, allowing us to fetch data for this model again.

## Queries

### `createQuery`

```tsx
import { types } from 'mobx-state-tree';
import { createQuery, RequestModel } from 'mst-query';
import { MessageModel } from './models';
import { getItems } from './api';

const MessageListQuery = createQuery('MessageListQuery', {
    data: types.model({ items: types.array(MstQueryRef(MessageModel)) }),
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
    } = useQuery(store.messageQuery, store.getMessages, {
        data: snapshot,
        request: { id },
        enabled: !!id,
        onFetched(data, self) {},
        onSuccess(data, self) {},
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

## Paginated and infinite lists

### `queryMore`

```tsx
import { types } from 'mobx-state-tree';
import { createQuery, RequestModel } from 'mst-query';
import { MessageModel } from './models';

const MessagesQuery = createQuery('MessagesQuery', {
    data: types.model({ items: types.array(MstQueryRef(MessageModel)) }),
    request: types.model({ filter: '' }),
    pagination: types.model({ offset: types.number, limit: types.number }),
});

const MessageStore = createModelStore('MessageStore', MessageModel)
    .props({
        messagesQuery: types.optional(MessagesQuery, {}),
    })
    .actions((self) => ({
        getMessages: flow(function* (request, pagination) {
            const next = yield* self.messagesQuery.query({
                endpoint: api.getMessages,
                request,
                pagination

            });
            next();
        }),
        getMoreMessages: flow(function* (request, pagination) {
            const next = yield * self.messagesQuery.queryMore({
                request,
                pagination
            });
            const { data } = next();
            self.messagesQuery.data?.items.push(...data?.);
        })
    }));
```

The difference between `query` and `queryMore` is that the latter does not automatically merge it's result to the underlying query. This allows you to easily control how the data is appended to your list. It also means mst-query supports many different forms of pagination (offset-based, cursor-based, page-number-based) out of the box.

```tsx
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageListQuery } from './MessageListQuery';

const MesssageListView = observer((props) => {
    const [offset, setOffset] = useState(0);
    const { data, isFetchingMore, query } = useQueryMore(
        messageStore.messagesQuery,
        messageStore.getMessages,
        messageStore.getMoreMessages,
        {
            request: { filter: '' },
            pagination: { offset, limit: 20 },
        }
    );
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

## Mutations

### `createMutation`

```tsx
import { types } from 'mobx-state-tree';
import { createMutation } from 'mst-query';

const AddMessageMutation = createMutation('AddMessage', {
    data: MstQueryRef(MessageModel),
    request: types.model({ message: types.string }),
});

const MessageStore = createModelStore('MessageStore', MessageModel)
    .props({
        messagesQuery: types.optional(MessagesQuery, {}),
        addMessageMutation: types.optional(AddMessageMutation, {}),
    })
    .actions((self) => ({
        addMessage: flow(function* ({ message }) {
            const next = yield* self.addMessageMutation.mutate({
                endpoint: api.addMessage,
                request: { message },
            });
            const { data } = next();

            self.messagesQuery.data?.addItem(data);
        }),
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
    const [addMessage, { isLoading }] = useMutation(
        messageStore.addMessageMutation,
        messageStore.addMessage
    );
    return (
        <div>
            <textarea value={message} onChange={(ev) => setMessage(ev.target.value)} />
            <button
                type="button"
                disabled={!message.length || isLoading}
                onClick={() => addMessage()}>
                Send
            </button>
        </div>
    );
});
```

## Optimistic updates

```tsx
import { types } from 'mobx-state-tree';
import { createMutation, RequestModel } from 'mst-query';

const MessageStore = createModelStore('MessageStore', MessageModel)
    .props({
        messagesQuery: types.optional(MessagesQuery, {}),
        addMessageMutation: types.optional(AddMessageMutation, {}),
    })
    .actions((self) => ({
        addMessage: flow(function* ({ message }) {
            const next = yield* self.addMessageMutation.mutate({
                request: { message },
                optimisticUpdate: () => {
                    const optimistic = self.merge({
                        id: 'optimistic',
                        message,
                    });
                    self.listQuery.data?.addItem(optimistic);
                },
            });
            const { data } = next();

            self.listQuery.data?.addItem(data);
        }),
    }));
```

## Cache

Queries are cached by instance and request arguments. The option `staleTime` controls how much time should pass before a cached value needs to be refetched from the server.

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
