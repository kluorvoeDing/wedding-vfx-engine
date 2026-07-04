// gpgpu.js - Data Pipeline & GPGPU Core (婚禮特製: 玫瑰 ⇄ LOGO 雙形態)
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getParticleSettings } from './particleSettings.js?v=20260704_wedding_v5';

let gpuCompute;
let posVariable, velVariable;
let positionUniforms, velocityUniforms;
let particleGeometry, particleMaterial, particleMesh;
let extraTextures = [];
let boundingBox = new THREE.Box3();
let pointsCount = 0;
let TEXTURE_WIDTH = 512;

// 重建協調與素材快取:
// 重建期間畫面保留舊粒子,新資源就緒後才原子交換;過期的並發重建會被 buildCounter 作廢
let buildCounter = 0;
let cachedModel = null; // { url, vertices, colors, box }
let cachedLogo = null;  // { url, imgData, width, height }
let starPool = null;    // 固定星點座標池,重建時背景星空不重新洗牌

const STAR_POOL_SIZE = 8192;

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
uniform float uIntensity;
uniform float uTurbulence;
uniform float uReturnForce;
uniform sampler2D textureBasePosition;
uniform sampler2D textureTargetPosition;
${glslNoise}

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    vec4 basePos4 = texture2D(textureBasePosition, uv);
    vec3 basePos = basePos4.xyz;
    float pType = basePos4.w; // 1.0 = Rose/LOGO, 2.0 = Drifting Star

    vec3 targetVel = vec3(0.0);

    if (pType > 1.5) {
        // Drifting stars: slowly move around using curl noise
        targetVel = curlNoise(pos * 0.02 + uTime * 0.05) * 5.0;
        targetVel -= pos * 0.01;
    } else {
        // Rose <-> LOGO morph with fluid flow in the middle of the transition
        vec3 targetPos = texture2D(textureTargetPosition, uv).xyz;
        vec3 finalPos = mix(basePos, targetPos, uProgress);

        // middleBump peaks at uProgress = 0.5 and vanishes at both rest states,
        // so the flow forces only act while morphing
        float middleBump = sin(uProgress * 3.14159);
        vec3 outward = normalize(basePos + vec3(0.001)) * 40.0 * uIntensity;
        vec3 flow = curlNoise(pos * 0.2 + uTime * 1.5) * 60.0 * uTurbulence;
        vec3 transitionForce = (outward + flow) * middleBump;

        targetVel = (finalPos - pos) * 8.0 * uReturnForce + transitionForce;
    }

    // Damping integral equation (vel = vel * drag + acceleration)
    vel = vel * 0.88 + targetVel * 0.12;

    gl_FragColor = vec4(vel, pType);
}
`;

const positionShader = `
uniform sampler2D textureBasePosition;

void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos4 = texture2D(texturePosition, uv);
    vec3 pos = pos4.xyz + texture2D(textureVelocity, uv).xyz * 0.016;

    // Preserve type flag in 4th channel
    float pType = pos4.w;
    if (pType == 0.0) {
        pType = texture2D(textureBasePosition, uv).w;
    }

    gl_FragColor = vec4(pos, pType);
}
`;

function getStarPool() {
    if (starPool) return starPool;
    starPool = new Float32Array(STAR_POOL_SIZE * 3);
    for (let i = 0; i < STAR_POOL_SIZE; i++) {
        const x = (Math.random() - 0.5) * 200;
        const y = (Math.random() - 0.5) * 200;
        let z = (Math.random() - 0.5) * 200;
        // Keep stars away from the rose/logo plane
        if (Math.abs(z) <= 5.0) {
            z += (Math.sign(z) || 1) * 6.0;
        }
        starPool[i * 3] = x;
        starPool[i * 3 + 1] = y;
        starPool[i * 3 + 2] = z;
    }
    return starPool;
}

function disposeCurrent(scene) {
    if (particleMesh) {
        scene.remove(particleMesh);
    }
    if (particleGeometry) particleGeometry.dispose();
    if (particleMaterial) particleMaterial.dispose();
    if (gpuCompute) {
        for (const variable of [posVariable, velVariable]) {
            if (!variable) continue;
            for (const rt of variable.renderTargets || []) {
                if (rt) rt.dispose();
            }
            if (variable.material) variable.material.dispose();
            if (variable.initialValueTexture) variable.initialValueTexture.dispose();
        }
    }
    for (const tex of extraTextures) tex.dispose();
    extraTextures = [];
    gpuCompute = null;
    posVariable = null;
    velVariable = null;
    positionUniforms = null;
    velocityUniforms = null;
    particleMesh = null;
    particleGeometry = null;
    particleMaterial = null;
}

function loadModelVertices(url) {
    if (cachedModel && cachedModel.url === url) {
        return Promise.resolve({
            vertices: Array.from(cachedModel.vertices),
            colors: Array.from(cachedModel.colors),
            box: cachedModel.box.clone()
        });
    }
    return new Promise((res, rej) => {
        console.log(`[GLTFLoader] Loading 3D model: ${url}`);
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
            gltf.scene.updateMatrixWorld(true);

            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const radius = size.length() / 2;
            const scale = 5.0 / (radius || 1.0);

            const vertices = [];
            const colors = [];
            const tempBox = new THREE.Box3();
            tempBox.makeEmpty();
            const v = new THREE.Vector3();

            gltf.scene.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    const posAttr = child.geometry.getAttribute('position');
                    const colorAttr = child.geometry.getAttribute('color');
                    const mat = child.matrixWorld;

                    if (!posAttr) return;
                    for (let i = 0; i < posAttr.count; i++) {
                        v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                        // The GLTF scene graph already contains the Z-up -> Y-up matrix,
                        // so applyMatrix4 leaves the model upright (stem along Y)
                        v.applyMatrix4(mat);
                        v.sub(center);
                        v.multiplyScalar(scale);

                        vertices.push(v.x, v.y, v.z);
                        if (colorAttr) {
                            colors.push(colorAttr.getX(i), colorAttr.getY(i), colorAttr.getZ(i));
                        } else {
                            // Dim white keeps petal detail under additive blending + bloom
                            colors.push(0.3, 0.3, 0.3);
                        }
                        tempBox.expandByPoint(v);
                    }
                }
            });

            if (vertices.length === 0) {
                rej(new Error(`No mesh vertices found in GLTF: ${url}`));
                return;
            }

            console.log(`[GLTFLoader] Extracted ${vertices.length / 3} vertices from ${url}`);
            cachedModel = {
                url,
                vertices: Array.from(vertices),
                colors: Array.from(colors),
                box: tempBox.clone()
            };
            res({ vertices, colors, box: tempBox });
        }, undefined, (error) => rej(error));
    });
}

function loadLogoImage(url) {
    if (cachedLogo && cachedLogo.url === url) {
        return Promise.resolve(cachedLogo);
    }
    return new Promise((res) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
            let fw = img.width;
            let fh = img.height;
            const maxRes = 2000;
            if (fw > maxRes || fh > maxRes) {
                const r = Math.min(maxRes / fw, maxRes / fh);
                fw = Math.floor(fw * r);
                fh = Math.floor(fh * r);
            }
            const canvas = document.createElement('canvas');
            canvas.width = fw;
            canvas.height = fh;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, fw, fh);
            cachedLogo = { url, imgData: ctx.getImageData(0, 0, fw, fh).data, width: fw, height: fh };
            res(cachedLogo);
        };
        img.onerror = () => {
            console.error(`[GPGPU] Failed to load logo image: ${url}`);
            res(null);
        };
    });
}

function extractLogoVertices(logo, logoStep) {
    if (!logo) return null;
    const { imgData, width, height } = logo;
    const targetV = [];
    for (let y = 0; y < height; y += logoStep) {
        for (let x = 0; x < width; x += logoStep) {
            const i = (y * width + x) * 4;
            const brightness = imgData[i] + imgData[i + 1] + imgData[i + 2];
            // Exclude fully transparent AND pure black pixels
            if (imgData[i + 3] > 25 && brightness > 30) {
                targetV.push((x - width / 2) * 0.013, -(y - height / 2) * 0.013, 0.0);
            }
        }
    }
    return targetV;
}

function installParticles(renderer, scene, model, targetVertices, particleBudget) {
    const vertices = model.vertices;
    const colors = model.colors;

    // Jitter upsampling: 補足粒子數以覆蓋畫質預算與 LOGO 目標點數
    const requiredParticles = Math.max(particleBudget, targetVertices ? targetVertices.length / 3 : 0);
    const baseCount = vertices.length / 3;
    if (baseCount > 0 && baseCount < requiredParticles) {
        const multiplier = Math.ceil(requiredParticles / baseCount);
        const origVertices = vertices.slice();
        const origColors = colors.slice();
        for (let m = 1; m < multiplier; m++) {
            for (let i = 0; i < baseCount; i++) {
                vertices.push(
                    origVertices[i * 3] + (Math.random() - 0.5) * 0.2,
                    origVertices[i * 3 + 1] + (Math.random() - 0.5) * 0.2,
                    origVertices[i * 3 + 2] + (Math.random() - 0.5) * 0.2
                );
                colors.push(origColors[i * 3], origColors[i * 3 + 1], origColors[i * 3 + 2]);
            }
        }
    }

    const roseCount = vertices.length / 3;
    const minTotalParticles = roseCount + 2000; // 玫瑰粒子 + 背景漂浮星
    const textureWidth = Math.ceil(Math.sqrt(minTotalParticles));
    const totalCount = textureWidth * textureWidth;

    // 1. Setup GPGPU (built aside; the old simulation keeps rendering until swap)
    const newCompute = new GPUComputationRenderer(textureWidth, textureWidth, renderer);

    const dtPosition = newCompute.createTexture();
    const dtVelocity = newCompute.createTexture();
    const dtBasePos = newCompute.createTexture();
    const dtTargetPos = newCompute.createTexture();

    const posArr = dtPosition.image.data;
    const velArr = dtVelocity.image.data;
    const baseArr = dtBasePos.image.data;
    const targetArr = dtTargetPos.image.data;
    const pool = getStarPool();
    const targetCount = targetVertices ? targetVertices.length / 3 : 0;

    for (let i = 0; i < totalCount; i++) {
        let x, y, z, type;
        if (i < roseCount) {
            x = vertices[i * 3];
            y = vertices[i * 3 + 1];
            z = vertices[i * 3 + 2];
            type = 1.0; // Rose/LOGO particle
        } else {
            const s = ((i - roseCount) % STAR_POOL_SIZE) * 3;
            x = pool[s];
            y = pool[s + 1];
            z = pool[s + 2];
            type = 2.0; // Background drifting star
        }

        posArr[i * 4] = x;
        posArr[i * 4 + 1] = y;
        posArr[i * 4 + 2] = z;
        posArr[i * 4 + 3] = type;

        baseArr[i * 4] = x;
        baseArr[i * 4 + 1] = y;
        baseArr[i * 4 + 2] = z;
        baseArr[i * 4 + 3] = type;

        velArr[i * 4] = 0;
        velArr[i * 4 + 1] = 0;
        velArr[i * 4 + 2] = 0;
        velArr[i * 4 + 3] = type;

        if (targetCount > 0) {
            const tIdx = i % targetCount;
            targetArr[i * 4] = targetVertices[tIdx * 3] + (Math.random() - 0.5) * 0.015;
            targetArr[i * 4 + 1] = targetVertices[tIdx * 3 + 1] + (Math.random() - 0.5) * 0.015;
            targetArr[i * 4 + 2] = targetVertices[tIdx * 3 + 2] + (Math.random() - 0.5) * 0.05;
            targetArr[i * 4 + 3] = type;
        } else {
            targetArr[i * 4] = x;
            targetArr[i * 4 + 1] = y;
            targetArr[i * 4 + 2] = z;
            targetArr[i * 4 + 3] = type;
        }
    }

    dtPosition.needsUpdate = true;
    dtVelocity.needsUpdate = true;
    dtBasePos.needsUpdate = true;
    dtTargetPos.needsUpdate = true;

    const newVelVar = newCompute.addVariable('textureVelocity', velocityShader, dtVelocity);
    const newPosVar = newCompute.addVariable('texturePosition', positionShader, dtPosition);

    newCompute.setVariableDependencies(newVelVar, [newPosVar, newVelVar]);
    newCompute.setVariableDependencies(newPosVar, [newPosVar, newVelVar]);

    newVelVar.material.uniforms.uTime = { value: 0.0 };
    newVelVar.material.uniforms.uProgress = { value: 0.0 };
    newVelVar.material.uniforms.uIntensity = { value: 0.0 };
    newVelVar.material.uniforms.uTurbulence = { value: 0.0 };
    newVelVar.material.uniforms.uReturnForce = { value: 1.0 };
    newVelVar.material.uniforms.textureBasePosition = { value: dtBasePos };
    newVelVar.material.uniforms.textureTargetPosition = { value: dtTargetPos };

    newPosVar.material.uniforms.textureBasePosition = { value: dtBasePos };

    const error = newCompute.init();
    if (error !== null) {
        console.error('[GPGPU] Compute init failed, keeping previous scene:', error);
        for (const variable of [newPosVar, newVelVar]) {
            for (const rt of variable.renderTargets || []) {
                if (rt) rt.dispose();
            }
            if (variable.material) variable.material.dispose();
        }
        dtPosition.dispose();
        dtVelocity.dispose();
        dtBasePos.dispose();
        dtTargetPos.dispose();
        return { pointsCount, boundingBox, failed: true };
    }

    // 2. Setup Particle Rendering
    const newGeometry = new THREE.BufferGeometry();
    const uvCoords = new Float32Array(totalCount * 2);
    const finalColors = new Float32Array(totalCount * 3);

    for (let i = 0; i < totalCount; i++) {
        const p = i % roseCount;
        finalColors[i * 3] = colors[p * 3] || 1.0;
        finalColors[i * 3 + 1] = colors[p * 3 + 1] || 1.0;
        finalColors[i * 3 + 2] = colors[p * 3 + 2] || 1.0;

        uvCoords[i * 2] = (i % textureWidth) / textureWidth;
        uvCoords[i * 2 + 1] = Math.floor(i / textureWidth) / textureWidth;
    }

    newGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(totalCount * 3), 3));
    newGeometry.setAttribute('uv', new THREE.BufferAttribute(uvCoords, 2));
    newGeometry.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));

    const newMaterial = new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            pointSize: { value: 0.8 },
            uGlobalScale: { value: 0.6 },
            uRotationAngle: { value: 0.0 },
            uProgress: { value: 0.0 },
            uTime: { value: 0.0 }
        },
        vertexColors: true,
        vertexShader: `
            uniform sampler2D texturePosition;
            uniform float pointSize;
            uniform float uGlobalScale;
            uniform float uRotationAngle;
            // uv and color are automatically injected by Three.js ShaderMaterial
            varying vec3 vColor;
            varying float vType;
            varying vec2 vUv;
            void main() {
                vec4 pos = texture2D(texturePosition, uv);
                vec3 rotatedPos = pos.xyz;
                float pType = pos.w;
                vType = pType;
                vUv = uv;

                // 玫瑰自轉: 角度由 CPU 累積,轉場時由 GSAP 收斂至 0,LOGO 恆為正向
                if (pType < 1.5) {
                    float cosA = cos(uRotationAngle);
                    float sinA = sin(uRotationAngle);
                    float rx = rotatedPos.x * cosA - rotatedPos.z * sinA;
                    float rz = rotatedPos.x * sinA + rotatedPos.z * cosA;
                    rotatedPos.x = rx;
                    rotatedPos.z = rz;
                }

                vec4 mvPosition = modelViewMatrix * vec4(rotatedPos * uGlobalScale, 1.0);
                gl_PointSize = pointSize * (20.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
                vColor = color;
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform float uProgress;
            varying vec3 vColor;
            varying float vType;
            varying vec2 vUv;

            float hash(float n) {
                return fract(sin(n) * 43758.5453123);
            }

            void main() {
                vec2 xy = gl_PointCoord.xy - vec2(0.5);
                float ll = length(xy);
                if (ll > 0.5) discard;

                float alpha = smoothstep(0.5, 0.1, ll) * 0.5;

                if (vType > 1.5) {
                    // Background drifting star: gentle twinkle, fades out while LOGO shows
                    float seed = hash(vUv.x * 12.9898 + vUv.y * 78.233);
                    float speed = 1.0 + seed * 2.0;
                    float phase = seed * 6.28;
                    float twinkle = 0.3 + 0.7 * sin(uTime * speed + phase);
                    alpha *= twinkle * (1.0 - uProgress);
                } else {
                    // Rose/LOGO particle
                    alpha *= 0.6;
                }

                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const newMesh = new THREE.Points(newGeometry, newMaterial);
    // Positions live in the GPGPU texture, so the CPU-side bounding sphere is
    // meaningless — never let Three.js frustum-cull the particle cloud
    newMesh.frustumCulled = false;

    // 3. Atomic swap: 新資源全部就緒後才移除舊粒子,重建過程畫面不中斷
    disposeCurrent(scene);
    gpuCompute = newCompute;
    posVariable = newPosVar;
    velVariable = newVelVar;
    velocityUniforms = newVelVar.material.uniforms;
    positionUniforms = newPosVar.material.uniforms;
    particleGeometry = newGeometry;
    particleMaterial = newMaterial;
    particleMesh = newMesh;
    extraTextures = [dtBasePos, dtTargetPos];
    TEXTURE_WIDTH = textureWidth;
    pointsCount = totalCount;
    boundingBox.copy(model.box);
    scene.add(particleMesh);

    console.log(`[GPGPU] Rebuild complete. Particles: ${totalCount}`);
    return { pointsCount: totalCount, boundingBox };
}

export async function initGPGPU(renderer, scene, imageUrl, options = {}) {
    const buildId = ++buildCounter;
    const normalizedOptions = typeof options === 'number'
        ? { ...getParticleSettings(options) }
        : { ...getParticleSettings(options.density || 1), ...options };
    const logoStep = normalizedOptions.logoStep || 1;
    const particleBudget = normalizedOptions.minParticles || 200000;
    const targetImageUrl = normalizedOptions.targetImageUrl || 'public/logo.png';

    try {
        const [model, logo] = await Promise.all([
            loadModelVertices(imageUrl),
            loadLogoImage(targetImageUrl)
        ]);
        // A newer rebuild superseded this one while assets were loading — drop it
        if (buildId !== buildCounter) {
            return { pointsCount, boundingBox, stale: true };
        }
        const targetVertices = extractLogoVertices(logo, logoStep);
        return installParticles(renderer, scene, model, targetVertices, particleBudget);
    } catch (err) {
        console.error('[GPGPU] Build failed, keeping previous scene:', err);
        return { pointsCount, boundingBox, failed: true };
    }
}

export function updateGPGPU(time, appState) {
    if (!gpuCompute || !particleMaterial) return;

    velocityUniforms.uTime.value = time;
    velocityUniforms.uProgress.value = appState.uProgress;
    velocityUniforms.uIntensity.value = appState.fieldIntensity ?? 0.0;
    velocityUniforms.uTurbulence.value = appState.turbulence ?? 0.0;
    velocityUniforms.uReturnForce.value = appState.returnForce ?? 1.0;

    const m = particleMaterial.uniforms;
    m.uGlobalScale.value = appState.logoScale;
    m.pointSize.value = appState.pointSize ?? 0.8;
    m.uRotationAngle.value = appState.rotationAngle ?? 0.0;
    m.uProgress.value = appState.uProgress;
    m.uTime.value = time;

    gpuCompute.compute();
    m.texturePosition.value = gpuCompute.getCurrentRenderTarget(posVariable).texture;
}
