// io.js - 婚禮現場控制 (鍵盤快捷鍵狀態機: 空白鍵切換玫瑰/LOGO, F 切換全螢幕)
import { getParticleSettings } from './particleSettings.js?v=20260705_wedding_v6';
import { setActiveParticles } from './gpgpu.js?v=20260705_wedding_v6';

const MODEL_URL = 'public/papa_meilland_rose/scene.gltf';
const LOGO_URL = 'public/logo.png';

// 鎖定的最佳參數
const ROSE = { density: 5, scale: 1.2, pointSize: 2.0 };
const LOGO = { density: 1, scale: 0.46, pointSize: 0.55 };
const TRANSITION_SECS = 2.0;
const TRANSITION_EASE = 'power2.out'; // 快出慢收: 按下瞬間就看得到動靜
const ROTATION_SPEED = 0.15; // rad/s
const PROGRESS_GAIN = 12.0;  // uProgress 追隨速度 (越高越即時)

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
    returnForce: 2.0 // 較強的貼合力,縮短轉場尾段的沉降時間
};

let sceneReady = false;
let isBusy = false;
let currentState = 'rose';
let roseCount = 0;
let morphCount = 0;

export function getBuildConfig() {
    return {
        modelUrl: MODEL_URL,
        logoUrl: LOGO_URL,
        rose: getParticleSettings(ROSE.density),
        morph: getParticleSettings(LOGO.density)
    };
}

export function markSceneReady(gpuData) {
    if (gpuData) {
        roseCount = gpuData.roseVisibleCount || 0;
        morphCount = gpuData.morphVisibleCount || 0;
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
    // 瞬間切到高密度形變系統 (常駐同步運行,零重建),等亮度換算避免亮度跳動
    setActiveParticles('morph');
    AppState.pointSize = equivalentPointSize(ROSE.pointSize, roseCount, morphCount);

    normalizeRotation();
    await gsap.to(AppState, {
        targetProgress: 1.0,
        logoScale: LOGO.scale,
        pointSize: LOGO.pointSize,
        rotationAngle: 0,
        duration: TRANSITION_SECS,
        ease: TRANSITION_EASE
    });
}

async function transitionToRose() {
    const arrivalPointSize = equivalentPointSize(ROSE.pointSize, roseCount, morphCount || roseCount);
    await gsap.to(AppState, {
        targetProgress: 0.0,
        logoScale: ROSE.scale,
        pointSize: arrivalPointSize,
        duration: TRANSITION_SECS,
        ease: TRANSITION_EASE
    });

    // 到站後瞬間切回待機系統 (它全程停在玫瑰形狀,無縫接手)
    setActiveParticles('rose');
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

export async function initIO() {
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
    window.__vfx = { AppState, toggleState, version: '20260705_wedding_v6' };
}

// Update loop called by main.js
export function updateIO(deltaTime) {
    // Clamp 插值量,分頁休眠喚醒後的大 delta 不會讓 uProgress 衝出範圍
    const amt = Math.min(1, PROGRESS_GAIN * deltaTime);
    AppState.uProgress = lerp(AppState.uProgress, AppState.targetProgress, amt);

    // 玫瑰自轉: CPU 累積角度,隨形變進度自然減速停止
    AppState.rotationAngle += ROTATION_SPEED * deltaTime * (1 - AppState.uProgress);
}
