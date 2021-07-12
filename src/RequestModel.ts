import equal from '@wry/equality';
import { applySnapshot, getSnapshot, types } from 'mobx-state-tree';

export const RequestModel = types.model('RequestModel', {}).extend((self) => {
    let storedSnapshot: any = getSnapshot(self);
    return {
        views: {
            get hasChanges() {
                return !equal(storedSnapshot, getSnapshot(self));
            },
        },
        actions: {
            commit() {
                storedSnapshot = getSnapshot(self);
            },
            reset() {
                applySnapshot(self, storedSnapshot);
                this.commit();
            },
        },
    };
});
