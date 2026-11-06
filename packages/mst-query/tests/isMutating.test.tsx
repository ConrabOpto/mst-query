import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { autorun, reaction } from 'mobx';
import { observer } from 'mobx-react';
import { destroy, types } from 'mobx-state-tree';
import { afterEach, expect, test, vi } from 'vitest';
import {
    createContext,
    createMutation,
    createQuery,
    createRootStore,
    onMutate,
    QueryClient,
} from '../src';

afterEach(cleanup);

const deferred = () => {
    let resolve!: (value: { value: string }) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<{ value: string }>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
};

const setup = () => {
    const Mutation = createMutation('TrackedMutation', {
        endpoint: ({ meta }) => meta.execute(),
    });
    const Query = createQuery('UntrackedQuery', {
        endpoint: ({ meta }) => meta.execute(),
    });
    const Root = createRootStore({
        first: types.optional(Mutation, {}),
        second: types.optional(Mutation, {}),
        query: types.optional(Query, {}),
        dynamic: types.map(Mutation),
    }).actions((self) => ({
        addMutation(id: string) {
            self.dynamic.set(id, {});
            return self.dynamic.get(id)!;
        },
        removeMutation(id: string) {
            self.dynamic.delete(id);
        },
    }));
    const client = new QueryClient({ RootStore: Root });
    return { client };
};

test('isMutating is false before initialization and reacts to mutation start and completion', async () => {
    const { client } = setup();
    const states: boolean[] = [];
    const dispose = autorun(() => {
        states.push(client.isMutating);
    });
    expect(client.isMutating).toBe(false);
    client.init();
    const pending = deferred();
    const mutation = client.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => pending.promise },
    });
    expect(client.isMutating).toBe(true);
    expect(client.rootStore.first.isLoading).toBe(true);
    pending.resolve({ value: 'Done' });
    await mutation;
    expect(client.isMutating).toBe(false);
    expect(client.rootStore.first.isLoading).toBe(false);
    expect(states).toEqual([false, true, false]);
    dispose();
    destroy(client.rootStore);
});

test('a global observer loading indicator updates without a mutation hook', async () => {
    const { client } = setup();
    const { QueryClientProvider, useQueryClient } = createContext(client);
    const Indicator = observer(() => {
        const queryClient = useQueryClient();
        return <div>{queryClient.isMutating ? 'Saving' : 'Idle'}</div>;
    });
    const { container, unmount } = render(<Indicator />, { wrapper: QueryClientProvider });
    expect(container.textContent).toBe('Idle');
    const pending = deferred();
    let mutation!: ReturnType<typeof client.rootStore.first.mutate>;
    act(() => {
        mutation = client.rootStore.first.mutate({
            request: undefined,
            meta: { execute: () => pending.promise },
        });
    });
    expect(container.textContent).toBe('Saving');
    await act(async () => {
        pending.resolve({ value: 'Done' });
        await mutation;
    });
    expect(container.textContent).toBe('Idle');
    unmount();
    destroy(client.rootStore);
});

test.each([false, true])(
    'overlapping mutations stay tracked until both finish (same node=%s)',
    async (sameNode) => {
        const { client } = setup();
        client.init();
        const states: boolean[] = [];
        const dispose = autorun(() => {
            states.push(client.isMutating);
        });
        const localStates: boolean[] = [];
        const disposeLocal = autorun(() => {
            localStates.push(client.rootStore.first.isLoading);
        });
        const first = deferred();
        const second = deferred();
        const firstMutation = client.rootStore.first.mutate({
            request: undefined,
            meta: { execute: () => first.promise },
        });
        const secondMutation = (sameNode ? client.rootStore.first : client.rootStore.second).mutate(
            { request: undefined, meta: { execute: () => second.promise } },
        );
        second.resolve({ value: 'Second' });
        await secondMutation;
        expect(client.isMutating).toBe(true);
        expect(client.rootStore.first.isLoading).toBe(true);
        expect(client.rootStore.second.isLoading).toBe(false);
        first.resolve({ value: 'First' });
        await firstMutation;
        expect(client.isMutating).toBe(false);
        expect(client.rootStore.first.isLoading).toBe(false);
        expect(states).toEqual([false, true, false]);
        expect(localStates).toEqual([false, true, false]);
        dispose();
        disposeLocal();
        destroy(client.rootStore);
    },
);

test.each([false, true])(
    'scoped mutations stay loading while queued without an idle gap (same node=%s)',
    async (sameNode) => {
        const { client } = setup();
        client.init();
        const states: boolean[] = [];
        const dispose = autorun(() => {
            states.push(client.isMutating);
        });
        const first = deferred();
        const second = deferred();
        const firstEndpoint = vi.fn(() => first.promise);
        const secondEndpoint = vi.fn(() => second.promise);
        const firstMutation = client.rootStore.first.mutate({
            request: undefined,
            scope: { id: 'shared' },
            meta: { execute: firstEndpoint },
        });
        const secondNode = sameNode ? client.rootStore.first : client.rootStore.second;
        const secondMutation = secondNode.mutate({
            request: undefined,
            scope: { id: 'shared' },
            meta: { execute: secondEndpoint },
        });
        expect(client.isMutating).toBe(true);
        expect(secondEndpoint).not.toHaveBeenCalled();
        expect(client.rootStore.first.isLoading).toBe(true);
        expect(secondNode.isLoading).toBe(true);
        expect(client.hasPendingMutations(secondNode)).toBe(true);
        await waitFor(() => expect(firstEndpoint).toHaveBeenCalledTimes(1));
        first.resolve({ value: 'First' });
        await firstMutation;
        expect(client.rootStore.first.isLoading).toBe(sameNode);
        await waitFor(() => expect(secondEndpoint).toHaveBeenCalledTimes(1));
        expect(client.isMutating).toBe(true);
        expect(secondNode.isLoading).toBe(true);
        second.resolve({ value: 'Second' });
        await secondMutation;
        expect(secondNode.isLoading).toBe(false);
        expect(states).toEqual([false, true, false]);
        dispose();
        destroy(client.rootStore);
    },
);

test('mutation rejection clears the indicator after error processing', async () => {
    const { client } = setup();
    client.init();
    const pending = deferred();
    const mutation = client.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => pending.promise },
    });
    const error = new Error('Failed');
    pending.reject(error);
    const result = await mutation;
    expect(result.error).toBe(error);
    expect(client.isMutating).toBe(false);
    expect(client.rootStore.first.isLoading).toBe(false);
    destroy(client.rootStore);
});

test('synchronous mutation failures release tracking', async () => {
    const { client } = setup();
    client.init();
    const error = new Error('Failed immediately');
    await expect(
        client.rootStore.first.mutate({
            request: undefined,
            meta: {
                execute: () => {
                    throw error;
                },
            },
        }),
    ).rejects.toThrow(error);
    expect(client.isMutating).toBe(false);
    expect(client.rootStore.first.isLoading).toBe(false);
    destroy(client.rootStore);
});

test('an optimistic update that throws releases tracking before the endpoint runs', async () => {
    const { client } = setup();
    client.init();
    const execute = vi.fn();
    const error = new Error('Optimistic update failed');
    await expect(
        client.rootStore.first.mutate({
            request: undefined,
            meta: { execute },
            optimisticUpdate: () => {
                throw error;
            },
        }),
    ).rejects.toThrow(error);
    expect(client.isMutating).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(client.rootStore.first.isLoading).toBe(false);
    destroy(client.rootStore);
});

test('an aborted endpoint releases mutation tracking', async () => {
    const { client } = setup();
    client.init();
    const pending = deferred();
    const mutation = client.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => pending.promise },
    });
    const error = new Error('Aborted');
    error.name = 'AbortError';
    pending.reject(error);
    const result = await mutation;
    expect(result.error).toBeNull();
    expect(client.isMutating).toBe(false);
    expect(client.rootStore.first.isLoading).toBe(false);
    destroy(client.rootStore);
});

test('isMutating stays true during response callbacks and clears even if a callback throws', async () => {
    const { client } = setup();
    client.init();
    const error = new Error('Callback failed');
    onMutate(client.rootStore.first, () => {
        expect(client.isMutating).toBe(true);
        expect(client.rootStore.first.isLoading).toBe(true);
        throw error;
    });
    await expect(
        client.rootStore.first.mutate({
            request: undefined,
            meta: { execute: async () => ({ value: 'Done' }) },
        }),
    ).rejects.toThrow(error);
    expect(client.isMutating).toBe(false);
    expect(client.rootStore.first.isLoading).toBe(false);
    destroy(client.rootStore);
});

test('ordinary queries and other query clients do not affect isMutating', async () => {
    const { client } = setup();
    const { client: other } = setup();
    client.init();
    other.init();
    const pendingQuery = deferred();
    const query = client.rootStore.query.query({ meta: { execute: () => pendingQuery.promise } });
    const pendingMutation = deferred();
    const mutation = other.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => pendingMutation.promise },
    });
    expect(client.isMutating).toBe(false);
    expect(other.isMutating).toBe(true);
    pendingQuery.resolve({ value: 'Query' });
    pendingMutation.resolve({ value: 'Mutation' });
    await Promise.all([query, mutation]);
    destroy(client.rootStore);
    destroy(other.rootStore);
});

test('destroying a pending mutation releases only its own tracking', async () => {
    const { client } = setup();
    client.init();
    const dynamic = client.rootStore.addMutation('dynamic');
    dynamic.mutate({ request: undefined, meta: { execute: () => new Promise(() => {}) } });
    const pending = deferred();
    const mutation = client.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => pending.promise },
    });
    expect(client.isMutating).toBe(true);
    client.rootStore.removeMutation('dynamic');
    expect(client.isMutating).toBe(true);
    pending.resolve({ value: 'Remaining mutation' });
    await mutation;
    expect(client.isMutating).toBe(false);
    destroy(client.rootStore);
});

test('mutations added after the indicator is observed are tracked reactively', async () => {
    const { client } = setup();
    client.init();
    const states: boolean[] = [];
    const dispose = autorun(() => {
        states.push(client.isMutating);
    });
    const dynamic = client.rootStore.addMutation('dynamic');
    const pending = deferred();
    const mutation = dynamic.mutate({
        request: undefined,
        meta: { execute: () => pending.promise },
    });
    expect(client.isMutating).toBe(true);
    pending.resolve({ value: 'Dynamic mutation' });
    await mutation;
    expect(states).toEqual([false, true, false]);
    dispose();
    destroy(client.rootStore);
});

test('a new mutation type registered while idle is discovered reactively', async () => {
    const { client } = setup();
    client.init();
    const states: boolean[] = [];
    const dispose = autorun(() => {
        states.push(client.isMutating);
    });
    const pending = deferred();
    const NewMutation = createMutation('NewMutationType', { endpoint: () => pending.promise });
    const node = NewMutation.create({}, client.config.env);
    const mutation = node.mutate({ request: undefined });
    expect(states).toEqual([false, true]);
    expect(node.isLoading).toBe(true);
    pending.resolve({ value: 'New mutation type' });
    await mutation;
    expect(states).toEqual([false, true, false]);
    expect(node.isLoading).toBe(false);
    dispose();
    destroy(node);
    destroy(client.rootStore);
});

test('hasPendingMutations reacts to a dynamically created mutation', async () => {
    const { client } = setup();
    client.init();
    const states: boolean[] = [];
    const dispose = reaction(
        () => client.hasPendingMutations(client.rootStore),
        (pending) => {
            states.push(pending);
        },
        { fireImmediately: true },
    );
    const pending = deferred();
    const node = client.rootStore.addMutation('dynamic');
    const mutation = node.mutate({ request: undefined, meta: { execute: () => pending.promise } });
    expect(states).toEqual([false, true]);
    pending.resolve({ value: 'Done' });
    await mutation;
    expect(states).toEqual([false, true, false]);
    dispose();
    destroy(client.rootStore);
});

test('reset clears the indicator and tracking remains reactive for the replacement store', async () => {
    const { client } = setup();
    client.init();
    const states: boolean[] = [];
    const dispose = autorun(() => {
        states.push(client.isMutating);
    });
    const previous = deferred();
    const previousMutation = client.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => previous.promise },
    });
    expect(client.isMutating).toBe(true);
    client.reset();
    expect(client.isMutating).toBe(false);
    const pending = deferred();
    const mutation = client.rootStore.first.mutate({
        request: undefined,
        meta: { execute: () => pending.promise },
    });
    expect(client.isMutating).toBe(true);
    previous.resolve({ value: 'Previous store' });
    await previousMutation;
    expect(client.isMutating).toBe(true);
    pending.resolve({ value: 'New store' });
    await mutation;
    expect(states).toEqual([false, true, false, true, false]);
    dispose();
    destroy(client.rootStore);
});
