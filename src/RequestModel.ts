import equal from '@wry/equality';
import { observable } from 'mobx';
import { applySnapshot, getSnapshot, types } from 'mobx-state-tree';

export const RequestModel = types.model('RequestModel', {}).extend((self) => {
    let storedSnapshot: any = observable.box(getSnapshot(self), { deep: false });
    return {
        views: {
            get hasChanges() {
                return !equal(storedSnapshot.get(), getSnapshot(self));
            },
        },
        actions: {
            commit() {
                storedSnapshot.set(getSnapshot(self));
            },
            reset() {
                applySnapshot(self, storedSnapshot.get());
                this.commit();
            },
        },
    };
});
