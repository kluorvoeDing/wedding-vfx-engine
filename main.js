// main.js - 主控與後期管線
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

import { initGPGPU, updateGPGPU } from './gpgpu.js?v=20260704_wedding_v5';
import { initCamera, updateCamera, onWindowResize as updateCameraResize } from './camera.js?v=20260704_wedding_v5';
import { initIO, updateIO, AppState, getCurrentImageUrl, getInitialBuildOptions, markSceneReady } from './io.js?v=20260704_wedding_v5';

let scene, renderer, composer, camera;
let boundingBox;
let lastTime = 0;
let rebuildVersion = 0;

async function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = initCamera(scene);

    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    // Cap pixel ratio: bloom + afterimage fill-rate explodes on >2x displays
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    // 3. I/O Setup (keyboard state machine)
    await initIO({ triggerRebuild });

    // 4. GPGPU Data Pipeline Setup (initial build = locked Rose parameters)
    const gpuData = await initGPGPU(renderer, scene, getCurrentImageUrl(), getInitialBuildOptions());
    boundingBox = gpuData.boundingBox;
    markSceneReady(gpuData);

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
    // Clamp dt: rAF pauses (tab switch / display sleep) otherwise produce a huge step
    const deltaTime = Math.min(timeSec - lastTime, 0.05);
    lastTime = timeSec;

    // 1. Update I/O (Smooth Progress + Rotation)
    updateIO(deltaTime);

    // 2. Update Camera (GSAP + Frustum Fitting)
    updateCamera(deltaTime, AppState, boundingBox);

    // 3. Update GPGPU (Compute shaders)
    updateGPGPU(timeSec, AppState);

    // 4. Render with Post-Processing
    composer.render(deltaTime);
}

export async function triggerRebuild(imageUrl, options) {
    const version = ++rebuildVersion;
    const gpuData = await initGPGPU(renderer, scene, imageUrl, options);
    if (version !== rebuildVersion) return null;
    boundingBox = gpuData.boundingBox;
    return gpuData;
}

// Kick off
init();
