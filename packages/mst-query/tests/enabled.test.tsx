import * as React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { observer } from 'mobx-react';
import { destroy, getSnapshot, types } from 'mobx-state-tree';
import { afterEach, expect, test, vi } from 'vitest';
import {
    createContext,
    createModelStore,
    createQuery,
    createRootStore,
    QueryClient,
    useQuery,
} from '../src';

afterEach(cleanup);

const setup = () => {
    const ReminderModel = types.model('EnabledReminder', {
        id: types.identifier,
        title: types.string,
    });
    const ReminderQuery = createQuery('EnabledReminderQuery', {
        data: types.model({
            reminder: types.model({
                reminder: types.union(types.undefined, types.reference(ReminderModel)),
            }),
        }),
        request: types.model({ path: types.string }),
    });
    const Root = createRootStore({
        reminderStore: types.optional(createModelStore('EnabledReminderStore', ReminderModel), {}),
        query: types.optional(ReminderQuery, {}),
    });
    const client = new QueryClient({
        RootStore: Root,
        queryOptions: { endpoint: ({ meta, request }) => meta.gql(request) },
    }).init();
    const { QueryClientProvider } = createContext(client);
    return { client, query: client.rootStore.query, wrapper: QueryClientProvider };
};

test('a disabled reminder query stays null even when its entity is already in the model store', () => {
    const { client, query, wrapper } = setup();
    client.rootStore.reminderStore.merge({ id: 'reminder', title: 'Existing reminder' });
    const gql = vi.fn();
    const snapshots: unknown[] = [];
    const Comp = observer(() => {
        const reminder = client.rootStore.reminderStore.models.get('reminder');
        const { data } = useQuery(query, {
            request: { path: '/reminder' },
            meta: { gql },
            enabled: reminder == null,
        });
        snapshots.push(data == null ? data : getSnapshot(data));
        return null;
    });

    const { unmount } = render(<Comp />, { wrapper });
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.every((data) => data === null)).toBe(true);
    expect(query.data).toBeNull();
    expect(gql).not.toHaveBeenCalled();
    unmount();
    destroy(client.rootStore);
});

test('enabling a reminder query fetches the nested entity and disabling it preserves the response', async () => {
    const { client, query, wrapper } = setup();
    const response = { reminder: { reminder: { id: 'reminder', title: 'Fetched reminder' } } };
    let resolve!: (value: typeof response) => void;
    const gql = vi.fn(
        () =>
            new Promise<typeof response>((done) => {
                resolve = done;
            }),
    );
    const Comp = observer(({ enabled }: { enabled: boolean }) => {
        const { data } = useQuery(query, {
            request: { path: '/reminder' },
            meta: { gql },
            enabled,
        });
        return <div>{data?.reminder.reminder?.title ?? 'empty'}</div>;
    });

    const { rerender, getByText, unmount } = render(<Comp enabled={false} />, { wrapper });
    expect(query.data).toBeNull();
    expect(gql).not.toHaveBeenCalled();
    rerender(<Comp enabled />);
    expect(gql).toHaveBeenCalledTimes(1);
    expect(query.isLoading).toBe(true);
    expect(query.data).toBeNull();

    await act(async () => {
        resolve(response);
    });
    await waitFor(() => expect(getByText('Fetched reminder')).toBeTruthy());
    expect(getSnapshot(query.data!)).toEqual({ reminder: { reminder: 'reminder' } });
    const data = query.data;
    rerender(<Comp enabled={false} />);
    expect(query.data === data).toBe(true);
    expect(getByText('Fetched reminder')).toBeTruthy();
    expect(gql).toHaveBeenCalledTimes(1);
    unmount();
    destroy(client.rootStore);
});

test('disabling the query when normalization adds the reminder does not produce an empty wrapper', async () => {
    const { client, query, wrapper } = setup();
    const gql = vi.fn(async () => ({
        reminder: { reminder: { id: 'reminder', title: 'Fetched reminder' } },
    }));
    const snapshots: unknown[] = [];
    const Comp = observer(() => {
        const reminder = client.rootStore.reminderStore.models.get('reminder');
        const { data } = useQuery(query, {
            request: { path: '/reminder' },
            meta: { gql },
            enabled: reminder == null,
        });
        snapshots.push(data == null ? data : getSnapshot(data));
        return <div>{data?.reminder.reminder?.title ?? 'empty'}</div>;
    });

    const { getByText, unmount } = render(<Comp />, { wrapper });
    await waitFor(() => expect(getByText('Fetched reminder')).toBeTruthy());
    const responses = snapshots.filter((data) => data != null);
    expect(responses.length).toBeGreaterThan(0);
    for (const response of responses) {
        expect(response).toEqual({ reminder: { reminder: 'reminder' } });
    }
    expect(gql).toHaveBeenCalledTimes(1);
    expect(query.error).toBeNull();
    unmount();
    destroy(client.rootStore);
});

test('a supplied empty reminder wrapper remains a wrapper when the query is disabled', () => {
    const { client, query, wrapper } = setup();
    const gql = vi.fn();
    query.setData({ reminder: {} });
    const Comp = observer(() => {
        const { data } = useQuery(query, {
            request: { path: '/reminder' },
            meta: { gql },
            enabled: false,
        });
        return (
            <div>
                {data == null ? 'no data' : (data.reminder.reminder?.title ?? 'empty wrapper')}
            </div>
        );
    });

    const { getByText, unmount } = render(<Comp />, { wrapper });
    expect(getByText('empty wrapper')).toBeTruthy();
    expect(query.data?.reminder.reminder).toBeUndefined();
    expect(gql).not.toHaveBeenCalled();
    unmount();
    destroy(client.rootStore);
});
