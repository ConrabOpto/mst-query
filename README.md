Query library for mobx-state-tree

# Features

-   Automatic Normalization
-   Automatic Garbage Collection
-   Use with any backend (REST, GraphQL, whatever!)
-   Infinite Scroll + Pagination Queries
-   Mutations + Change Tracking
-   Request Argument Type Validation
-   Abort Requests
-   Optimistic Mutations

# Basic Usage

First, create some models and a query...

```tsx
import { flow, types } from 'mobx-state-tree';
import { createQuery, MstQueryRef } from 'mst-query';

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

const getItem = ({ id }) => {
    return fetch('...').then((res) => res.json());
};

export const MessageQuery = createQuery('MessageQuery', {
    data: MstQueryRef(MessageModel),
    request: types.model({ id: types.string }),
    env: types.frozen(),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield self.query(getItem, { id: self.request.id });
        next();
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

```ts
import { configure } from 'mst-query';

configureMstQuery({
    env: { ... },
    getId: (data) => data['id']
});
```

## TODO

Readme below is in progress...

## Concepts

A key concept in <i>mobx-state-tree</i> is a single, centralized state container that holds the entire state of our app. This keeps our business logic in one place, allowing our components to mostly focus on rendering.

But there are a couple of trade offs to consider.

-   **The RootStore needs knowledge of all our models**

    This breaks code splitting, and is bad for the user that only utilizes a small portion of our app. Also if the model bundle is large, it slows down the startup time for all users.

    In contrast, <i>mst-query</i> only needs knowledge of the models relevant for the current query.

-   **Unused data lives in the store forever**

    Most applications problaby don't manage enough data for this to be an issue. But consider an app with thousands of complex models and high data throughput, that is also kept open for long periods of time. Such an app will become more sluggish over time as it accumulates memory.

    In <i>mst-query</i>, unused data is automatically garbage collected.

-   **Normalizing data from the server is our responsibility**

    Normalizing remote data and putting it in the correct store can be tedious and error prone. Especially if you have a complex backend schema with deep connections between models.

    A key feature of <i>mst-query</i> is automatic data normalization based on identifiers in our mobx-state-tree models.

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

Since data is garbage collected in `mst-query`, `MstQueryRef` doesn't throw if it cannot find a suitable model in the internal cache. Instead, it simply returns the id as a string, allowing us to fetch data for this model again.

TODO: Add example of this

## Queries

### `createQuery`

A query is just a <i>mobx-state-tree</i> model, but with special properties, called a <i>QueryModel</i>. Here's an example of a query that fetches a list of messages, with an optional filter.

```tsx
import { createQuery } from 'mobx-state-tree';
import { MessageModel } from './models';

const MessageListQuery = createQuery('MessageListQuery', {
    data: types.model({ items: types.array(MstQueryRef(MessageModel)) }),
    request: types.model({ filter: types.optional(types.string, '') }),
    env: types.frozen(),
}).actions((self) => ({
    run: flow(function* () {
        const next = yield self.query(getItems, { filter: self.request.filer });
        const { result, error, data } = next();
    }),
}));
```

The first argument to `createQuery` is the name of this query. The second is an option object that controls how this query recevies (data) and transmits (request) data.

There's also a special action, `run`. This action should always be a flow generator, and will automatically be called when a query is put into a `useQuery` hook.

### `useQuery`

```tsx
import { useQuery } from 'mst-query';
import { observer } from 'mobx-react';
import { MessageQuery } from './MessageQuery';

const MesssageView = observer((props) => {
    const { id, cachedData } = props;
    const {
        run,
        data,
        error,
        isLoading,
        isFetched,
        isRefetching,
        isFetchingMore,
        query,
    } = useQuery(MessageQuery, {
        data: cachedData,
        request: { id },
        onFetched(data, self) {},
        afterCreate(self) {},
        onRequestSnapshot(snapshot) {},
        key: id,
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

Note that `data` and `request` are only set on creation. Even if these values change, you have to specify `key` to force useQuery to use them.

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

A lazy version of `useQuery`. Useful if you have cached data and manually want to decide when to run the query.

### `query`

### `refetch` & `isRefetching`

## Paginated and infinite lists

### `queryMore`

## Mutations

### `createMutation`

### `useMutation`

### `mutate`

## Optimistic updates

Automatic rollback. Limitation about root node.

## Change tracking

### `hasChanged` & `commitChanges`

Deep equality change tracking of request object.

## Subscriptions

### `createSubscription`

### `useSubscription`

## Cache

### `queryCache`

find, findAll, clear

## Extra apis

### `whenIsDoneLoading`

### `reset`

### `abort`
