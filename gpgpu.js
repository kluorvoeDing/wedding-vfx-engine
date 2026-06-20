// gpgpu.js - Data Pipeline & GPGPU Core + GLSL Vector Fields
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getParticleSettings } from './particleSettings.js?v=20260620_v8';

let gpuCompute;
let posVariable, velVariable;
let positionUniforms, velocityUniforms;
let particleGeometry, particleMaterial, particleMesh;
let boundingBox = new THREE.Box3();
let pointsCount = 0;

// Base width/height of the Data Texture. Will be calculated based on vertex count.
let TEXTURE_WIDTH = 512; 

const glslNoise = `
// 4D Simplex Noise
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 1.0/7.0; // N=7
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

vec3 snoiseVec3( vec3 x ){
  float s  = snoise(vec3( x ));
  float s1 = snoise(vec3( x.y - 19.1 , x.z + 33.4 , x.x + 47.2 ));
  float s2 = snoise(vec3( x.z + 74.2 , x.x - 124.5 , x.y + 99.4 ));
  vec3 c = vec3( s , s1 , s2 );
  return c;
}

vec3 curlNoise( vec3 p ){
  const float e = .1;
  vec3 dx = vec3( e   , 0.0 , 0.0 );
  vec3 dy = vec3( 0.0 , e   , 0.0 );
  vec3 dz = vec3( 0.0 , 0.0 , e   );

  vec3 p_x0 = snoiseVec3( p - dx );
  vec3 p_x1 = snoiseVec3( p + dx );
  vec3 p_y0 = snoiseVec3( p - dy );
  vec3 p_y1 = snoiseVec3( p + dy );
  vec3 p_z0 = snoiseVec3( p - dz );
  vec3 p_z1 = snoiseVec3( p + dz );

  float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
  float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
  float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;

  const float divisor = 1.0 / ( 2.0 * e );
  return normalize( vec3( x , y , z ) * divisor );
}
`;

const velocityShader = `
uniform float uTime;
uniform float uProgress;
uniform float uAudioPulse; // Audio Reactivity (Not active in this branch, kept for struct alignment)
uniform float uIntensity;
uniform float uTurbulence;
uniform float uReturnForce;
uniform int uMode; // Vector Field mode (Hardcoded to 6)
uniform sampler2D textureBasePosition;
uniform sampler2D textureTargetPosition; // New target for LOGO Morph
${glslNoise}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    vec3 basePos = texture2D(textureBasePosition, uv).xyz; // original vertex

    vec3 targetVel = vec3(0.0);
    bool isStar = abs(basePos.z) > 5.0; // Padded particles have large Z bounds

    if (isStar) {
        // Drifting stars: slowly move around using curl noise
        targetVel = curlNoise(pos * 0.02 + uTime * 0.05) * 5.0;
        
        // Slight gravity to center if they wander too far
        targetVel -= pos * 0.01;
    } else {
        // Logo Morph only
        vec3 targetPos = texture2D(textureTargetPosition, uv).xyz;
        vec3 finalPos = mix(basePos, targetPos, uProgress);
        
        // Middle bump peaks at uProgress = 0.5 (set uIntensity and uTurbulence to 0.0 to disable explosion/shaking)
        float middleBump = sin(uProgress * 3.14159);
        
        // Outward force and curl noise turbulence
        vec3 outward = normalize(basePos + vec3(0.001)) * 40.0 * uIntensity;
        vec3 turbulence = curlNoise(pos * 0.2 + uTime * 1.5) * 60.0 * uTurbulence;
        vec3 explosionForce = (outward + turbulence) * middleBump;
        
        targetVel = (finalPos - pos) * 8.0 * uReturnForce + explosionForce;
    }

    // Damping integral equation (vel = vel * drag + acceleration)
    vel = vel * 0.88 + targetVel * 0.12;
    
    gl_FragColor = vec4(vel, 1.0);
}
`;

const positionShader = `
uniform float uTime;
uniform int uMode;
uniform float uProgress;
uniform sampler2D textureBasePosition;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    
    // Update position
    pos += vel * 0.016; // Assuming 60fps dt
    
    gl_FragColor = vec4(pos, 1.0);
}
`;

export async function initGPGPU(renderer, scene, imageUrl = 'public/photo.png', options = {}) {
    return new Promise((resolve) => {
        const normalizedOptions = typeof options === 'number'
            ? { ...getParticleSettings(options) }
            : { ...getParticleSettings(options.density || 1), ...options };
        const imageStep = normalizedOptions.imageStep || normalizedOptions.stepSize || 1;
        const logoStep = normalizedOptions.logoStep || 1;
        const particleBudget = normalizedOptions.minParticles || 200000;
        const targetImageUrl = normalizedOptions.targetImageUrl || 'public/logo.png';

        // Dispose old resources if rebuilding
        if (particleMesh) {
            scene.remove(particleMesh);
            particleGeometry.dispose();
            particleMaterial.dispose();
        }
        gpuCompute = null;
        particleMesh = null;
        particleGeometry = null;
        particleMaterial = null;

        const processVertices = (vertices, colors, tempBox, targetVertices = null) => {
            if (vertices.length === 0) {
                console.error("No valid vertices found!");
                return resolve({ pointsCount: 0, boundingBox });
            }

            // Upsample to meet the selected quality budget or enough points to cover the logo target.
            const requiredParticles = Math.max(particleBudget, targetVertices ? targetVertices.length / 3 : 0);
            
            let currentCount = vertices.length / 3;
            if (currentCount > 0 && currentCount < requiredParticles) {
                const multiplier = Math.ceil(requiredParticles / currentCount);
                const origVertices = [...vertices];
                const origColors = [...colors];
                for (let m = 1; m < multiplier; m++) {
                    for (let i = 0; i < currentCount; i++) {
                        // Add slight jitter
                        vertices.push(origVertices[i*3] + (Math.random()-0.5)*0.2);
                        vertices.push(origVertices[i*3+1] + (Math.random()-0.5)*0.2);
                        vertices.push(origVertices[i*3+2] + (Math.random()-0.5)*0.2);
                        colors.push(origColors[i*3], origColors[i*3+1], origColors[i*3+2]);
                    }
                }
            }

            boundingBox.copy(tempBox);
            pointsCount = vertices.length / 3;
            TEXTURE_WIDTH = Math.ceil(Math.sqrt(pointsCount));
            // Pad points count to fill the texture exactly
            pointsCount = TEXTURE_WIDTH * TEXTURE_WIDTH;

            // 1. Setup GPGPU
            gpuCompute = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_WIDTH, renderer);
            
            const dtPosition = gpuCompute.createTexture();
            const dtVelocity = gpuCompute.createTexture();
            const dtBasePos = gpuCompute.createTexture(); 
            const dtTargetPos = gpuCompute.createTexture(); // New!
            
            const posArr = dtPosition.image.data;
            const velArr = dtVelocity.image.data;
            const baseArr = dtBasePos.image.data;
            const targetArr = dtTargetPos.image.data;

            for (let i = 0; i < pointsCount; i++) {
                let x = 0, y = 0, z = 0;
                if (i * 3 < vertices.length) {
                    x = vertices[i*3];
                    y = vertices[i*3+1];
                    z = vertices[i*3+2];
                } else {
                    // Padded vertices (sparse stars in background)
                    x = (Math.random() - 0.5) * 200;
                    y = (Math.random() - 0.5) * 200;
                    z = (Math.random() - 0.5) * 200;
                    // Ensure stars are far enough on Z axis to be flagged as stars by velocityShader
                    if (Math.abs(z) <= 5.0) {
                        z += (Math.sign(z) || 1) * 6.0;
                    }
                }
                
                posArr[i*4 + 0] = x;
                posArr[i*4 + 1] = y;
                posArr[i*4 + 2] = z;
                posArr[i*4 + 3] = 1.0;
                
                baseArr[i*4 + 0] = x;
                baseArr[i*4 + 1] = y;
                baseArr[i*4 + 2] = z;
                baseArr[i*4 + 3] = 1.0;

                velArr[i*4 + 0] = 0;
                velArr[i*4 + 1] = 0;
                velArr[i*4 + 2] = 0;
                velArr[i*4 + 3] = 1.0;

                if (targetVertices && targetVertices.length > 0) {
                    let tIdx = i % (targetVertices.length / 3);
                    // Add micro jitter to prevent Z-fighting and Moire pattern on exact grid
                    targetArr[i*4 + 0] = targetVertices[tIdx*3] + (Math.random()-0.5) * 0.015;
                    targetArr[i*4 + 1] = targetVertices[tIdx*3 + 1] + (Math.random()-0.5) * 0.015;
                    targetArr[i*4 + 2] = targetVertices[tIdx*3 + 2] + (Math.random()-0.5) * 0.05;
                    targetArr[i*4 + 3] = 1.0;
                } else {
                    targetArr[i*4 + 0] = baseArr[i*4 + 0];
                    targetArr[i*4 + 1] = baseArr[i*4 + 1];
                    targetArr[i*4 + 2] = baseArr[i*4 + 2];
                    targetArr[i*4 + 3] = 1.0;
                }
            }
            
            // Explicitly mark textures for update
            dtPosition.needsUpdate = true;
            dtVelocity.needsUpdate = true;
            dtBasePos.needsUpdate = true;
            dtTargetPos.needsUpdate = true;

            velVariable = gpuCompute.addVariable("textureVelocity", velocityShader, dtVelocity);
            posVariable = gpuCompute.addVariable("texturePosition", positionShader, dtPosition);
            
            gpuCompute.setVariableDependencies(velVariable, [posVariable, velVariable]);
            gpuCompute.setVariableDependencies(posVariable, [posVariable, velVariable]);
            
            velocityUniforms = velVariable.material.uniforms;
            velocityUniforms.uTime = { value: 0.0 };
            velocityUniforms.uProgress = { value: 0.0 };
            velocityUniforms.uAudioPulse = { value: 0.0 };
            velocityUniforms.uIntensity = { value: 1.0 };
            velocityUniforms.uTurbulence = { value: 1.0 };
            velocityUniforms.uReturnForce = { value: 1.0 };
            velocityUniforms.uMode = { value: 0 };
            velocityUniforms.textureBasePosition = { value: dtBasePos };
            velocityUniforms.textureTargetPosition = { value: dtTargetPos };

            positionUniforms = posVariable.material.uniforms;
            positionUniforms.uTime = { value: 0.0 };
            positionUniforms.uMode = { value: 0 };
            positionUniforms.uProgress = { value: 0.0 };
            positionUniforms.textureBasePosition = { value: dtBasePos };
            positionUniforms.textureTargetPosition = { value: dtTargetPos };

            const error = gpuCompute.init();
            if (error !== null) {
                console.error(error);
            }

            // 2. Setup Particle Rendering
            particleGeometry = new THREE.BufferGeometry();
            const uvCoords = new Float32Array(pointsCount * 2);
            const finalColors = new Float32Array(pointsCount * 3);
            
            for (let i = 0; i < pointsCount; i++) {
                let p = i % (vertices.length/3);
                finalColors[i*3] = colors[p*3] || 1.0;
                finalColors[i*3+1] = colors[p*3+1] || 1.0;
                finalColors[i*3+2] = colors[p*3+2] || 1.0;
                
                uvCoords[i*2] = (i % TEXTURE_WIDTH) / TEXTURE_WIDTH;
                uvCoords[i*2+1] = Math.floor(i / TEXTURE_WIDTH) / TEXTURE_WIDTH;
            }

            particleGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pointsCount * 3), 3));
            particleGeometry.setAttribute('uv', new THREE.BufferAttribute(uvCoords, 2));
            particleGeometry.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));

            particleMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    texturePosition: { value: null },
                    pointSize: { value: 0.8 },
                    uGlobalScale: { value: 0.6 },
                    uRenderMode: { value: 0 },
                    uRotationAngle: { value: 0.0 },
                    uProgress: { value: 0.0 }
                },
                vertexColors: true,
                vertexShader: `
                    uniform sampler2D texturePosition;
                    uniform float pointSize;
                    uniform float uGlobalScale;
                    uniform int uRenderMode;
                    uniform float uRotationAngle;
                    uniform float uProgress;
                    // uv and color are automatically injected by Three.js ShaderMaterial
                    varying vec3 vColor;
                    void main() {
                        vec4 pos = texture2D(texturePosition, uv);
                        vec3 rotatedPos = pos.xyz;
                        
                        // Y-axis rotation (spindle rotation along stem), fades out as uProgress reaches 1.0
                        float angle = uRotationAngle * (1.0 - uProgress);
                        float cosA = cos(angle);
                        float sinA = sin(angle);
                        float rx = rotatedPos.x * cosA - rotatedPos.z * sinA;
                        float rz = rotatedPos.x * sinA + rotatedPos.z * cosA;
                        rotatedPos.x = rx;
                        rotatedPos.z = rz;
                        
                        vec4 scaledPos = vec4(rotatedPos * uGlobalScale, 1.0);
                        vec4 mvPosition = modelViewMatrix * scaledPos;
                        gl_PointSize = pointSize * (20.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                        vColor = color;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    void main() {
                        vec2 xy = gl_PointCoord.xy - vec2(0.5);
                        float ll = length(xy);
                        if(ll > 0.5) discard;
                        float alpha = smoothstep(0.5, 0.1, ll) * 0.25;
                        gl_FragColor = vec4(vColor, alpha);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            particleMesh = new THREE.Points(particleGeometry, particleMaterial);
            scene.add(particleMesh);

            console.log(`[GPGPU] Rebuild complete. Particles count: ${pointsCount}.`);
            resolve({ pointsCount, boundingBox });
        };

        const loadLogo = () => {
            return new Promise(res => {
                const img = new Image();
                img.src = targetImageUrl;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let fw = img.width, fh = img.height;
                    const maxRes = 2000;
                    if (fw > maxRes || fh > maxRes) {
                        const r = Math.min(maxRes/fw, maxRes/fh);
                        fw = Math.floor(fw*r); fh = Math.floor(fh*r);
                    }
                    canvas.width = fw; canvas.height = fh;
                    const ctx = canvas.getContext('2d', {willReadFrequently:true});
                    ctx.drawImage(img, 0, 0, fw, fh);
                    const imgData = ctx.getImageData(0,0,fw,fh).data;
                    const targetV = [];
                    for (let y = 0; y < fh; y += logoStep) {
                        for (let x = 0; x < fw; x += logoStep) {
                            const i = (y * fw + x) * 4;
                            const brightness = imgData[i] + imgData[i+1] + imgData[i+2];
                            // Exclude fully transparent AND pure black pixels
                            if (imgData[i+3] > 25 && brightness > 30) { 
                                // Scale and center for Logo 
                                const px = (x - fw/2) * 0.013; 
                                const py = -(y - fh/2) * 0.013;
                                const pz = 0.0; // Logo is flat
                                targetV.push(px, py, pz);
                            }
                        }
                    }
                    res(targetV);
                };
                img.onerror = () => res(null);
            });
        };

        if (imageUrl.toLowerCase().endsWith('.gltf') || imageUrl.toLowerCase().endsWith('.glb')) {
            console.log(`[GLTFLoader] Loading 3D model: ${imageUrl}`);
            const loader = new GLTFLoader();
            loader.load(imageUrl, (gltf) => {
                console.log(`[GLTFLoader] Loaded successfully: ${imageUrl}`);
                gltf.scene.updateMatrixWorld(true);
                
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const radius = size.length() / 2;
                const scale = 5.0 / (radius || 1.0);

                const vertices = [];
                const colors = [];
                const tempBox = new THREE.Box3();
                tempBox.min.set(1e5, 1e5, 1e5);
                tempBox.max.set(-1e5, -1e5, -1e5);

                gltf.scene.traverse((child) => {
                    if (child.isMesh && child.geometry) {
                        const posAttr = child.geometry.getAttribute('position');
                        const colorAttr = child.geometry.getAttribute('color');
                        const mat = child.matrixWorld;
                        
                        if (posAttr) {
                            for (let i = 0; i < posAttr.count; i++) {
                                const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                                v.applyMatrix4(mat);
                                v.sub(center);
                                v.multiplyScalar(scale);

                                let vx = v.x;
                                let vy = v.y;
                                let vz = v.z;
                                
                                // No manual rotation needed: the GLTF scene graph's
                                // Sketchfab_model root node already contains a Z-up → Y-up
                                // rotation matrix. applyMatrix4(mat) above has already
                                // applied it, so the model is already upright (stem along Y).

                                vertices.push(vx, vy, vz);
                                
                                if (colorAttr) {
                                    colors.push(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
                                } else {
                                    // Rose particles remain white but dim to preserve detail in Additive Blending
                                    colors.push(0.3, 0.3, 0.3);
                                }
                                
                                tempBox.min.x = Math.min(tempBox.min.x, vx);
                                tempBox.min.y = Math.min(tempBox.min.y, vy);
                                tempBox.min.z = Math.min(tempBox.min.z, vz);
                                tempBox.max.x = Math.max(tempBox.max.x, vx);
                                tempBox.max.y = Math.max(tempBox.max.y, vy);
                                tempBox.max.z = Math.max(tempBox.max.z, vz);
                            }
                        }
                    }
                });

                if (vertices.length > 0) {
                    console.log(`[GLTFLoader] Extracted ${vertices.length / 3} vertices from ${imageUrl}`);
                    const extX = (tempBox.max.x - tempBox.min.x).toFixed(3);
                    const extY = (tempBox.max.y - tempBox.min.y).toFixed(3);
                    const extZ = (tempBox.max.z - tempBox.min.z).toFixed(3);
                    console.log(`[GLTFLoader] BBox extents — X: ${extX}, Y: ${extY}, Z: ${extZ} (Y should be largest for upright rose)`);
                    loadLogo().then(targetVertices => {
                        processVertices(vertices, colors, tempBox, targetVertices);
                    });
                } else {
                    console.error(`[GLTFLoader] No mesh vertices found in GLTF: ${imageUrl}`);
                    resolve({ pointsCount: 0, boundingBox });
                }
            }, undefined, (error) => {
                console.error(`[GLTFLoader] Error loading GLTF from ${imageUrl}:`, error);
                resolve({ pointsCount: 0, boundingBox });
            });
        } else {
            const img = new Image();
            img.src = imageUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxRes = 2000; 
                let w = img.width;
                let h = img.height;
                if (w > maxRes || h > maxRes) {
                    const ratio = Math.min(maxRes / w, maxRes / h);
                    w = Math.floor(w * ratio);
                    h = Math.floor(h * ratio);
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, w, h);
                
                const imgData = ctx.getImageData(0, 0, w, h).data;
                
                const vertices = [];
                const colors = [];
                
                for (let y = 0; y < h; y += imageStep) { 
                    for (let x = 0; x < w; x += imageStep) {
                        const i = (y * w + x) * 4;
                        const r = imgData[i] / 255.0;
                        const g = imgData[i+1] / 255.0;
                        const b = imgData[i+2] / 255.0;
                        const a = imgData[i+3] / 255.0;
                        
                        // Exclude fully transparent AND pure black pixels
                        if (a > 0.1 && (r + g + b) > 0.1) {
                            const px = (x - w/2) * 0.22; 
                            const py = -(y - h/2) * 0.22;
                            const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                            const pz = brightness * 5.0 - 2.5; 
                            
                            vertices.push(px, py, pz);
                            colors.push(r, g, b);
                        }
                    }
                }
                
                const tempBox = new THREE.Box3();
                tempBox.min.set(-w/2 * 0.22, -h/2 * 0.22, -2.5);
                tempBox.max.set(w/2 * 0.22, h/2 * 0.22, 2.5);
                loadLogo().then(targetVertices => {
                    processVertices(vertices, colors, tempBox, targetVertices);
                });
            };
            img.onerror = (e) => {
                console.error("Failed to load image", e);
                resolve({ pointsCount: 0, boundingBox });
            };
        }
    });
}

export function updateGPGPU(time, appState, audioPulse = 0.0) {
    if (!gpuCompute || !particleMesh || !particleMaterial) return;

    velocityUniforms.uTime.value = time;
    velocityUniforms.uProgress.value = appState.uProgress;
    velocityUniforms.uAudioPulse.value = audioPulse;
    velocityUniforms.uIntensity.value = appState.fieldIntensity ?? 1.0;
    velocityUniforms.uTurbulence.value = appState.turbulence ?? 1.0;
    velocityUniforms.uReturnForce.value = appState.returnForce ?? 1.0;
    velocityUniforms.uMode.value = appState.vectorFieldMode;
    
    if (particleMaterial) {
        // Interpolate scale dynamically between 0.6 (Rose) and 2.0 (LOGO) based on progress
        const baseScale = 0.6;
        const targetScale = 2.0;
        const currentScale = baseScale + (targetScale - baseScale) * appState.uProgress;
        particleMaterial.uniforms.uGlobalScale.value = currentScale;
        
        particleMaterial.uniforms.pointSize.value = appState.pointSize ?? 0.8;
        particleMaterial.uniforms.uRenderMode.value = appState.vectorFieldMode ?? 0;
        particleMaterial.uniforms.uRotationAngle.value = time * 0.15; // Slow self-rotation speed
        particleMaterial.uniforms.uProgress.value = appState.uProgress;
    }

    positionUniforms.uTime.value = time;
    positionUniforms.uProgress.value = appState.uProgress;
    positionUniforms.uMode.value = appState.vectorFieldMode;

    gpuCompute.compute();
    particleMaterial.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(posVariable).texture;
}
