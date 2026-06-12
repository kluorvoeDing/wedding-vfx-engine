// camera.js - Cinematography Engine (程序化運鏡系統)
import * as THREE from 'three';

let camera;
let focusTarget = new THREE.Vector3(0, 0, 0);
let timeline;
let currentCamPos = new THREE.Vector3(0, 0, 50);

// Parameters for Frustum Fitting
const MIN_DISTANCE = 10;
const MAX_DISTANCE = 150;

export function initCamera(scene) {
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 50);
    
    // Create GSAP closed loop sequences for automatic camera movement
    timeline = gsap.timeline({ repeat: -1, paused: false });
    
    // Gentle breathing and slight panning for 2D images
    timeline.to(currentCamPos, { duration: 15, x: 5, y: 3, z: 45, ease: "sine.inOut" })
            .to(currentCamPos, { duration: 15, x: -5, y: -2, z: 55, ease: "sine.inOut" })
            .to(currentCamPos, { duration: 15, x: 0, y: 0, z: 50, ease: "sine.inOut" });
            
    return camera;
}

export function updateCamera(deltaTime, appState, boundingBox) {
    if (!camera) return;
    
    let targetDistance = 50;

    // Frustum Fitting: dynamically calculate safe distance based on bounding box radius
    if (boundingBox) {
        const radius = boundingBox.getSize(new THREE.Vector3()).length() * 0.5;
        const fov = camera.fov * (Math.PI / 180);
        const aspect = camera.aspect;
        
        // Fit sphere in frustum with dynamic zoom based on progress
        let distH = radius / Math.sin(fov / 2);
        let distW = radius / Math.sin(fov / 2 * aspect);
        
        // Dynamic multiplier: flies into the particles when uProgress is high
        const zoomMultiplier = 1.8 - (appState.uProgress * 1.0); 
        targetDistance = Math.max(distH, distW) * zoomMultiplier;
        
        // Clamp distance
        targetDistance = THREE.MathUtils.clamp(targetDistance, MIN_DISTANCE, MAX_DISTANCE);
        
        // Update focus target slightly based on Bounding Box center
        boundingBox.getCenter(focusTarget);
    }
    
    // Speed up camera rotation when interacting
    if (timeline) {
        timeline.timeScale(1.0 + appState.uProgress * 3.0);
    }

    if (appState.cameraMode === 'auto') {
        // Apply GSAP interpolated position, scaled by Frustum Fitting distance
        const dir = currentCamPos.clone().normalize();
        
        // Move camera position smoothly to new distance
        const desiredPos = dir.multiplyScalar(targetDistance).add(focusTarget);
        camera.position.lerp(desiredPos, deltaTime * 2.5); // Faster lerp for responsiveness
    } else {
        // Manual mode: simple orbit based on mouse/touch could be added here,
        // For now, just orbit slowly based on time if manual selected, or hold still.
        const time = performance.now() * 0.0005;
        const dir = new THREE.Vector3(Math.sin(time), Math.cos(time) * 0.5, Math.cos(time)).normalize();
        const desiredPos = dir.multiplyScalar(targetDistance).add(focusTarget);
        camera.position.lerp(desiredPos, deltaTime * 1.0);
    }

    camera.lookAt(focusTarget);
}

export function onWindowResize() {
    if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    }
}
