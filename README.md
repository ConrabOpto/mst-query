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

-   [Basic](https://codesandbox.io/s/mst-query-basic-example-v63qu?file=/src/index.tsx)
-   [Table Filters](https://codesandbox.io/s/mst-query-table-filters-wdforg?file=/src/index.tsx)

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

## Paginated and infinite lists

```tsx
import { types } from 'mobx-state-tree';
import { createQuery, RequestModel } from 'mst-query';
import { MessageModel } from './models';

const MessagesQuery = createQuery('MessagesQuery', {
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
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageListQuery } from './MessageListQuery';

const MesssageListView = observer((props) => {
    const [offset, setOffset] = useState(0);
    const { data, isFetchingMore, query } = useQuery(messageStore.messagesQuery, {
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
                        optimisticResponse: {
                            id: 'temp' + Math.random(),
                            message,
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
