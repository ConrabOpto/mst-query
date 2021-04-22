# Queries

## Create queries that automatically map to your mobx-state-tree models

```ts
import { createQuery } from 'mst-query';
import ConversationModel from './models/conversationModel';

const conversationApi = options => fetcher({
    query: conversationGql,
    ...options
});

const ConversationQuery = createQuery('ConversationQuery', { conversation: ConversationModel })
   .actions((self) => ({
      run({ path }) {
          return self.query(getEnv(self).conversationApi, {
             variables: {
                 path
             }
          });
      },
   }));
```

## React hook for fetching data

```tsx
import { useQuery } from 'mst-query';
import api from './api';
import Conversation from './components/Conversation';

const ConversationView = (props) => {
    const { data, loading, error } = useQuery(ConversationQuery, {
        // useQuery always calls run on mount
        env: { api },
        variables: { path: props.path }, // variables are automatically passed to the run-action
    });
    if (loading) {
        return <div>Loading...</div>;
    }
    if (error) {
        return <div>Error...</div>;
    }
    return <Conversation conversation={data}></Conversation>;
};
```

## Enhance your queries with mobx-state-tree actions, views and observable properties

```ts
import { createQuery } from 'mst-query';
import ConversationConnectionModel from './models/conversationConnectionModel';

const conversationConnectionApi = options => fetcher({
    query: conversationGql,
    ...options
});

const ConversationConnectionQuery = createQuery({ conversations: ConversationConnectionModel }).actions(self => ({
    run({ path }) {
        return self.query(getEnv(self).conversationConnectionApi, {
            variables: {
                path,
                scope: 'ME'
            }
        });
    },
}));

const ConversationConnectionQueryWithFilter = ConversationConnectionQuery.named('ConversationConnectionQueryWithFilter')
    .volatile(self => ({
        filter: ''
    }))
    .actions(self => ({
       setFilter(filter: string) {
           self.filter = filter;
       }
    }))
    .views(self => ({
       get filteredItems() {
           const items = self.conversations.items;
           if (!self.filter) {
               return items;
           }
           return items.filter(conversation => conversation.name.includes(self.filter));
       }
    }));
```

## Make changes to queries from anywhere via the query cache

```ts
import { queryCache, createQuery } from 'mst-query';
// import type ConverastionConnectionQueryType

const DocumentQuery = createQuery()
   .volatile(self => ({
       openConversationId: null
   }))
   .views(self => ({
       get conversationConnectionQuery(): ConversationConnectionQueryType {
           return queryCache.get('ConversationConnectionQuery', { path: getEnv(self).path, scope: 'ME' });
       }
   }))
   .actions(self => ({
       // refetch queries
       addAndOpenConversation: flow(function* () {
           yield self.conversationConnection.refetch();
           self.openConversationId = conversationData.id;
       }
       // or manipulate them directly
       addAndOpenConversation(conversationData) {
           self.conversationConnectionQuery.conversations.addConversation(conversationData);
           self.openConversationId = conversationData.id;
       }
   }));
```

## Dependent queries

```ts
import { createQuery, run } from 'mst-query';
import ConversationModel from './models/conversationModel';
import fetcher from 'Utils/Api/Fetcher';

const conversationApi = options => fetcher({
    query: conversationGql,
    ...options
});

const isAdminApi = options => fetcher({
   query: isAdminQueryGql,
   ...options
});

const IsAdminQuery = createQuery('IsAdminQuery', { isAdmin: types.boolean })
   .actions((self) => ({
      run({ user }) {
          return self.query(getEnv(self).isAdminApi, {
             variables: {
                 userId: user.id
             }
          });
      },
   }));

const ConversationsQuery = createQuery('ConversationsQuery', { conversations: ConversationConnectionModel })
   .actions((self) => ({
      run: flow(function* ({ path }) {
          const isAdmin = yield run(IsAdminQuery);
          return self.query(getEnv(self).conversationApi, {
             variables: {
                 path,
                 scope: isAdmin ? 'ME_AND_ADMIN' : 'ME';
             }
          });
      }),
   }));
```

# Mutations

## Create mutations that encapsulate all related logic

```tsx
import { useState } from 'react';
import { createMutation, useMutation } from 'mst-query';
import fetcher from 'Utils/Api/Fetcher';

const sendMessageApi = options => fetcher({
    query: sendMessageMutationGql,
    ...options
});

const SendMessageMutation = createMutation('SendMessageMutation')
   .volatile((self) => ({
      message: ''
   }))
   .views((self) => ({
       get canSend() {
           return self.message !== '' && !self.loading;
       }
   }))
   .actions((self) => ({
       run(path) {
           if (!self.canSend) {
               return;
           }
           return self.mutate(getEnv(self).api.sendMessageApi, {
             variables: {
                 message: self.message,
                 path
             }
          });
       },
       setMessage(message: string) {
           self.message = message;
       }
   }));

const NewConversationMessage = (props) => {
    const [{ canSend, message, setMessage }, sendMessage] = useMutation(SendMessageMutation, { env: { api }});
    return (
        <div>
            <input value={message} onChange={ev => setMessage(ev.target.value)} />
            <button disabled={loading} onClick={() => sendMessage(props.path)}>Send</button>
        </div>
    );
};
```

## Optimistic updates

```tsx
import { useState } from 'react';
import { createMutation, useMutation, queryCache } from 'mst-query';
import fetcher from 'Utils/Api/Fetcher';

const sendMessageApi = options => fetcher({
    query: sendMessageMutationGql,
    ...options
});

const SendMessageMutation = createMutation('SendMessageMutation')
   .volatile((self) => ({
      message: ''
   }))
   .views((self) => ({
       get canSend() {
           return self.message !== '' && !self.loading;
       }
   }))
   .actions((self) => ({
       run: flow(function* (path) {
           if (!self.canSend) {
               return;
           }
           const newMessage = ConversationMessage.create({ message: self.message });
           const messageData = yield self.mutate(getEnv(self).sendMessageApi, {
             variables: {
                 message: self.message,
                 path
             },
             optimisticUpdate() {
                 const conversationConnectionQuery = queryCache.get('ConversationConnectionQuery', { 
                     path: getEnv(self).path
                 });
                 conversationConnectionQuery?.addMessage(newMessage); // if the mutation fails, this will automatically be rolled backed!  
             }
          });
          applySnapshot(newMessage, messageData);
       }),
       setMessage(message: string) {
           self.message = message;
       }
   }));

const NewConversationMessage = (props) => {
    const [{ canSend, message, setMessage }, sendMessage] = useMutation(SendMessageMutation, { 
        env: { sendMessageApi, path: props.path }
    });
    return (
        <div>
            <input value={message} onChange={ev => setMessage(ev.target.value)} />
            <button disabled={canSend} onClick={() => sendMessage(props.path)}>Send</button>
        </div>
    );
};
```


## Reuse data/initial data

Let's say we've fetched a list of conversations. When showing a detail view, it's wasteful if we have to fetch this data again.

```tsx
TODO
```

## Gotchas
Identifiers, items in arrays