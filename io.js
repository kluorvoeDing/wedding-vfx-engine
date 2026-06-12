// io.js - I/O & VJ Performance (狀態機與現場交互)
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3';
import { initAudio, AudioState } from './audio.js';
import { triggerRebuild } from './main.js';

let handLandmarker = undefined;
let webcamRunning = false;
const video = document.getElementById('webcam-video');
const webcamContainer = document.getElementById('webcam-container');
const enableWebcamButton = document.getElementById('enable-webcam');
const progressSlider = document.getElementById('uProgress');
const cameraModeSelect = document.getElementById('cameraMode');
const vectorFieldModeSelect = document.getElementById('vectorFieldMode');
const enableMicButton = document.getElementById('enable-mic');
const uploadPhotoInput = document.getElementById('uploadPhoto');
const particleDensityInput = document.getElementById('particleDensity');
const audioSensitivityInput = document.getElementById('audioSensitivity');
const fullscreenButton = document.getElementById('enable-fullscreen');
const consoleToggleBtn = document.getElementById('console-toggle');
const vjConsole = document.getElementById('vj-console');

let currentImageUrl = 'public/photo.png';
let currentStepSize = 1;

// State machine
export const AppState = {
    uProgress: 0,
    targetProgress: 0,
    cameraMode: 'auto',
    vectorFieldMode: 0, // 0: Curl, 1: Reverse, 2: Polar, 3: Fracture
    isHandTrackingActive: false
};

// Easing function for smooth input (Bezier-like interpolation)
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

export async function initIO() {
    // 1. Setup VJ Console listeners
    progressSlider.addEventListener('input', (e) => {
        if (!AppState.isHandTrackingActive) {
            AppState.targetProgress = parseFloat(e.target.value);
        }
    });

    cameraModeSelect.addEventListener('change', (e) => {
        AppState.cameraMode = e.target.value;
    });

    vectorFieldModeSelect.addEventListener('change', (e) => {
        AppState.vectorFieldMode = parseInt(e.target.value);
    });

    // Handle photo upload
    uploadPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentImageUrl = event.target.result;
                triggerRebuild(currentImageUrl, currentStepSize);
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle density change
    particleDensityInput.addEventListener('change', (e) => {
        currentStepSize = parseInt(e.target.value);
        triggerRebuild(currentImageUrl, currentStepSize);
    });

    // Handle audio sensitivity
    audioSensitivityInput.addEventListener('input', (e) => {
        AudioState.sensitivity = parseFloat(e.target.value);
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
            consoleToggleBtn.innerText = '▲ Show';
        } else {
            consoleToggleBtn.innerText = '▼ Hide';
        }
    });

    enableMicButton.addEventListener('click', async () => {
        if (!AudioState.isEnabled) {
            await initAudio();
            if (AudioState.isEnabled) {
                enableMicButton.innerText = "Disable Microphone";
                enableMicButton.style.background = "#4CAF50";
            }
        } else {
            // Simplistic toggle logic
            AudioState.isEnabled = false;
            enableMicButton.innerText = "Enable Microphone (Audio React)";
            enableMicButton.style.background = "#e91e63";
        }
    });

    // 2. Setup MediaPipe
    try {
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
        enableWebcamButton.innerText = "Enable Hand Tracking";
        webcamContainer.style.display = "none";
        AppState.isHandTrackingActive = false;
        
        // Stop camera
        const stream = video.srcObject;
        if(stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
    } else {
        webcamRunning = true;
        enableWebcamButton.innerText = "Disable Hand Tracking";
        webcamContainer.style.display = "block";
        AppState.isHandTrackingActive = true;

        const constraints = { video: { facingMode: "user" } };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
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
