Query library for mobx-state-tree

# Features

-   Automatic Normalization
-   Automatic Garbage Collection
-   Use with any backend (REST, GraphQL, whatever!)
-   Infinite Scroll + Pagination Queries
-   Mutations + Change Tracking
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
    age: types.number
});

const ItemModel = types.model('ItemModel', {
    id: types.identifier,
    description: types.string,
    created: types.Date,
    count: types.number,
    createdBy: MstQueryRef(UserModel)
});

const getItem = ({ id }) => {
    return fetch('...').then((res) => res.json());
};

export const ItemQuery = createQuery('ItemQuery', {
    data: MstQueryRef(ItemModel),
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
import { ItemQuery } from './ItemQuery';

const ItemView = observer(props => {
   const { id } = props;
   const { data, error, isLoading } = useQuery(ItemQuery, {
       request: { id }
   });
   if (error) {
       return <div>An error occured...</div>;
   }
   if (isLoading) {
       return <div>Loading...</div>;
   }
   return <div>{data.description}</div>;
});
```

# Installation

```
npm install --save mst-query mobx-state-tree
```

