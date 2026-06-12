// gpgpu.js - Data Pipeline & GPGPU Core + GLSL Vector Fields
import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
uniform float uAudioPulse; // Audio Reactivity
uniform int uMode; // Vector Field mode
uniform sampler2D textureBasePosition;
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
        
        // Add audio reactivity to stars
        if (uAudioPulse > 0.0) {
            targetVel += normalize(pos) * uAudioPulse * 10.0;
        }
        
        // Slight gravity to center if they wander too far
        targetVel -= pos * 0.01;
    } else {
        // Vector Field Modes for Photo Particles
        if (uMode == 0) {
            // Curl Noise Disturbance
            vec3 curl = curlNoise(pos * 0.1 + uTime * 0.2);
            targetVel = curl * 10.0 * uProgress;
            // Gravity back to base when progress is low
            targetVel += (basePos - pos) * (1.0 - uProgress) * 5.0;
        } else if (uMode == 1) {
            // Reverse Growth (Explode then re-assemble)
            vec3 dir = normalize(basePos);
            targetVel = dir * 20.0 * uProgress;
            targetVel += (basePos - pos) * (1.0 - uProgress) * 4.0;
        } else if (uMode == 2) {
            // Polar Fluid (Violent Tornado/Vortex)
            vec3 axis = vec3(0.0, 1.0, 0.0);
            vec3 tangent = cross(axis, normalize(pos + vec3(0.0, 0.001, 0.0)));
            vec3 upwardForce = vec3(0.0, sin(uTime * 2.0 + length(pos.xz) * 0.5) * 15.0, 0.0);
            vec3 polarFlow = tangent * 40.0 + upwardForce;
            targetVel = polarFlow * uProgress + curlNoise(pos * 0.08 - uTime) * 20.0 * uProgress;
            targetVel += (basePos - pos) * (1.0 - uProgress) * 5.0;
        } else if (uMode == 3) {
            // Topology Fragmentation (Violent Shatter)
            vec3 noiseForce = snoiseVec3(pos * 0.15 + uTime) * 40.0;
            vec3 outward = normalize(basePos + vec3(0.001)) * length(noiseForce) * 1.5;
            targetVel = (outward + noiseForce) * uProgress;
            targetVel += (basePos - pos) * (1.0 - uProgress) * 4.0;
        }
    }

    // --- Audio Reactivity ---
    // If there's an audio pulse, explode outward from the center
    if (uAudioPulse > 0.05) {
        vec3 explodeDir = normalize(pos + vec3(0.001));
        float force = uAudioPulse * 60.0;
        targetVel += explodeDir * force + snoiseVec3(pos * 0.5) * force * 0.5;
    }

    // Damping integral equation (vel = vel * drag + acceleration)
    // Increased drag (lower coefficient) to prevent particles flying away too fast
    vel = vel * 0.88 + targetVel * 0.12;
    
    gl_FragColor = vec4(vel, 1.0);
}
`;

const positionShader = `
uniform float uTime;
void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;
    
    // Update position
    pos += vel * 0.016; // Assuming 60fps dt
    
    gl_FragColor = vec4(pos, 1.0);
}
`;

export async function initGPGPU(renderer, scene, imageUrl = 'public/photo.png', stepSize = 1) {
    return new Promise((resolve) => {
        // Dispose old resources if rebuilding
        if (particleMesh) {
            scene.remove(particleMesh);
            particleGeometry.dispose();
            particleMaterial.dispose();
        }

        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Scale down if image is too large to avoid freezing the browser with millions of particles
            const maxRes = 600; 
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
            
            // Extract pixels that are not fully transparent
            for (let y = 0; y < h; y += stepSize) { 
                for (let x = 0; x < w; x += stepSize) {
                    const i = (y * w + x) * 4;
                    const r = imgData[i] / 255.0;
                    const g = imgData[i+1] / 255.0;
                    const b = imgData[i+2] / 255.0;
                    const a = imgData[i+3] / 255.0;
                    
                    if (a > 0.1) {
                        // Map 2D image coordinates to 3D space
                        // Flip Y so it renders right side up
                        const px = (x - w/2) * 0.22; // Increased to 0.22 to make photo larger
                        const py = -(y - h/2) * 0.22;
                        const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                        const pz = brightness * 5.0 - 2.5; // Slight depth variation
                        
                        vertices.push(px, py, pz);
                        colors.push(r, g, b);
                    }
                }
            }
            
            if (vertices.length === 0) {
                console.error("No valid pixels found in the image!");
                return resolve({ pointsCount: 0, boundingBox });
            }

            boundingBox.min.set(-w/2 * 0.22, -h/2 * 0.22, -2.5);
            boundingBox.max.set(w/2 * 0.22, h/2 * 0.22, 2.5);

            pointsCount = vertices.length / 3;
            TEXTURE_WIDTH = Math.ceil(Math.sqrt(pointsCount));
            // Pad points count to fill the texture exactly
            pointsCount = TEXTURE_WIDTH * TEXTURE_WIDTH;

            // 1. Setup GPGPU
            gpuCompute = new GPUComputationRenderer(TEXTURE_WIDTH, TEXTURE_WIDTH, renderer);
            
            const dtPosition = gpuCompute.createTexture();
            const dtVelocity = gpuCompute.createTexture();
            const dtBasePos = gpuCompute.createTexture(); 
            
            const posArr = dtPosition.image.data;
            const velArr = dtVelocity.image.data;
            const baseArr = dtBasePos.image.data;

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
            }
            
            // Explicitly mark textures for update
            dtPosition.needsUpdate = true;
            dtVelocity.needsUpdate = true;
            dtBasePos.needsUpdate = true;

            velVariable = gpuCompute.addVariable("textureVelocity", velocityShader, dtVelocity);
            posVariable = gpuCompute.addVariable("texturePosition", positionShader, dtPosition);
            
            gpuCompute.setVariableDependencies(velVariable, [posVariable, velVariable]);
            gpuCompute.setVariableDependencies(posVariable, [posVariable, velVariable]);
            
            velocityUniforms = velVariable.material.uniforms;
            velocityUniforms.uTime = { value: 0.0 };
            velocityUniforms.uProgress = { value: 0.0 };
            velocityUniforms.uAudioPulse = { value: 0.0 };
            velocityUniforms.uMode = { value: 0 };
            velocityUniforms.textureBasePosition = { value: dtBasePos };

            positionUniforms = posVariable.material.uniforms;
            positionUniforms.uTime = { value: 0.0 };

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
                    pointSize: { value: 1.2 } 
                },
                vertexColors: true,
                vertexShader: `
                    uniform sampler2D texturePosition;
                    uniform float pointSize;
                    // uv and color are automatically injected by Three.js ShaderMaterial
                    varying vec3 vColor;
                    void main() {
                        vec3 pos = texture2D(texturePosition, uv).xyz;
                        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                        gl_Position = projectionMatrix * mvPosition;
                        gl_PointSize = pointSize * (150.0 / -mvPosition.z);
                        vColor = color;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    void main() {
                        vec2 xy = gl_PointCoord.xy - vec2(0.5);
                        float ll = length(xy);
                        if(ll > 0.5) discard;
                        // Lower core opacity to create a thread-like effect with Afterimage
                        gl_FragColor = vec4(vColor * 2.0, 0.4 * (1.0 - (ll*2.0)));
                    }
                `,
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            particleMesh = new THREE.Points(particleGeometry, particleMaterial);
            particleMesh.frustumCulled = false; 
            scene.add(particleMesh);

            resolve({ pointsCount, boundingBox });
        };
    });
}

export function updateGPGPU(time, appState, audioPulse = 0.0) {
    if (!gpuCompute) return;

    velocityUniforms.uTime.value = time;
    velocityUniforms.uProgress.value = appState.uProgress;
    velocityUniforms.uAudioPulse.value = audioPulse;
    velocityUniforms.uMode.value = appState.vectorFieldMode;
    positionUniforms.uTime.value = time;

    gpuCompute.compute();
    particleMaterial.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(posVariable).texture;
}
