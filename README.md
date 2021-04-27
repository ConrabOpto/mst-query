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

...then use your query in a React component!

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

## Concepts

A key concept in <i>mobx-state-tree</i> is a single, centralized state container that holds the entire state of our app. This keeps our business logic in one place, allowing our components to mostly focus on rendering.

But there are a couple of drawbacks to consider, namely:

-   The RootStore needs knowledge of all our models

This breaks code splitting, and is bad for the user that only utilizes a small portion of our app. Also if the model bundle is large, it slows down the startup time for all users.

In contrast, <i>mst-query</i> only needs knowledge of the models relevant for the current query.

-   Unused data lives in the store forever

Most applications problaby don't manage enough data for this to be an issue. But consider an app with thousands of complex models and high data throughput, that is also kept open for long periods of time. Such an app will become more sluggish over time as it accumulates memory.

In <i>mst-query</i>, unused data is automatically garbage collected.

-   Normalizing data from the server is our responsibility

Normalizing remote data and putting it in the correct store can be tedious and error prone. Especially if you have a complex backend schema with deep connections between models.

A key feature of <i>mst-query</i> is automatic data normalization based on identifiers in our mobx-state-tree models.

## TODO

Readme in progress...

## Queries

A query is just a <i>mobx-state-tree</i> model, but with special properties. Here's an example of a query that fetches a list of messages.

```tsx
import { createQuery } from 'mobx-state-tree';

const MessageListQuery = createQuery('MessageListQuery', {
    ...
});
```

<i>Data</i> - the expected schema of the data returned from the server.

<i>Request</i> (optional) - the shape of the data we send to our endpoint.

<i>Env</i> (optional) - any extra data we want to use in the query.
