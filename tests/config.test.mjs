import test from 'node:test';
import assert from 'node:assert/strict';

import { MODE_CONFIGS, getModeConfig } from '../modes.js';
import { getParticleSettings } from '../particleSettings.js';
import {
    PLAYBACK_SETTINGS,
    createAutoRotateController,
    oppositeDisplayState
} from '../playbackSettings.js';

test('mode registry exposes the wedding logo-only mode', () => {
    assert.equal(MODE_CONFIGS.length, 1);

    for (const mode of MODE_CONFIGS) {
        assert.equal(Number.isInteger(mode.id), true);
        assert.equal(typeof mode.label, 'string');
        assert.equal(typeof mode.shaderMode, 'number');
        assert.equal(typeof mode.targetProgress, 'number');
        assert.equal(typeof mode.params.intensity, 'number');
        assert.equal(typeof mode.params.turbulence, 'number');
        assert.equal(typeof mode.params.returnForce, 'number');
        assert.equal(typeof mode.params.pointSize, 'number');
    }

    assert.equal(getModeConfig(6).label.includes('LOGO'), true);
    assert.equal(getModeConfig(6).shaderMode, 6);
    assert.equal(getModeConfig(999).shaderMode, 6);
    assert.equal(getModeConfig(6).targetProgress, 1.0);
});

test('particle density settings trade quality for real particle count', () => {
    const highest = getParticleSettings(1);
    const fastest = getParticleSettings(5);

    assert.ok(highest.minParticles > fastest.minParticles);
    assert.ok(highest.logoStep < fastest.logoStep);
    assert.ok(highest.imageStep < fastest.imageStep);
    assert.equal(getParticleSettings(999).density, 5);
    assert.equal(getParticleSettings(-1).density, 1);
});

test('playback settings enable a five-minute automatic rotation', () => {
    assert.equal(PLAYBACK_SETTINGS.autoRotateEnabled, true);
    assert.equal(PLAYBACK_SETTINGS.autoRotateIntervalMs, 5 * 60 * 1000);
    assert.equal(oppositeDisplayState('rose'), 'logo');
    assert.equal(oppositeDisplayState('logo'), 'rose');
});

test('automatic rotation fires and schedules the next five-minute cycle', () => {
    let rotateCount = 0;
    let scheduledCallback;
    let scheduledDelay;
    const clearedTimers = [];
    let nextTimer = 0;

    const controller = createAutoRotateController({
        onRotate: () => { rotateCount += 1; },
        setTimer: (callback, delay) => {
            scheduledCallback = callback;
            scheduledDelay = delay;
            nextTimer += 1;
            return nextTimer;
        },
        clearTimer: (timer) => clearedTimers.push(timer)
    });

    controller.schedule();
    assert.equal(scheduledDelay, 5 * 60 * 1000);
    assert.equal(nextTimer, 1);

    scheduledCallback();
    assert.equal(rotateCount, 1);
    assert.equal(nextTimer, 2);
    assert.deepEqual(clearedTimers, []);

    controller.schedule();
    assert.equal(nextTimer, 3);
    assert.deepEqual(clearedTimers, [2]);
});
