import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { types } from 'mobx-state-tree';
import { observer } from 'mobx-react';
import {
    createContext,
    QueryClient,
    useQuery,
    createQuery,
    createRootStore,
    createModelStore,
} from 'mst-query';

export const PostModel = types.model('PostModel', {
    id: types.identifierNumber,
    title: types.string,
    body: types.maybe(types.string),
    userId: types.number,
});

export const PostsQuery = createQuery('PostsQuery', {
    data: types.array(types.reference(PostModel)),
    async endpoint() {
        const response = await fetch('https://jsonplaceholder.typicode.com/posts');
        const result = await response.json();
        return result.map((d: any) => ({
            userId: d.userId,
            id: d.id,
            title: d.title,
        }));
    },
});

const PostQuery = createQuery('PostQuery', {
    data: types.reference(PostModel),    request: types.model({ id: types.number }),
    async endpoint({ request }) {
        const { id } = request;
        const response = await fetch(`https://jsonplaceholder.typicode.com/posts/${id}`);
        return await response.json();
    },
});

const PostStore = createModelStore('PostStore', PostModel)
    .props({
        postsQuery: types.optional(PostsQuery, {}),
        postQuery: types.optional(PostQuery, {}),
    })
    .views((self) => ({
        get postList() {
            return Array.from(self.models.values());
        },
    }));

const RootStore = createRootStore({
    postStore: types.optional(PostStore, {}),
});

const queryClient = new QueryClient({ RootStore });
const { useRootStore, QueryClientProvider } = createContext(queryClient);

const Posts: React.FC<any> = observer((props) => {
    const { setSelectedPost } = props;
    const { postStore } = useRootStore();

    const { data, error, isLoading } = useQuery(postStore.postsQuery);

    return (
        <div>
            <h1>Posts</h1>
            <div>
                {!data ? (
                    'Loading...'
                ) : error ? (
                    <span>Error: {error.message}</span>
                ) : (
                    <>
                        <div>
                            {data.map((post) => (
                                <p key={post.id}>
                                    <a
                                        onClick={() => {
                                            setSelectedPost(post);
                                        }}
                                        href="#"
                                        style={
                                            // We can access the query data here to show bold links for
                                            // ones that are cached
                                            postStore.postList.find(
                                                (p) => p.id === post.id && p.body
                                            )
                                                ? {
                                                      fontWeight: 'bold',
                                                      color: 'green',
                                                  }
                                                : {}
                                        }>
                                        {post.title}
                                    </a>
                                </p>
                            ))}
                        </div>
                        <div>{data && isLoading ? 'Background Updating...' : ' '}</div>
                    </>
                )}
            </div>
        </div>
    );
});

const Post: React.FC<any> = observer((props) => {
    const { post, setSelectedPost } = props;
    const { postStore } = useRootStore();

    const { data, isLoading, error } = useQuery(postStore.postQuery, {
        request: { id: post.id },
        enabled: !!post
    });

    return (
        <div>
            <div>
                <a onClick={() => setSelectedPost(null)} href="#">
                    Back
                </a>
            </div>
            {!data ? (
                'Loading...'
            ) : error ? (
                <span>Error: {error.message}</span>
            ) : (
                <>
                    <h1>{data.title}</h1>
                    <div>
                        <p>{data.body}</p>
                    </div>
                    <div>{isLoading ? 'Background Updating...' : ' '}</div>
                </>
            )}
        </div>
    );
});

const env = {};

const App = observer(() => {
    const [selectedPost, setSelectedPost] = React.useState(null);
    return (
        <QueryClientProvider env={env}>
            <div>
                {selectedPost ? (
                    <Post post={selectedPost} setSelectedPost={setSelectedPost} />
                ) : (
                    <Posts setSelectedPost={setSelectedPost} />
                )}
            </div>
        </QueryClientProvider>
    );
});

const rootElement: any = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);
root.render(
    <StrictMode>
        <App />
    </StrictMode>
);
