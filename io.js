// io.js - I/O & VJ Performance (狀態機與現場交互)
import { initAudio, stopAudio, AudioState } from './audio.js?v=20260616c';
import { MODE_CONFIGS, getModeConfig } from './modes.js?v=20260616c';
import { getParticleSettings } from './particleSettings.js?v=20260616c';

let handLandmarker = undefined;
let webcamRunning = false;
let micStream = null;
let webcamStream = null;
const video = document.getElementById('webcam-video');
const webcamContainer = document.getElementById('webcam-container');
const enableWebcamButton = document.getElementById('enable-webcam');
const progressSlider = document.getElementById('uProgress');
const cameraModeSelect = document.getElementById('cameraMode');
const vectorFieldModeSelect = document.getElementById('vectorFieldMode');
const enableMicButton = document.getElementById('enable-mic');
const uploadPhotoInput = document.getElementById('uploadPhoto');
const uploadLogoInput = document.getElementById('uploadLogo');
const particleDensityInput = document.getElementById('particleDensity');
const audioSensitivityInput = document.getElementById('audioSensitivity');
const logoScaleInput = document.getElementById('logoScale');
const modeIntensityInput = document.getElementById('modeIntensity');
const modeTurbulenceInput = document.getElementById('modeTurbulence');
const returnForceInput = document.getElementById('returnForce');
const pointSizeInput = document.getElementById('pointSize');
const fullscreenButton = document.getElementById('enable-fullscreen');
const consoleToggleBtn = document.getElementById('console-toggle');
const vjConsole = document.getElementById('vj-console');

let currentImageUrl = 'public/papa_meilland_rose/scene.gltf';
let currentLogoUrl = 'public/logo.png';
let currentParticleSettings = getParticleSettings(1);
const defaultMode = getModeConfig(0);
let rebuildScene = () => {};

// State machine
export const AppState = {
    uProgress: 0,
    targetProgress: 0,
    cameraMode: 'auto',
    vectorFieldMode: defaultMode.shaderMode,
    isHandTrackingActive: false,
    logoScale: 0.6,
    fieldIntensity: defaultMode.params.intensity,
    turbulence: defaultMode.params.turbulence,
    returnForce: defaultMode.params.returnForce,
    pointSize: defaultMode.params.pointSize
};

// Easing function for smooth input (Bezier-like interpolation)
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

function getRebuildOptions() {
    return {
        ...currentParticleSettings,
        targetImageUrl: currentLogoUrl
    };
}

function triggerCurrentRebuild() {
    rebuildScene(currentImageUrl, getRebuildOptions());
}

function syncModeControls(modeConfig) {
    modeIntensityInput.value = modeConfig.params.intensity;
    modeTurbulenceInput.value = modeConfig.params.turbulence;
    returnForceInput.value = modeConfig.params.returnForce;
    pointSizeInput.value = modeConfig.params.pointSize;
}

function applyModeConfig(modeId, updateProgress = true) {
    const modeConfig = getModeConfig(modeId);
    AppState.vectorFieldMode = modeConfig.shaderMode;
    AppState.fieldIntensity = modeConfig.params.intensity;
    AppState.turbulence = modeConfig.params.turbulence;
    AppState.returnForce = modeConfig.params.returnForce;
    AppState.pointSize = modeConfig.params.pointSize;
    syncModeControls(modeConfig);

    if (updateProgress && !AppState.isHandTrackingActive) {
        AppState.targetProgress = modeConfig.targetProgress;
        progressSlider.value = modeConfig.targetProgress;
    }
}

export async function initIO({ triggerRebuild } = {}) {
    if (typeof triggerRebuild === 'function') {
        rebuildScene = triggerRebuild;
    }

    vectorFieldModeSelect.innerHTML = MODE_CONFIGS.map((mode) => (
        `<option value="${mode.id}">${mode.label}</option>`
    )).join('');
    applyModeConfig(defaultMode.id, false);

    // 1. Setup VJ Console listeners
    progressSlider.addEventListener('input', (e) => {
        if (!AppState.isHandTrackingActive) {
            AppState.targetProgress = parseFloat(e.target.value);
        }
    });

    cameraModeSelect.addEventListener('change', (e) => {
        AppState.cameraMode = e.target.value;
    });

    const handleModeChange = (e) => {
        applyModeConfig(e.target.value);
    };
    vectorFieldModeSelect.addEventListener('input', handleModeChange);
    vectorFieldModeSelect.addEventListener('change', handleModeChange);

    // Handle photo upload
    uploadPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentImageUrl = event.target.result;
                triggerCurrentRebuild();
            };
            reader.readAsDataURL(file);
        }
    });

    uploadLogoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentLogoUrl = event.target.result;
                triggerCurrentRebuild();
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle density change
    const handleDensityCommit = (e) => {
        currentParticleSettings = getParticleSettings(e.target.value);
        triggerCurrentRebuild();
    };
    particleDensityInput.addEventListener('change', handleDensityCommit);

    // Handle audio sensitivity
    audioSensitivityInput.addEventListener('input', (e) => {
        AudioState.sensitivity = parseFloat(e.target.value);
    });

    // Handle logo scale
    logoScaleInput.addEventListener('input', (e) => {
        AppState.logoScale = parseFloat(e.target.value);
    });

    modeIntensityInput.addEventListener('input', (e) => {
        AppState.fieldIntensity = parseFloat(e.target.value);
    });

    modeTurbulenceInput.addEventListener('input', (e) => {
        AppState.turbulence = parseFloat(e.target.value);
    });

    returnForceInput.addEventListener('input', (e) => {
        AppState.returnForce = parseFloat(e.target.value);
    });

    pointSizeInput.addEventListener('input', (e) => {
        AppState.pointSize = parseFloat(e.target.value);
    });

    // Handle fullscreen
    fullscreenButton.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.body.requestFullscreen().catch(err => {
                console.log(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    // Handle console toggle
    consoleToggleBtn.addEventListener('click', () => {
        vjConsole.classList.toggle('collapsed');
        if (vjConsole.classList.contains('collapsed')) {
            consoleToggleBtn.innerText = '▲ 顯示面板';
        } else {
            consoleToggleBtn.innerText = '▼ 隱藏面板';
        }
    });

    enableMicButton.addEventListener('click', async () => {
        if (!AudioState.isEnabled) {
            micStream = await initAudio();
            if (AudioState.isEnabled) {
                enableMicButton.innerText = "關閉麥克風";
                enableMicButton.style.background = "#4CAF50";
            }
        } else {
            stopAudio();
            micStream = null;
            enableMicButton.innerText = "啟用麥克風 (音樂律動)";
            enableMicButton.style.background = "#e91e63";
        }
    });

    enableWebcamButton.disabled = true;
    enableWebcamButton.innerText = "手勢追蹤載入中";
    initHandTracking();
}

async function initHandTracking() {
    try {
        const { FilesetResolver, HandLandmarker } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3');
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1
        });
        
        enableWebcamButton.addEventListener("click", toggleWebcam);
        enableWebcamButton.disabled = false;
        enableWebcamButton.innerText = "啟用手勢追蹤 (Webcam)";
    } catch (e) {
        console.error("MediaPipe initialization failed:", e);
        enableWebcamButton.innerText = "Hand Tracking Unavailable";
        enableWebcamButton.disabled = true;
    }
}

async function toggleWebcam() {
    if (!handLandmarker) return;

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerText = "啟用手勢追蹤 (Webcam)";
        webcamContainer.style.display = "none";
        AppState.isHandTrackingActive = false;
        
        // Stop camera
        const stream = video.srcObject;
        if(stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
        webcamStream = null;
        video.onloadeddata = null;
    } else {
        webcamRunning = true;
        enableWebcamButton.innerText = "關閉手勢追蹤";
        webcamContainer.style.display = "block";
        AppState.isHandTrackingActive = true;

        const constraints = { video: { facingMode: "user" } };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            webcamStream = stream;
            video.srcObject = stream;
            video.onloadeddata = predictWebcam;
        }).catch((err) => {
            console.error("Webcam access denied or error:", err);
            webcamRunning = false;
            webcamStream = null;
            AppState.isHandTrackingActive = false;
            webcamContainer.style.display = "none";
            enableWebcamButton.innerText = "啟用手勢追蹤 (Webcam)";
        });
    }
}

let lastVideoTime = -1;
async function predictWebcam() {
    if(!webcamRunning) return;

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        let results = handLandmarker.detectForVideo(video, startTimeMs);
        
        if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];
            // Get thumb tip (4) and index finger tip (8)
            const thumbTip = landmarks[4];
            const indexTip = landmarks[8];
            
            // Calculate Euclidean distance (normalized space 0-1)
            const dx = thumbTip.x - indexTip.x;
            const dy = thumbTip.y - indexTip.y;
            const dz = thumbTip.z - indexTip.z;
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Map distance to progress (pinch close = 1.0, pinch open = 0.0)
            // Typical distance range: 0.02 (closed) to 0.2 (open)
            let mappedProgress = 1.0 - Math.min(Math.max((distance - 0.02) / 0.18, 0.0), 1.0);
            
            AppState.targetProgress = mappedProgress;
            progressSlider.value = mappedProgress; // Update UI slider too
        }
    }
    
    requestAnimationFrame(predictWebcam);
}

// Update loop called by main.js
export function updateIO(deltaTime) {
    // Smoothly interpolate current progress towards target progress
    AppState.uProgress = lerp(AppState.uProgress, AppState.targetProgress, 5.0 * deltaTime);
}
