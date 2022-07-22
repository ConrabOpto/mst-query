Query library for mobx-state-tree

<a href="https://github.com/ConrabOpto/mst-query/actions/workflows/unit-tests.yml">
<img src="https://github.com/ConrabOpto/mst-query/actions/workflows/unit-tests.yml/badge.svg" />
</a><a href="https://bundlephobia.com/package/mst-query" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/mst-query@latest" />
</a>

# Features

-   Automatic Normalization
-   Automatic Garbage Collection
-   Use with any backend (REST, GraphQL, whatever!)
-   Infinite Scroll + Pagination Queries
-   Mutations + Change Tracking
-   Request Argument Type Validation
-   Abort Requests
-   Optimistic Mutations

# Examples

-   [Queries & cache](https://codesandbox.io/s/mst-query-basic-example-v63qu?file=/src/index.tsx)
-   [Use with mobx-state-tree (Bookshop)](https://codesandbox.io/s/mst-query-bookshop-0kljt?file=/src/index.js)

# Basic Usage

First, create some models and a query...

```tsx
import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef, RequestModel } from 'mst-query';

const UserModel = types.model('UserModel', {
    id: types.identifier,
    name: types.string,
    age: types.number,
});

const MessageModel = types.model('MessageModel', {
    id: types.identifier,
    message: types.string,
    created: types.Date,
    createdBy: MstQueryRef(UserModel),
});

const getItem = ({ request }) => {
    const { id } = request;
    return fetch('...').then((res) => res.json());
};

const MessageQuery = createQuery('MessageQuery', {
    data: MstQueryRef(MessageModel),
    request: RequestModel.props({ id: types.string }),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(getItem);
        const { data, result, error } = next();
    }),
}));
```

...then use the query in a React component!

```tsx
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageQuery } from './MessageQuery';

const MesssageView = observer((props) => {
    const { id } = props;
    const { data, error, isLoading } = useQuery(MessageQuery, {
        request: { id },
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

# Documentation

## Installation

```
npm install --save mst-query mobx-state-tree
```

## Configuration

```tsx
import { createModelStore, createRootStore, QueryClient, createContext } from 'mst-query';

// Creating a root store for holding your models is recommended (but optional)
const RootStore = createRootStore({
    messageStore: types.optional(createModelStore({ messages: types.map(MessageModel) }), {}),
    userStore: types.optional(createModelStore({ users: types.map(UserModel) }), {}),
});

const env = {};
const queryClient = new QueryClient({ RootStore });
const { QueryClientProvider, useQueryClient, getQueryClient, createOptimisticData } = createContext(
    queryClient
);

function App() {
    return (
        <QueryClientProvider client={queryClient} env={env}>
            ...
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

A query is just a mobx-state-tree model, but with special properties, called a `QueryModel`. Here's an example of a query that fetches a list of messages.

```tsx
import { types } from 'mobx-state-tree';
import { createQuery, RequestModel } from 'mst-query';
import { MessageModel } from './models';
import { getItems } from './api';

const MessageListQuery = createQuery('MessageListQuery', {
    data: types.model({ items: types.array(MstQueryRef(MessageModel)) }),
    request: RequestModel.props({ filter: types.optional(types.string, '') }),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(getItems);
        const { result, error, data } = next();
    }),
}));
```

The first argument to `createQuery` is the name of this query. The second is an option object that controls how this query recevies (data) and transmits (request) data. In `env`, you can put anything this query needs that does not fit in data or request.

There's also a special action, `run`. This action should always be a flow generator, and will automatically be called when a query is put into a `useQuery` hook.

### `useQuery`

```tsx
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageQuery } from './MessageQuery';

const MesssageView = observer((props) => {
    const { id, snapshot, result } = props;
    const {
        run,
        data,
        error,
        isLoading,
        isFetched,
        isRefetching,
        isFetchingMore,
        query,
        cachedAt,
    } = useQuery(MessageQuery, {
        data: snapshot,
        request: { id },
        env,
        onFetched(data, self) {},
        afterCreate(self) {},
        onRequestSnapshot(snapshot) {},
        key: id,
        staleTime: 0,
        cacheTime: 300,
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

The `key` argument is optional and works like putting a key prop on a React component. If this variable changes, the entire query will be re-created and run again.

Note that `data`, `request` and `env` are only set on creation.

The options `staleTime` and `cacheTime` controls how long we should use the cached value of this query.

### `useLazyQuery`

```tsx
import { useLazyQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageQuery } from './MessageQuery';

const MesssageView = observer((props) => {
    const { id, cachedData } = props;
    const { data, error, isLoading, query } = useLazyQuery(MessageQuery, {
        data: cachedData,
        request: { id },
    });

    useEffect(() => {
        query.run();
    }, []);

    if (error) {
        return <div>An error occured...</div>;
    }
    if (isLoading) {
        return <div>Loading...</div>;
    }
    return <div>{data.message}</div>;
});
```

A lazy version of `useQuery`. This hook is useful if you have cached data and manually want to decide when to run the query.

## Paginated and infinite lists

### `queryMore`

```tsx
import { types } from 'mobx-state-tree';
import { createQuery, RequestModel } from 'mst-query';
import { MessageModel } from './models';
import { getItems } from './api';

const MessageListQuery = createQuery('MessageListQuery', {
    data: types.model({ items: types.array(MstQueryRef(MessageModel)) }),
    request: RequestModel.props({
        filter: types.optional(types.string, ''),
    }),
    pagination: types.model({ offset: types.number, limit: types.number }),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.query(getItems);
        next();
    }),
    fetchMore(offset: number) {
        self.pagination.offset = offset;

        const next = yield * self.queryMore(getItems);
        const { data } = next();

        self.data.items.push(data.items);
    },
}));
```

The difference between `query` and `queryMore` is that the latter does not automatically merge it's result to the underlying query. This allows you to easily control how the data is appended to your list. It also means mst-query supports many different forms of pagination (offset-based, cursor-based, page-number-based) out of the box.

```tsx
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageListQuery } from './MessageListQuery';

const MesssageListView = observer((props) => {
    const { data, isFetchingMore, query } = useQuery(MessageListQuery, {
        pagination: { offset: 0, limit: 20 },
    });
    if (isFetchingMore) {
        return <div>Is fetching more results...</div>;
    }
    return (
        <div>
            {data.items.map((item) => (
                <Message />
            ))}
            <button onClick={() => query.fetchMore(data.items.length)}>Get more messages</button>
        </div>
    );
});
```

## Mutations

### `createMutation`

```tsx
import { types } from 'mobx-state-tree';
import { createMutation, RequestModel } from 'mst-query';
import { MessageModel } from './models';

import { addMessage } from './api';

const AddMessageMutation = createMutation('AddMessage', {
    data: MstQueryRef(MessageModel),
    request: RequestModel.props({ message: types.string, userId: types.number }),
})
    .views((self) => ({
        get canRun() {
            return !self.isLoading && self.request.message.length > 0;
        },
    }))
    .actions((self) => ({
        run: flow(function* () {
            const next = yield* self.mutate(addMessage);
            const { data } = next();

            // add new message to query
            const { queryStore } = getQueryClient(self);
            const messageList = queryStore.find(MessageListQuery);
            messageList?.addMessage(data);

            self.request.reset(); // restore request model to initial state
        }),
        setMessage(message: string) {
            self.request.message = message;
        },
    }));
```

### `useMutation`

```tsx
import { useMutation } from 'mst-query';
import { observer } from 'mobx-react';
import { AddMessageMutation } from './AddMessageMutation';

const AddMessage = observer((props) => {
    const [addMessage, { mutation } = useMutation(AddMessageMutation, {
        request: { message: '', userId: 1 },
    });
    return (
        <div>
            <textarea
                value={mutation.request.message}
                onChange={ev => mutation.setMessage(ev.target.value)} />
            <button
                type="button"
                disabled={!mutation.canRun}
                onClick={() => addMessage()}>Send</button>
        </div>
    );
});
```

## Optimistic updates

```tsx
import { types } from 'mobx-state-tree';
import { createMutation, RequestModel } from 'mst-query';
import { MessageListQueries } from './queries';
import { MessageModel } from './models';
import { addMessage } from './api';

const AddMessageMutation = createMutation('AddMessage', {
    data: MstQueryRef(MessageModel),
    request: RequestModel.props({ message: types.string, userId: types.number }),
}).actions((self) => ({
    run: flow(function* () {
        const { queryStore } = getQueryClient(self);
        const query = queryStore.find(MessageListQuery);
        const optimistic = createOptimisticData(ItemModel, itemData);
        query?.addItem(optimistic);

        const next = yield* self.mutate(addMessage);
        const { data } = next();

        query?.removeItem(optimistic);
        query?.addItem(data);
    }),
    setMessage(message: string) {
        self.request.message = message;
    },
}));
```

Optimistically updating the UI can be quite involved. You have to create a unique id, and make sure client data is replaced with server data as soon as possible - without the user noticing any changes.

In mst-query, we try to make this easier by providing a `createOptimisticData` helper. This function creates an temporary, unique id and merges the data so that it is ready to be added to the ui.

A difference from other query libraries is that you get imperative control of how this update happens. In the example above we simply replace the optimistic item with the server response, but you could of course do it differently if you wanted to.

However, note that mobx-state-tree does not currently support mutable identifers ([see this issue](https://github.com/mobxjs/mobx-state-tree/issues/887)). This is important becasue it means that trying to reuse the same instance won't work.

## Change tracking

### `hasChanges` & `commit`

```tsx
import { types } from 'mobx-state-tree';
import { createMutation, RequestModel } from 'mst-query';
import { MessageListQueries } from './queries';
import { MessageModel } from './models';
import { updateMessage } from './api';

const UpdateMessageMutation = createMutation('UpdateMessage', {
    data: MstQueryRef(MessageModel),
    request: RequestModel.props({ messageId: types.string, message: types.string }),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield* self.mutate(updateMessage);

        self.request.commit();
    }),
    setMessage(message: string) {
        self.request.message = message; // now `self.request.hasChanges` is true!
    },
    restore() {
        self.request.reset(); // reset request to initial state
    },
}));
```

```tsx
import { useMutation } from 'mst-query';
import { observer } from 'mobx-react';
import { AddMessageMutation } from './AddMessageMutation';

const EditMessage = observer((props) => {
    const { message } = props;
    const [addMessage, { mutation } = useMutation(UpdateMessageMutation, {
        request: { messageId: message.id, message: message.message },
    });
    return (
        <div>
            <textarea
                value={mutation.request.message}
                onChange={ev => mutation.setMessage(ev.target.value)} />
            <button
                type="button"
                disabled={mutation.request.hasChanges} // hasChanged is false initially
                onClick={() => addMessage()}>Save</button>
            <button type="button" onClick={() => mutation.request.reset()}>Reset</button>
        </div>
    );
});
```

## Subscriptions

```tsx
import { types } from 'mobx-state-tree';
import { createSubscription, MstQueryRef } from 'mst-query';
import { MessageModel } from './models';

type Subscriber = {
    next: (value: any) => {};
    error: (error: any) => {};
};

export class RealtimeService {
    connection = null;

    subscriptions = [];

    constructor() {
        // a made up example of a connection that pushes data over websockets
        this.connection = new WebsocketConnection();
        this.connection.on('new-message', (data) => {
            this.subscriptions.forEach((sub) => sub.next(data));
        });
    }

    subscribe(subscriber: Subscriber) {
        this.subscriptions.push(subscriber);

        // automatically called when the current useSubscription hook is no longer in use
        return () => {
            this.subscriptions = this.subscriptions.filter((sub) => sub !== subscriber);
        };
    }
}

const realtimeService = new RealtimeService();

export const NewMessageSubscription = createSubscription('NewMessageSubscription', {
    data: MstQueryRef(MessageModel),
}).actions((self) => ({
    run() {
        self.subscribe((subscriber: Subscriber) => realtimeService.subscribe(subscriber));
    },
    shouldUpdate(result) {
        // this can be used to skip an update
        return true;
    },
    onUpdate() {
        const message = self.data;

        if (!message) {
            return;
        }

        const { queryStore } = getQueryClient(self);
        const messageListQuery = queryStore.find(MessageListQuery);
        messageListQuery?.addMessage(message);
    },
}));
```

```tsx
export const MessageList: React.FC = observer(props => {
    useSubscription(NewMessageSubscription, {
        onUpdate(data: any) {
            console.log('new message');
        }
    });
    return <div></div>;
}));
```

## Cache

Queries are cached by model type, request arguments and query function passed to run. Stale time is how much time should pass before a cached value needs to be refetched from the server. Cache time controls how long a query will remain in the cache after it is no longer in use.

### `queryStore`

```tsx
const query = queryStore.find(MessageQuery);
const queryWithId = queryStore.find(MessageQuery, (q) => q.request.id === 'message-id');

const allMessageMutations = queryStore.findAll(UpdateMessageMutation, (q) => true);
```

## Queries as properties (Experimental)

Queries can be put as normal properties on any model that is part of your root store.
This can be useful to serialize and store client state for later use, or if you prefer to build your application according to a [MVVM pattern](https://en.wikipedia.org/wiki/Model%E2%80%93view%E2%80%93viewmodel).

```ts
const UserModel = types.model('UserModel', {
    id: types.identifier,
    name: types.string,
    age: types.number,
});

const UserViewModel = types
    .model({
        data: types.model({
            name: '',
            age: '',
        },
        user: MstQuerRef(UserModel),
        getUser: types.optional(GetUserQuery, {}),
        updateUser: types.optional(UpdateUserMutation, {}),
    })
    .views((self) => ({
        get userId() {
            return self.user?.id ?? self.user;
        },
        get errorMessage() {
            return self.getUser.errorMessage || self.updateUser.errorMessage;
        },
        get isLoading() {
            return self.getUser.isLoading || self.updateUser.isLoading;
        },
    }))
    .actions((self) => ({
        afterCreate() {
            self.getUser.setOptions({ staleTime: 5000 });
        },
        afterAttach() {
            self.readFromLocalStorage();
            onSnapshot(self, (json) => {
               window.localStorage.setItem(`user:${self.user.id}`, JSON.stringify(json));
            });
        },
        update() {
            self.updateUser.run({ id: self.userId, ...self.data });
        },
        async refresh() {
            const userData = await self.getUser.run(self.userId);
            applySnapshot(self.data, {
                name: userData.name,
                age: userData.toString(),
            });
        },
        readFromLocalStorage() {
            const data = window.localStorage.getItem(`user:${self.user.id}`);
            if (!data) return;

            applySnapshot(self, JSON.parse(data));

            if (!self.user) {
                self.refresh();
            }
        },
    }));

const RootStore = createRootStore({
    userStore: types.optional(createModelStore({ users: types.map(UserModel) }), {}),
    userViewModels: types.array(UserViewModel),
});
```
