// main.js - 主控與後期管線
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';

import { initGPGPU, updateGPGPU } from './gpgpu.js?v=20260818_wedding_v8';
import { initCamera, updateCamera, onWindowResize as updateCameraResize } from './camera.js?v=20260818_wedding_v8';
import { initIO, updateIO, AppState, getBuildConfig, markSceneReady } from './io.js?v=20260818_wedding_v8';

let scene, renderer, composer, camera;
let boundingBox;
let lastTime = 0;

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
    await initIO();

    // 4. GPGPU Data Pipeline Setup: 一次建好 rose + morph 兩套常駐模擬
    const gpuData = await initGPGPU(renderer, scene, getBuildConfig());
    boundingBox = gpuData.boundingBox;
    markSceneReady(gpuData);

    // 現場診斷用：讓 __vfx.simStats(__vfx.renderer) 能讀回粒子實際座標
    if (window.__vfx) {
        window.__vfx.renderer = renderer;
        window.__vfx.boundingBox = boundingBox;
    }

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

// Kick off
init();
