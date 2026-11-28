import { hasParent, types } from 'mobx-state-tree';
import { expect, test, vi } from 'vitest';
import { createMutation, createRootStore, QueryClient } from '../src';
import { isVariableEqual } from '../src/MstQueryHandler';

test('compares nested request nodes without attaching them to a temporary tree', () => {
    const Item = types.model({ id: types.identifier });
    const Request = types.model({ items: types.array(Item), selected: types.reference(Item) });
    const current = Request.create({ items: [{ id: 'a' }], selected: 'a' });
    const nextItem = Item.create({ id: 'a' });

    expect(isVariableEqual(current, { items: [nextItem], selected: current.selected })).toBe(true);
    expect(hasParent(nextItem)).toBe(false);
});

test('retains request defaults, custom snapshots, and circular frozen values during comparison', () => {
    const IsoDate = types.custom<string, Date>({
        name: 'IsoDate',
        fromSnapshot: (value) => new Date(value),
        toSnapshot: (value) => value.toISOString(),
        isTargetType: (value) => value instanceof Date,
        getValidationMessage: () => '',
    });
    const Request = types.model({ date: IsoDate, limit: 10, payload: types.frozen() });
    const date = '2026-11-28T12:00:00.000Z';
    const payload = { self: {} };
    payload.self = payload;
    const current = Request.create({ date, payload });

    expect(isVariableEqual(current, { date: new Date(date), payload })).toBe(true);
    expect(isVariableEqual(current, { date: new Date(date), limit: 20, payload })).toBe(false);
});

test('runs consecutive mutations with fresh nested request nodes', async () => {
    const Input = types.model({ name: types.string });
    const endpoint = vi.fn(async ({ request }) => ({ name: request.input.name }));
    const Save = createMutation('Save', {
        request: types.model({ input: Input }),
        endpoint,
    });
    const RootStore = createRootStore({ save: types.optional(Save, {}) });
    const { save } = new QueryClient({ RootStore }).init().rootStore;

    for (const name of ['first', 'second']) {
        const input = Input.create({ name });
        const result = await save.mutate({ request: { input } });
        expect(result.data).toEqual({ name });
    }

    expect(endpoint).toHaveBeenCalledTimes(2);
});
