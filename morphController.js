// morphController.js - 形變狀態的純函式核心 (無 DOM、無 GSAP，可單元測試)
//
// 設計要點：切換必須是「隨時可反轉」的連續動畫，而不是一段不可中斷的排程。
// 因此這裡完全不使用 promise / 鎖 / tween —— 架構上不存在可以卡死的東西。

export const MORPH_SETTINGS = Object.freeze({
    smoothTime: 0.40,     // 臨界阻尼平滑時間 → 約 1.0s 成形、1.3s 收斂完成
    settleEpsilon: 0.002, // 差距小於此值即視為完全抵達
    rotationSpeed: 0.15   // 玫瑰待機自轉角速度 (rad/s)
});

export function progressTargetFor(state) {
    return state === 'logo' ? 1 : 0;
}

// 臨界阻尼平滑 (Game Programming Gems)。相較於指數 lerp，它的優點是
// 緩入緩出、總時長可控，且中途改變 target 時速度連續 —— 反轉不會頓挫。
export function smoothDamp(current, target, velocity, smoothTime, deltaTime) {
    const st = Math.max(0.0001, smoothTime);
    const omega = 2 / st;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

    const change = current - target;
    const temp = (velocity + omega * change) * deltaTime;
    let nextVelocity = (velocity - omega * temp) * exp;
    let value = target + (change + temp) * exp;

    // 防止衝過頭 (overshoot)：跨過目標就直接停在目標上
    if ((target - current > 0) === (value > target)) {
        value = target;
        nextVelocity = deltaTime > 0 ? (value - target) / deltaTime : 0;
    }

    return { value, velocity: nextVelocity };
}

// 決定當前該顯示哪一套常駐模擬。
// 往 LOGO 去時立刻切到 morph；回程要等粒子真的落回玫瑰姿態才換手，避免跳動。
export function activeSimFor(desiredState, uProgress, epsilon = MORPH_SETTINGS.settleEpsilon) {
    return (desiredState === 'logo' || uProgress > epsilon) ? 'morph' : 'rose';
}

// 收斂到 (-π, π]。旋轉以 2π 為週期，換算後視覺完全相同，故可安全歸一化。
export function wrapAngle(angle) {
    const TWO_PI = Math.PI * 2;
    let a = angle % TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    else if (a <= -Math.PI) a += TWO_PI;
    return a;
}

export function lerp(start, end, amount) {
    return (1 - amount) * start + amount * end;
}

// 等亮度換算：亮度 ≈ 粒子數 × 大小²，讓兩套模擬互換時亮度不跳動。
export function equivalentPointSize(size, fromCount, toCount) {
    if (!fromCount || !toCount) return size;
    return size * Math.sqrt(fromCount / toCount);
}
