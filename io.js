// io.js - 婚禮現場控制 (鍵盤快捷鍵狀態機: 空白鍵切換玫瑰/LOGO, F 切換全螢幕)
import { getParticleSettings } from './particleSettings.js?v=20260704_wedding_v5';

const MODEL_URL = 'public/papa_meilland_rose/scene.gltf';
const LOGO_URL = 'public/logo.png';

// 鎖定的最佳參數
const ROSE = { density: 5, scale: 1.2, pointSize: 2.0 };
const LOGO = { density: 1, scale: 0.46, pointSize: 0.55 };
const TRANSITION_SECS = 4.0;
const ROTATION_SPEED = 0.15; // rad/s

export const AppState = {
    uProgress: 0,
    targetProgress: 0,
    cameraMode: 'auto',
    logoScale: ROSE.scale,
    pointSize: ROSE.pointSize,
    rotationAngle: 0,
    // 轉場中段的流體力場 (velocity shader 的 middleBump 保證靜止時完全無作用)
    fieldIntensity: 0.05,
    turbulence: 0.4,
    returnForce: 1.0
};

let rebuildScene = async () => null;
let sceneReady = false;
let isBusy = false;
let currentState = 'rose';
let roseCount = 0;
let logoCount = 0;

export const getCurrentImageUrl = () => MODEL_URL;

export function getInitialBuildOptions() {
    return { ...getParticleSettings(ROSE.density), targetImageUrl: LOGO_URL };
}

export function markSceneReady(gpuData) {
    if (gpuData && gpuData.pointsCount) {
        roseCount = gpuData.pointsCount;
    }
    sceneReady = true;
}

function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

// 依粒子數量換算等亮度的粒子大小 (亮度 ≈ 數量 × 大小²),讓密度切換瞬間不跳亮度
function equivalentPointSize(size, fromCount, toCount) {
    if (!fromCount || !toCount) return size;
    return size * Math.sqrt(fromCount / toCount);
}

// 把累積的自轉角度收斂到最短路徑 (-π ~ π),轉場時最多只回轉半圈
function normalizeRotation() {
    const TWO_PI = Math.PI * 2;
    let a = AppState.rotationAngle % TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    else if (a < -Math.PI) a += TWO_PI;
    AppState.rotationAngle = a;
}

async function transitionToLogo() {
    // 先以高密度重建 (畫面保留舊粒子直到新資源就緒,不會黑屏)
    const gpuData = await rebuildScene(MODEL_URL, {
        ...getParticleSettings(LOGO.density),
        targetImageUrl: LOGO_URL
    });
    if (gpuData && gpuData.pointsCount) {
        logoCount = gpuData.pointsCount;
        AppState.pointSize = equivalentPointSize(ROSE.pointSize, roseCount, logoCount);
    }

    normalizeRotation();
    await gsap.to(AppState, {
        targetProgress: 1.0,
        logoScale: LOGO.scale,
        pointSize: LOGO.pointSize,
        rotationAngle: 0,
        duration: TRANSITION_SECS,
        ease: 'power1.inOut'
    });
}

async function transitionToRose() {
    // 回程仍是高密度粒子,先過渡到等亮度的大小,重建後再無感切回鎖定值
    const arrivalPointSize = equivalentPointSize(ROSE.pointSize, roseCount, logoCount || roseCount);
    await gsap.to(AppState, {
        targetProgress: 0.0,
        logoScale: ROSE.scale,
        pointSize: arrivalPointSize,
        duration: TRANSITION_SECS,
        ease: 'power1.inOut'
    });

    const gpuData = await rebuildScene(MODEL_URL, {
        ...getParticleSettings(ROSE.density),
        targetImageUrl: LOGO_URL
    });
    if (gpuData && gpuData.pointsCount) {
        roseCount = gpuData.pointsCount;
    }
    AppState.pointSize = ROSE.pointSize;
}

async function toggleState() {
    if (!sceneReady || isBusy) return;
    isBusy = true;
    try {
        if (currentState === 'rose') {
            await transitionToLogo();
            currentState = 'logo';
        } else {
            await transitionToRose();
            currentState = 'rose';
        }
    } catch (err) {
        console.error('[IO] Transition failed:', err);
    } finally {
        isBusy = false;
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

export async function initIO({ triggerRebuild } = {}) {
    if (typeof triggerRebuild === 'function') {
        rebuildScene = triggerRebuild;
    }

    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'Space') {
            e.preventDefault();
            toggleState();
        } else if (e.code === 'KeyF') {
            toggleFullscreen();
        }
    });

    // 現場救援用除錯掛鉤 (可於 DevTools console 手動觸發切換)
    window.__vfx = { AppState, toggleState, version: '20260704_wedding_v5' };
}

// Update loop called by main.js
export function updateIO(deltaTime) {
    // Clamp 插值量,分頁休眠喚醒後的大 delta 不會讓 uProgress 衝出範圍
    const amt = Math.min(1, 5.0 * deltaTime);
    AppState.uProgress = lerp(AppState.uProgress, AppState.targetProgress, amt);

    // 玫瑰自轉: CPU 累積角度,隨形變進度自然減速停止
    // (取代舊的 time * 0.15 反推歸零法 —— 那會依開頁時長回轉 N 圈)
    AppState.rotationAngle += ROTATION_SPEED * deltaTime * (1 - AppState.uProgress);
}
