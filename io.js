// io.js - I/O & VJ Performance (狀態機與現場交互 - 婚禮特製簡化版)
import { getModeConfig } from './modes.js?v=20260621_wedding';
import { getParticleSettings } from './particleSettings.js?v=20260621_wedding';

const progressSlider = document.getElementById('uProgress');
const cameraModeSelect = document.getElementById('cameraMode');
const fullscreenButton = document.getElementById('enable-fullscreen');
const consoleToggleBtn = document.getElementById('console-toggle');
const vjConsole = document.getElementById('vj-console');
const btnRose = document.getElementById('btnRose');
const btnLogo = document.getElementById('btnLogo');

let currentImageUrl = 'public/papa_meilland_rose/scene.gltf';
let currentLogoUrl = 'public/logo.png';
let currentParticleSettings = getParticleSettings(1); // 1 = highest quality / density
let rebuildScene = () => {};
let progressTween = null;

export const getCurrentImageUrl = () => currentImageUrl;

// State machine with locked optimal parameters aligned with screenshots
export const AppState = {
    uProgress: 0,
    targetProgress: 0,
    cameraMode: 'auto',
    vectorFieldMode: 6, // Logo Morph
    isHandTrackingActive: false,
    logoScale: 0.6,      // base scale, dynamically lerped to 2.0 in gpgpu.js
    fieldIntensity: 0.0, // 0.0 = no explosion force
    turbulence: 0.0,     // 0.0 = no turbulence
    returnForce: 1.0,    // 1.0 = strong return force
    pointSize: 0.8       // 0.8 = particle brightness
};

// Easing function for smooth input
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

export async function initIO({ triggerRebuild } = {}) {
    if (typeof triggerRebuild === 'function') {
        rebuildScene = triggerRebuild;
    }

    // 1. Progress Slider Manual Control
    if (progressSlider) {
        progressSlider.addEventListener('input', (e) => {
            if (progressTween) {
                progressTween.kill();
                progressTween = null;
            }
            AppState.targetProgress = parseFloat(e.target.value);
        });
    }

    // 2. Camera Mode Select
    if (cameraModeSelect) {
        cameraModeSelect.addEventListener('change', (e) => {
            AppState.cameraMode = e.target.value;
        });
    }

    // 3. Smooth Auto-Transition Buttons via GSAP
    if (btnRose) {
        btnRose.addEventListener('click', () => {
            if (progressTween) progressTween.kill();
            progressTween = gsap.to(AppState, {
                targetProgress: 0.0,
                duration: 4.0,
                ease: "power1.inOut",
                onUpdate: () => {
                    if (progressSlider) progressSlider.value = AppState.targetProgress;
                }
            });
        });
    }

    if (btnLogo) {
        btnLogo.addEventListener('click', () => {
            if (progressTween) progressTween.kill();
            progressTween = gsap.to(AppState, {
                targetProgress: 1.0,
                duration: 4.0,
                ease: "power1.inOut",
                onUpdate: () => {
                    if (progressSlider) progressSlider.value = AppState.targetProgress;
                }
            });
        });
    }

    // 4. Fullscreen Button
    if (fullscreenButton) {
        fullscreenButton.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.body.requestFullscreen().catch(err => {
                    console.log(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // 5. Console Toggle Button
    if (consoleToggleBtn && vjConsole) {
        consoleToggleBtn.addEventListener('click', () => {
            vjConsole.classList.toggle('collapsed');
            if (vjConsole.classList.contains('collapsed')) {
                consoleToggleBtn.innerText = '▲ 顯示面板';
            } else {
                consoleToggleBtn.innerText = '▼ 隱藏面板';
            }
        });
    }
}

// Update loop called by main.js
export function updateIO(deltaTime) {
    // Smoothly interpolate current progress towards target progress
    AppState.uProgress = lerp(AppState.uProgress, AppState.targetProgress, 5.0 * deltaTime);
}
