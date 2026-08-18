// gpgpu.js - Data Pipeline & GPGPU Core (婚禮特製: 常駐雙粒子系統 玫瑰 ⇄ LOGO)
//
// 架構: 啟動時一次建好兩套模擬 —
//   rose  (低密度, 純彈簧定形, 永遠停在玫瑰形狀)
//   morph (高密度, 玫瑰 ⇄ LOGO 形變 + 流體亂流)
// 兩套每幀都計算以保持同步,但只顯示一套;切換 = 瞬間改 visibility,
// 執行期間零重建、零貼圖上傳、零 shader 編譯。
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let sims = { rose: null, morph: null };
let boundingBox = new THREE.Box3();
let cachedModel = null; // { url, vertices, colors, box }
let cachedLogo = null;  // { url, imgData, width, height }

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
    float pType = basePos4.w; // 1.0 = Rose/LOGO particle, 2.0 = hidden padding texel

    vec3 targetVel = vec3(0.0);

    if (pType < 1.5) {
        // Rose <-> LOGO morph with fluid flow in the middle of the transition
        vec3 targetPos = texture2D(textureTargetPosition, uv).xyz;
        vec3 finalPos = mix(basePos, targetPos, uProgress);

        // middleBump peaks at uProgress = 0.5 and vanishes at both rest states,
        // so the flow forces only act while morphing
        float middleBump = sin(uProgress * 3.14159);

        // 靜止時 middleBump = 0，力場毫無作用，故整段跳過。uProgress 是 uniform，
        // 分支對所有 invocation 一致，不會造成 GPU divergence。
        vec3 transitionForce = vec3(0.0);
        if (middleBump > 0.001) {
            vec3 outward = normalize(basePos + vec3(0.001)) * 40.0 * uIntensity;
            vec3 flow = curlNoise(pos * 0.2 + uTime * 1.5) * 60.0 * uTurbulence;
            transitionForce = (outward + flow) * middleBump;
        }

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

const renderVertexShader = `
    uniform sampler2D texturePosition;
    uniform float pointSize;
    uniform float uGlobalScale;
    uniform float uRotationAngle;
    // uv and color are automatically injected by Three.js ShaderMaterial
    varying vec3 vColor;
    void main() {
        vec4 pos = texture2D(texturePosition, uv);

        // Padding texel (data texture is square) — park off-screen, zero size
        if (pos.w > 1.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vColor = vec3(0.0);
            return;
        }

        // 玫瑰自轉: 角度由 CPU 累積,轉場時由 GSAP 收斂至 0,LOGO 恆為正向
        float cosA = cos(uRotationAngle);
        float sinA = sin(uRotationAngle);
        vec3 rotatedPos = vec3(
            pos.x * cosA - pos.z * sinA,
            pos.y,
            pos.x * sinA + pos.z * cosA
        );

        vec4 mvPosition = modelViewMatrix * vec4(rotatedPos * uGlobalScale, 1.0);
        gl_PointSize = pointSize * (20.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
        vColor = color;
    }
`;

const renderFragmentShader = `
    varying vec3 vColor;
    void main() {
        vec2 xy = gl_PointCoord.xy - vec2(0.5);
        float ll = length(xy);
        if (ll > 0.5) discard;

        float alpha = smoothstep(0.5, 0.1, ll) * 0.5 * 0.6;
        gl_FragColor = vec4(vColor, alpha);
    }
`;

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

// 建立一套完整的粒子模擬 (compute + render)。targetVertices 為 null 時,
// 目標 = 錨點,粒子永遠停在玫瑰形狀 (rose 待機系統用)。
function createSim(renderer, scene, model, targetVertices, particleBudget, label) {
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

    const visibleCount = vertices.length / 3;
    const textureWidth = Math.ceil(Math.sqrt(visibleCount));
    const totalCount = textureWidth * textureWidth;

    const compute = new GPUComputationRenderer(textureWidth, textureWidth, renderer);

    const dtPosition = compute.createTexture();
    const dtVelocity = compute.createTexture();
    const dtBasePos = compute.createTexture();
    const dtTargetPos = compute.createTexture();

    const posArr = dtPosition.image.data;
    const velArr = dtVelocity.image.data;
    const baseArr = dtBasePos.image.data;
    const targetArr = dtTargetPos.image.data;
    const targetCount = targetVertices ? targetVertices.length / 3 : 0;

    for (let i = 0; i < totalCount; i++) {
        let x = 0, y = -9999, z = 0;
        let type = 2.0; // hidden padding texel
        if (i < visibleCount) {
            x = vertices[i * 3];
            y = vertices[i * 3 + 1];
            z = vertices[i * 3 + 2];
            type = 1.0;
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

        if (targetCount > 0 && type === 1.0) {
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

    const velVar = compute.addVariable('textureVelocity', velocityShader, dtVelocity);
    const posVar = compute.addVariable('texturePosition', positionShader, dtPosition);

    compute.setVariableDependencies(velVar, [posVar, velVar]);
    compute.setVariableDependencies(posVar, [posVar, velVar]);

    velVar.material.uniforms.uTime = { value: 0.0 };
    velVar.material.uniforms.uProgress = { value: 0.0 };
    velVar.material.uniforms.uIntensity = { value: 0.0 };
    velVar.material.uniforms.uTurbulence = { value: 0.0 };
    velVar.material.uniforms.uReturnForce = { value: 1.0 };
    velVar.material.uniforms.textureBasePosition = { value: dtBasePos };
    velVar.material.uniforms.textureTargetPosition = { value: dtTargetPos };

    posVar.material.uniforms.textureBasePosition = { value: dtBasePos };

    const error = compute.init();
    if (error !== null) {
        throw new Error(`[GPGPU] Compute init failed (${label}): ${error}`);
    }

    const geometry = new THREE.BufferGeometry();
    const uvCoords = new Float32Array(totalCount * 2);
    const finalColors = new Float32Array(totalCount * 3);

    for (let i = 0; i < totalCount; i++) {
        if (i < visibleCount) {
            finalColors[i * 3] = colors[i * 3];
            finalColors[i * 3 + 1] = colors[i * 3 + 1];
            finalColors[i * 3 + 2] = colors[i * 3 + 2];
        }
        uvCoords[i * 2] = (i % textureWidth) / textureWidth;
        uvCoords[i * 2 + 1] = Math.floor(i / textureWidth) / textureWidth;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(totalCount * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvCoords, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(finalColors, 3));

    const material = new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            pointSize: { value: 0.8 },
            uGlobalScale: { value: 0.6 },
            uRotationAngle: { value: 0.0 }
        },
        vertexColors: true,
        vertexShader: renderVertexShader,
        fragmentShader: renderFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const mesh = new THREE.Points(geometry, material);
    // Positions live in the GPGPU texture, so the CPU-side bounding sphere is
    // meaningless — never let Three.js frustum-cull the particle cloud
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);

    console.log(`[GPGPU] Sim "${label}" ready. Visible particles: ${visibleCount} (texture ${textureWidth}x${textureWidth})`);
    return { compute, posVar, velVar, geometry, material, mesh, visibleCount, morphs: !!targetVertices };
}

function disposeSim(scene, sim) {
    if (!sim) return;
    scene.remove(sim.mesh);
    sim.geometry.dispose();
    sim.material.dispose();
    for (const variable of [sim.posVar, sim.velVar]) {
        for (const rt of variable.renderTargets || []) {
            if (rt) rt.dispose();
        }
        if (variable.material) variable.material.dispose();
        if (variable.initialValueTexture) variable.initialValueTexture.dispose();
    }
}

// config = { modelUrl, logoUrl, rose: {minParticles}, morph: {minParticles, logoStep} }
export async function initGPGPU(renderer, scene, config) {
    const [model, logo] = await Promise.all([
        loadModelVertices(config.modelUrl),
        loadLogoImage(config.logoUrl)
    ]);

    disposeSim(scene, sims.rose);
    disposeSim(scene, sims.morph);

    const morphTargets = extractLogoVertices(logo, config.morph.logoStep || 1);

    // rose 待機系統: 無形變目標,純彈簧定形,永遠是安靜的玫瑰
    sims.rose = createSim(
        renderer, scene,
        { vertices: model.vertices.slice(), colors: model.colors.slice() },
        null,
        config.rose.minParticles,
        'rose'
    );
    // morph 表演系統: 高密度,負責玫瑰 ⇄ LOGO 全程形變
    sims.morph = createSim(
        renderer, scene,
        { vertices: model.vertices, colors: model.colors },
        morphTargets,
        config.morph.minParticles,
        'morph'
    );

    boundingBox.copy(model.box);
    setActiveParticles('rose');

    return {
        boundingBox,
        roseVisibleCount: sims.rose.visibleCount,
        morphVisibleCount: sims.morph.visibleCount
    };
}

// 瞬間切換顯示哪一套粒子 (兩套模擬持續同步運行,切換零成本)
export function setActiveParticles(name) {
    const target = sims[name];
    if (!target) return null;
    for (const key of Object.keys(sims)) {
        if (sims[key]) sims[key].mesh.visible = (key === name);
    }
    return { visibleCount: target.visibleCount };
}

// 現場診斷用：回報兩套模擬的狀態與粒子實際座標範圍，
// 可在 DevTools 以 __vfx.simStats() 確認形變是否真的發生。
export function getSimStats(renderer) {
    const stats = {};
    for (const [name, sim] of Object.entries(sims)) {
        if (!sim) { stats[name] = null; continue; }
        const entry = { visible: sim.mesh.visible, visibleCount: sim.visibleCount, morphs: sim.morphs };
        if (renderer) {
            const rt = sim.compute.getCurrentRenderTarget(sim.posVar);
            const w = Math.min(64, rt.width);
            const buf = new Float32Array(w * w * 4);
            renderer.readRenderTargetPixels(rt, 0, 0, w, w, buf);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
            for (let i = 0; i < w * w; i++) {
                if (buf[i * 4 + 3] > 1.5) continue; // 跳過填充 texel
                minX = Math.min(minX, buf[i * 4]); maxX = Math.max(maxX, buf[i * 4]);
                minY = Math.min(minY, buf[i * 4 + 1]); maxY = Math.max(maxY, buf[i * 4 + 1]);
                n++;
            }
            entry.sampled = n;
            if (n) entry.extent = { x: +(maxX - minX).toFixed(2), y: +(maxY - minY).toFixed(2) };
        }
        stats[name] = entry;
    }
    return stats;
}

export function updateGPGPU(time, appState) {
    for (const sim of [sims.rose, sims.morph]) {
        // 隱藏的那套依定義正停在靜止姿態（切回來時姿態不變），凍結它即可。
        // 待機時只算 rose 的 5.8 萬顆，而非兩套合計 32 萬顆。
        if (!sim || !sim.mesh.visible) continue;

        const vu = sim.velVar.material.uniforms;
        vu.uTime.value = time;
        if (sim.morphs) {
            vu.uProgress.value = appState.uProgress;
            vu.uIntensity.value = appState.fieldIntensity ?? 0.0;
            vu.uTurbulence.value = appState.turbulence ?? 0.0;
            vu.uReturnForce.value = appState.returnForce ?? 1.0;
        }
        sim.compute.compute();

        const mu = sim.material.uniforms;
        mu.uGlobalScale.value = appState.logoScale;
        mu.pointSize.value = appState.pointSize ?? 0.8;
        mu.uRotationAngle.value = appState.rotationAngle ?? 0.0;
        mu.texturePosition.value = sim.compute.getCurrentRenderTarget(sim.posVar).texture;
    }
}
