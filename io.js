// io.js - 婚禮現場控制 (鍵盤快捷鍵狀態機: 空白鍵切換玫瑰/LOGO, F 切換全螢幕)
//
// 切換是「隨時可反轉」的連續動畫：按鍵只改變目標值，實際位移交給每幀的
// updateIO 追隨。因此這裡沒有 async / await / 忙碌鎖 / GSAP tween ——
// 架構上不存在可以卡住按鍵的東西，連按或中途反轉都必定即時生效。
import { getParticleSettings } from './particleSettings.js?v=20260819_wedding_v9';
import { setActiveParticles, getSimStats } from './gpgpu.js?v=20260819_wedding_v9';
import {
    PLAYBACK_SETTINGS,
    createAutoRotateController,
    oppositeDisplayState
} from './playbackSettings.js?v=20260819_wedding_v9';
import {
    MORPH_SETTINGS,
    progressTargetFor,
    smoothDamp,
    activeSimFor,
    wrapAngle,
    lerp,
    equivalentPointSize
} from './morphController.js?v=20260819_wedding_v9';

const MODEL_URL = 'public/papa_meilland_rose/scene.gltf';
const LOGO_URL = 'public/logo.png';

// 鎖定的最佳參數
const ROSE = { density: 5, scale: 1.2, pointSize: 2.0 };
const LOGO = { density: 1, scale: 0.46, pointSize: 0.55 };
const KEY_DEBOUNCE_MS = 150; // 只擋機械式重複觸發；正常連按每一下都算數

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
let desiredState = 'rose';
let activeSim = 'rose';
let progressVelocity = 0;
let spinAngle = 0;
let lastKeyAt = -Infinity;
// morph 模擬停在玫瑰姿態時的等亮度粒子大小 (兩套模擬互換時亮度不跳動)
let morphPointSizeAtRose = ROSE.pointSize;

const autoRotateController = createAutoRotateController({
    onRotate: () => toggleState({ resetAutoTimer: false }),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (timer) => window.clearTimeout(timer)
});

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
        const roseCount = gpuData.roseVisibleCount || 0;
        const morphCount = gpuData.morphVisibleCount || 0;
        morphPointSizeAtRose = equivalentPointSize(ROSE.pointSize, roseCount, morphCount);
    }
    sceneReady = true;
}

// 按鍵只做一件事：改變目標。沒有任何路徑可以擋住它。
function toggleState({ resetAutoTimer = true } = {}) {
    desiredState = oppositeDisplayState(desiredState);
    AppState.targetProgress = progressTargetFor(desiredState);
    if (resetAutoTimer) autoRotateController.schedule();
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
            const now = performance.now();
            if (now - lastKeyAt < KEY_DEBOUNCE_MS) return;
            lastKeyAt = now;
            toggleState();
        } else if (e.code === 'KeyF') {
            toggleFullscreen();
        }
    });

    autoRotateController.schedule();

    // 現場救援用除錯掛鉤 (可於 DevTools console 手動觸發切換)
    window.__vfx = {
        AppState,
        PlaybackSettings: PLAYBACK_SETTINGS,
        MorphSettings: MORPH_SETTINGS,
        toggleState,
        getDesiredState: () => desiredState,
        getActiveSim: () => activeSim,
        simStats: (renderer) => getSimStats(renderer),
        cancelAutoRotate: () => autoRotateController.cancel(),
        version: '20260819_wedding_v9'
    };
}

// Update loop called by main.js
export function updateIO(deltaTime) {
    if (!sceneReady || !(deltaTime > 0)) return;

    const { smoothTime, settleEpsilon, rotationSpeed } = MORPH_SETTINGS;
    const target = AppState.targetProgress;

    const stepped = smoothDamp(AppState.uProgress, target, progressVelocity, smoothTime, deltaTime);
    AppState.uProgress = stepped.value;
    progressVelocity = stepped.velocity;

    if (Math.abs(AppState.uProgress - target) < settleEpsilon) {
        AppState.uProgress = target;
        progressVelocity = 0;
    }

    const p = AppState.uProgress;

    // 自轉：只在玫瑰完全待機時累積。轉場期間 spinAngle 凍結，因此不可能發生
    // 角度回繞造成的跳變；p=1 時角度精確為 0，保證 LOGO 正面靜止。
    // 反向切回時角度會平順長回原值再續轉，倒轉幅度恆定 ≤ 半圈。
    if (p < settleEpsilon) {
        spinAngle = wrapAngle(spinAngle + rotationSpeed * deltaTime);
    }
    AppState.rotationAngle = spinAngle * (1 - p);

    // 顯示中的模擬與視覺參數，全部由 p 連續推導 —— 沒有分段排程，故可隨時反轉
    const nextSim = activeSimFor(desiredState, p, settleEpsilon);
    if (nextSim !== activeSim) {
        setActiveParticles(nextSim);
        activeSim = nextSim;
    }

    if (activeSim === 'rose') {
        AppState.logoScale = ROSE.scale;
        AppState.pointSize = ROSE.pointSize;
    } else {
        AppState.logoScale = lerp(ROSE.scale, LOGO.scale, p);
        AppState.pointSize = lerp(morphPointSizeAtRose, LOGO.pointSize, p);
    }
}
