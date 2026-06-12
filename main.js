// main.js - 主控與後期管線
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

import { initGPGPU, updateGPGPU } from './gpgpu.js';
import { initCamera, updateCamera, onWindowResize as updateCameraResize } from './camera.js';
import { initIO, updateIO, AppState } from './io.js';
import { updateAudio, AudioState } from './audio.js';

let scene, renderer, composer, camera;
let boundingBox;
let lastTime = 0;
let frames = 0;
let fpsTimer = 0;

const fpsCounter = document.getElementById('fps-counter');
const particleCounter = document.getElementById('particle-count');

async function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    // Remove default OrbitControls per instructions, handled by camera.js
    
    camera = initCamera(scene);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 2. Post-Processing Pipeline
    composer = new EffectComposer(renderer);
    
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Afterimage Pass (history frame sampling feedback)
    const afterimagePass = new AfterimagePass();
    afterimagePass.uniforms['damp'].value = 0.96; // Increase for longer glowing trails
    composer.addPass(afterimagePass);

    // Custom Unreal Bloom
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.05;
    bloomPass.strength = 2.0; // Extremely high intensity bloom
    bloomPass.radius = 0.8;
    composer.addPass(bloomPass);

    // 3. I/O & MediaPipe Setup
    await initIO();

    // 4. GPGPU Data Pipeline Setup
    // Initialize GPGPU which parses GLTF and sets up textures
    const gpuData = await initGPGPU(renderer, scene);
    particleCounter.innerText = `PARTICLES: ${gpuData.pointsCount.toLocaleString()}`;
    boundingBox = gpuData.boundingBox;

    // Window resize
    window.addEventListener('resize', onWindowResize);

    // Start loop
    requestAnimationFrame(animate);
}

function onWindowResize() {
    updateCameraResize();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function animate(time) {
    requestAnimationFrame(animate);

    const timeSec = time * 0.001;
    const deltaTime = timeSec - lastTime;
    lastTime = timeSec;

    // Calculate FPS
    frames++;
    if (time - fpsTimer > 1000) {
        fpsCounter.innerText = `FPS: ${frames}`;
        frames = 0;
        fpsTimer = time;
    }

    // 1. Update I/O (Smooth Progress)
    updateIO(deltaTime);

    // 2. Update Camera (GSAP + Frustum Fitting)
    updateCamera(deltaTime, AppState, boundingBox);

    // 3. Update Audio Reactivity
    updateAudio();

    // 4. Update GPGPU (Compute shaders)
    updateGPGPU(timeSec, AppState, AudioState.audioPulse);

    // 4. Render with Post-Processing
    composer.render(deltaTime);
}

export async function triggerRebuild(imageUrl, stepSize) {
    const gpuData = await initGPGPU(renderer, scene, imageUrl, stepSize);
    particleCounter.innerText = `PARTICLES: ${gpuData.pointsCount.toLocaleString()}`;
    boundingBox = gpuData.boundingBox;
}

// Kick off
init();
