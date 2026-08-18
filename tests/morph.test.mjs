import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MORPH_SETTINGS,
    progressTargetFor,
    smoothDamp,
    activeSimFor,
    wrapAngle,
    lerp,
    equivalentPointSize
} from '../morphController.js';
import { oppositeDisplayState } from '../playbackSettings.js';

const FRAME = 1 / 60;

// 逐幀模擬 io.js 的 updateIO：追隨 target、推導顯示中的模擬。
// 這裡刻意不含任何鎖或 promise —— 與正式程式的架構一致。
function createHarness() {
    const state = { desired: 'rose', target: 0, p: 0, v: 0, sim: 'rose', spin: 0 };
    return {
        state,
        toggle() {
            state.desired = oppositeDisplayState(state.desired);
            state.target = progressTargetFor(state.desired);
        },
        frame(dt = FRAME) {
            const { smoothTime, settleEpsilon, rotationSpeed } = MORPH_SETTINGS;
            const r = smoothDamp(state.p, state.target, state.v, smoothTime, dt);
            state.p = r.value;
            state.v = r.velocity;
            if (Math.abs(state.p - state.target) < settleEpsilon) {
                state.p = state.target;
                state.v = 0;
            }
            if (state.p < settleEpsilon) state.spin = wrapAngle(state.spin + rotationSpeed * dt);
            state.sim = activeSimFor(state.desired, state.p, settleEpsilon);
        },
        run(seconds) {
            for (let i = 0; i < Math.round(seconds / FRAME); i++) this.frame();
        }
    };
}

test('連按 20 下：目標永遠等於按壓次數的奇偶，不會有按鍵被吞掉', () => {
    const h = createHarness();
    for (let i = 1; i <= 20; i++) {
        h.toggle();
        // 模擬「上一段還沒跑完就再按」——每下之間只過 2 幀
        h.frame();
        h.frame();
        assert.equal(h.state.target, i % 2 === 1 ? 1 : 0, `第 ${i} 下按壓未生效`);
        assert.equal(h.state.desired, i % 2 === 1 ? 'logo' : 'rose');
    }
    // 偶數次連按後應回到玫瑰，且能真的走完
    h.run(3);
    assert.equal(h.state.p, 0);
    assert.equal(h.state.sim, 'rose');
});

test('連按後仍會收斂到最後一次意圖（不會卡在中間）', () => {
    const h = createHarness();
    for (let i = 0; i < 7; i++) { h.toggle(); h.frame(); } // 奇數次 → 應停在 LOGO
    h.run(3);
    assert.equal(h.state.desired, 'logo');
    assert.equal(h.state.p, 1);
    assert.equal(h.state.sim, 'morph');
});

test('轉場中途反轉：速度連續、無頓挫、正確回頭', () => {
    const h = createHarness();
    h.toggle();
    h.run(0.5); // 走到一半
    const midProgress = h.state.p;
    const midVelocity = h.state.v;
    assert.ok(midProgress > 0.2 && midProgress < 0.95, `中途進度應在區間內，實際 ${midProgress}`);
    assert.ok(midVelocity > 0, '往 LOGO 去時速度應為正');

    h.toggle(); // 中途反向
    h.frame();
    // 速度不得瞬間翻向（臨界阻尼保有慣性），仍應為正但開始衰減
    assert.ok(h.state.v < midVelocity, '反轉後速度應開始衰減');
    h.run(3);
    assert.equal(h.state.p, 0, '反轉後應完全回到玫瑰');
    assert.equal(h.state.sim, 'rose');
});

test('約 1.2 秒完成形變且不衝過頭', () => {
    let p = 0, v = 0, t = 0, maxP = 0, t95 = null;
    for (let i = 0; i < 240; i++) {
        const r = smoothDamp(p, 1, v, MORPH_SETTINGS.smoothTime, FRAME);
        p = r.value; v = r.velocity; t += FRAME;
        maxP = Math.max(maxP, p);
        if (t95 === null && p >= 0.95) t95 = t;
    }
    assert.ok(t95 !== null && t95 < 1.2, `95% 應在 1.2 秒內達成，實際 ${t95}`);
    assert.ok(maxP <= 1 + 1e-9, `不得衝過頭，實際峰值 ${maxP}`);
    assert.ok(Math.abs(1 - p) < MORPH_SETTINGS.settleEpsilon, '最終應收斂至目標');
});

test('顯示中的模擬：去程立即換手、回程等粒子落定才換回', () => {
    const eps = MORPH_SETTINGS.settleEpsilon;
    // 按下往 LOGO 的當幀就要切到 morph（即使 p 還是 0）
    assert.equal(activeSimFor('logo', 0, eps), 'morph');
    assert.equal(activeSimFor('logo', 1, eps), 'morph');
    // 回程途中仍是 morph，直到 p 落回 epsilon 內才換回 rose
    assert.equal(activeSimFor('rose', 0.5, eps), 'morph');
    assert.equal(activeSimFor('rose', eps / 2, eps), 'rose');
    assert.equal(activeSimFor('rose', 0, eps), 'rose');
});

test('自轉：待機時累積、LOGO 時精確歸零、可逆', () => {
    const h = createHarness();
    h.run(2); // 玫瑰待機自轉
    const spun = h.state.spin;
    assert.ok(spun > 0, '待機時應持續自轉');

    h.toggle();
    h.run(3);
    assert.equal(h.state.p, 1);
    // shader 取用的角度 = spin × (1 - p)，p=1 時精確為 0 → LOGO 正面靜止
    assert.equal(h.state.spin * (1 - h.state.p), 0);
    assert.equal(h.state.spin, spun, '轉場期間 spin 必須凍結，避免回繞跳變');

    h.toggle();
    h.run(3);
    assert.equal(h.state.p, 0);
    assert.ok(h.state.spin >= spun, '切回玫瑰後應從原角度續轉');
});

test('角度歸一化以 2π 為週期，視覺等價', () => {
    assert.ok(Math.abs(wrapAngle(Math.PI * 2 + 0.3) - 0.3) < 1e-12);
    assert.ok(Math.abs(wrapAngle(Math.PI * 10 + 0.3) - 0.3) < 1e-9);
    for (const a of [0.3, 3.0, 12.7, -8.4, 100]) {
        const w = wrapAngle(a);
        assert.ok(w > -Math.PI - 1e-12 && w <= Math.PI + 1e-12, `${a} → ${w} 超出範圍`);
        assert.ok(Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9, '歸一化不得改變視覺角度');
        assert.ok(Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9, '歸一化不得改變視覺角度');
    }
});

test('等亮度換算：粒子數變多時單顆縮小', () => {
    const big = equivalentPointSize(2.0, 58000, 262000);
    assert.ok(big < 2.0 && big > 0.5);
    // 亮度 ≈ 數量 × 大小² 應守恆
    assert.ok(Math.abs(58000 * 2.0 ** 2 - 262000 * big ** 2) < 1e-6);
    assert.equal(equivalentPointSize(2.0, 0, 100), 2.0, '缺少計數時應原樣返回');
});

test('形變目標與插值', () => {
    assert.equal(progressTargetFor('logo'), 1);
    assert.equal(progressTargetFor('rose'), 0);
    assert.equal(lerp(1.2, 0.46, 0), 1.2);
    assert.equal(lerp(1.2, 0.46, 1), 0.46);
});
