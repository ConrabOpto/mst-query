'use client';
import { observer } from 'mobx-react-lite';
import { useSuspenseQuery } from 'mst-query';
import { useRootStore } from './providers';

export const Item = observer(({ id }: { id: 'awaited' | 'streamed' }) => {
    const { itemStore } = useRootStore();
    const query = id === 'awaited' ? itemStore.awaitedItemQuery : itemStore.streamedItemQuery;
    const { data } = useSuspenseQuery(query, { request: { id } });
    return (
        <p data-testid={id}>
            {data.description} created {data.createdAt.toISOString()}
        </p>
    );
});
