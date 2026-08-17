export const PLAYBACK_SETTINGS = Object.freeze({
    autoRotateEnabled: true,
    autoRotateIntervalMs: 5 * 60 * 1000
});

export function oppositeDisplayState(state) {
    return state === 'logo' ? 'rose' : 'logo';
}

export function createAutoRotateController({
    onRotate,
    enabled = PLAYBACK_SETTINGS.autoRotateEnabled,
    intervalMs = PLAYBACK_SETTINGS.autoRotateIntervalMs,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout
}) {
    let timer = null;

    function schedule() {
        if (timer !== null) clearTimer(timer);
        timer = null;
        if (!enabled) return;

        timer = setTimer(() => {
            timer = null;
            onRotate();
            schedule();
        }, intervalMs);
    }

    function cancel() {
        if (timer !== null) clearTimer(timer);
        timer = null;
    }

    return { schedule, cancel };
}
