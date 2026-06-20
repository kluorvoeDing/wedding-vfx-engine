// io.js - I/O & VJ Performance (狀態機與現場交互 - 婚禮特製簡化版)
import { getModeConfig } from './modes.js?v=20260621_wedding_v2';
import { getParticleSettings } from './particleSettings.js?v=20260621_wedding_v2';

const progressSlider = document.getElementById('uProgress');
const cameraModeSelect = document.getElementById('cameraMode');
const fullscreenButton = document.getElementById('enable-fullscreen');
const consoleToggleBtn = document.getElementById('console-toggle');
const vjConsole = document.getElementById('vj-console');
const btnRose = document.getElementById('btnRose');
const btnLogo = document.getElementById('btnLogo');
const particleDensityInput = document.getElementById('particleDensity');
const logoScaleInput = document.getElementById('logoScale');
const pointSizeInput = document.getElementById('pointSize');

let currentImageUrl = 'public/papa_meilland_rose/scene.gltf';
let currentLogoUrl = 'public/logo.png';
// Default state is Rose, which uses density 4 (60,000 particles)
let currentParticleSettings = getParticleSettings(4);
let rebuildScene = () => {};
let progressTween = null;

export const getCurrentImageUrl = () => currentImageUrl;

// State machine with locked optimal parameters aligned with screenshots
// Rose defaults: scale = 1.2, pointSize = 1.35
export const AppState = {
    uProgress: 0,
    targetProgress: 0,
    cameraMode: 'auto',
    vectorFieldMode: 6,   // Logo Morph
    isHandTrackingActive: false,
    logoScale: 1.2,       // Rose default
    fieldIntensity: 0.0,  // 0.0 = no explosion force
    turbulence: 0.0,      // 0.0 = no turbulence
    returnForce: 1.0,     // 1.0 = strong return force
    pointSize: 1.35       // Rose default
};

// Easing function for smooth input
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

export async function initIO({ triggerRebuild } = {}) {
    if (typeof triggerRebuild === 'function') {
        rebuildScene = triggerRebuild;
    }

    // Set initial values on inputs to match Rose defaults
    if (particleDensityInput) particleDensityInput.value = 4;
    if (logoScaleInput) logoScaleInput.value = 1.2;
    if (pointSizeInput) pointSizeInput.value = 1.35;

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
            
            // Animate targetProgress, logoScale, and pointSize back to Rose defaults
            progressTween = gsap.to(AppState, {
                targetProgress: 0.0,
                logoScale: 1.2,
                pointSize: 1.35,
                duration: 4.0,
                ease: "power1.inOut",
                onUpdate: () => {
                    if (progressSlider) progressSlider.value = AppState.targetProgress;
                    if (logoScaleInput) logoScaleInput.value = AppState.logoScale;
                    if (pointSizeInput) pointSizeInput.value = AppState.pointSize;
                },
                onComplete: async () => {
                    // Rebuild to Rose density (4) after transition finishes
                    if (particleDensityInput && parseInt(particleDensityInput.value) !== 4) {
                        particleDensityInput.value = 4;
                        currentParticleSettings = getParticleSettings(4);
                        await rebuildScene(currentImageUrl, {
                            ...currentParticleSettings,
                            targetImageUrl: currentLogoUrl
                        });
                    }
                }
            });
        });
    }

    if (btnLogo) {
        btnLogo.addEventListener('click', async () => {
            if (progressTween) progressTween.kill();
            
            // Rebuild to LOGO density (1) first if it's not already
            if (particleDensityInput && parseInt(particleDensityInput.value) !== 1) {
                particleDensityInput.value = 1;
                currentParticleSettings = getParticleSettings(1);
                await rebuildScene(currentImageUrl, {
                    ...currentParticleSettings,
                    targetImageUrl: currentLogoUrl
                });
            }

            // Animate targetProgress, logoScale, and pointSize to LOGO defaults
            progressTween = gsap.to(AppState, {
                targetProgress: 1.0,
                logoScale: 0.4,
                pointSize: 0.43,
                duration: 4.0,
                ease: "power1.inOut",
                onUpdate: () => {
                    if (progressSlider) progressSlider.value = AppState.targetProgress;
                    if (logoScaleInput) logoScaleInput.value = AppState.logoScale;
                    if (pointSizeInput) pointSizeInput.value = AppState.pointSize;
                }
            });
        });
    }

    // 4. Parameter Adjustment Event Listeners
    if (particleDensityInput) {
        particleDensityInput.addEventListener('change', (e) => {
            currentParticleSettings = getParticleSettings(e.target.value);
            rebuildScene(currentImageUrl, {
                ...currentParticleSettings,
                targetImageUrl: currentLogoUrl
            });
        });
    }

    if (logoScaleInput) {
        logoScaleInput.addEventListener('input', (e) => {
            if (progressTween) {
                progressTween.kill();
                progressTween = null;
            }
            AppState.logoScale = parseFloat(e.target.value);
        });
    }

    if (pointSizeInput) {
        pointSizeInput.addEventListener('input', (e) => {
            if (progressTween) {
                progressTween.kill();
                progressTween = null;
            }
            AppState.pointSize = parseFloat(e.target.value);
        });
    }

    // 5. Fullscreen Button
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

    // 6. Console Toggle Button
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
