import React from 'react';
import { types, flow, Instance } from 'mobx-state-tree';
import { observer } from 'mobx-react';
import {
    createContext,
    QueryClient,
    useQuery,
    createQuery,
    MstQueryRef,
    createRootStore,
    createModelStore,
} from 'mst-query';
import axios from 'axios';

export const PostModel = types
    .model('PostModel', {
        id: types.identifierNumber,
        title: types.string,
        body: types.maybe(types.string),
        userId: types.number,
    })
    .views((self) => ({
        get hasContent() {
            return !!self.body;
        },
    }));

export interface PostModelType extends Instance<typeof PostModel> {}

const getPosts = async () => {
    const { data } = await axios.get('https://jsonplaceholder.typicode.com/posts');
    return data.map((d: any) => ({ userId: d.userId, id: d.id, title: d.title }));
};

export const PostsQuery = createQuery('PostsQuery', {
    data: types.array(MstQueryRef(PostModel)),
    endpoint: getPosts,
});

const getPostById = async ({ request }: any) => {
    const { id } = request;
    const { data } = await axios.get(`https://jsonplaceholder.typicode.com/posts/${id}`);
    return data;
};

const PostQuery = createQuery('PostQuery', {
    data: MstQueryRef(PostModel),
    request: types.model({ id: types.number }),
    endpoint: getPostById,
});

const PostStore = createModelStore(PostModel)
    .props({
        postsQuery: types.optional(PostsQuery, {}),
        postQuery: types.optional(PostQuery, {}),
    })
    .views((self) => ({
        get postList() {
            return Array.from(self.models.values());
        },
    }))
    .actions((self) => ({
        getPosts: flow(function* () {
            const next = yield* self.postsQuery.query();
            next();
        }),
        getPost: flow(function* ({ id }) {
            const next = yield* self.postQuery.query({ request: { id } });
            next();
        }),
    }));

const RootStore = createRootStore({
    postStore: types.optional(PostStore, {}),
});

const queryClient = new QueryClient({ RootStore });
const { useRootStore, QueryClientProvider } = createContext(queryClient);

type PostsProps = {
    onSelectedPost: (post: PostModelType | null) => void;
};

const Posts = observer((props: PostsProps) => {
    const { onSelectedPost } = props;
    const { postStore } = useRootStore();
    const { data, error, isLoading } = useQuery(postStore.postsQuery, postStore.getPosts, {
        staleTime: 100000,
        enabled: true,
    });
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
                                        onClick={() => onSelectedPost(post)}
                                        href="#"
                                        style={
                                            post.hasContent
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

type PostProps = {
    post: PostModelType;
    onSelectedPost: (post: PostModelType | null) => void;
};

const Post = observer((props: PostProps) => {
    const { post, onSelectedPost } = props;
    const { postStore } = useRootStore();
    const { data, isLoading, error } = useQuery(postStore.postQuery, postStore.getPost, {
        initialData: post,
        request: { id: post.id },
    });
    return (
        <div>
            <div>
                <a onClick={() => onSelectedPost(null)} href="#">
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
    const [selectedPost, setSelectedPost] = React.useState<PostModelType | null>(null);
    return (
        <QueryClientProvider env={env}>
            <div>
                <p>
                    As you visit the posts below, you will notice them in a loading state the first
                    time you load them. However, after you return to this list and click on any
                    posts you have already visited again, you will see them load instantly and
                    background refresh right before your eyes!{' '}
                    <strong>
                        (You may need to throttle your network speed to simulate longer loading
                        sequences)
                    </strong>
                </p>
                {selectedPost ? (
                    <Post post={selectedPost} onSelectedPost={(post) => setSelectedPost(post)} />
                ) : (
                    <Posts onSelectedPost={(post) => setSelectedPost(post)} />
                )}
            </div>
        </QueryClientProvider>
    );
});

export default App;
