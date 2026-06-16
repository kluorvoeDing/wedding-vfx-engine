import test from 'node:test';
import assert from 'node:assert/strict';

import { MODE_CONFIGS, getModeConfig } from '../modes.js';
import { getParticleSettings } from '../particleSettings.js';

test('mode registry exposes linked controls and a wedding-focused mode', () => {
    assert.ok(MODE_CONFIGS.length >= 14);

    for (const mode of MODE_CONFIGS) {
        assert.equal(Number.isInteger(mode.id), true);
        assert.equal(typeof mode.label, 'string');
        assert.equal(typeof mode.params.intensity, 'number');
        assert.equal(typeof mode.params.turbulence, 'number');
        assert.equal(typeof mode.params.returnForce, 'number');
        assert.equal(typeof mode.params.pointSize, 'number');
    }

    assert.equal(getModeConfig(6).label.includes('LOGO'), true);
    assert.equal(getModeConfig(9).shaderMode, 9);
    assert.equal(getModeConfig(9).label.includes('誓言'), true);
    assert.equal(getModeConfig(10).label.includes('星圖'), true);
    assert.equal(getModeConfig(11).label.includes('頭紗'), true);
    assert.equal(getModeConfig(12).label.includes('萬花筒'), true);
    assert.equal(getModeConfig(13).label.includes('金粉'), true);
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
