const listeners = new Set<() => void>();
let removeListener: (() => void) | undefined;

// Share one browser listener across all mounted query observers.
export function subscribeToWindowFocus(listener: () => void) {
    if (typeof document === 'undefined' || !document.addEventListener) {
        return () => {};
    }

    listeners.add(listener);
    if (!removeListener) {
        const target = document;
        const onVisibilityChange = () => {
            if (target.visibilityState !== 'hidden') {
                for (const notify of [...listeners]) {
                    notify();
                }
            }
        };
        target.addEventListener('visibilitychange', onVisibilityChange);
        removeListener = () => target.removeEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            removeListener?.();
            removeListener = undefined;
        }
    };
}
