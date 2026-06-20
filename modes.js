export const MODE_CONFIGS = [
    {
        id: 0,
        shaderMode: 0,
        label: '平靜捲曲 (Curl Noise)',
        targetProgress: 0.35,
        params: { intensity: 0.8, turbulence: 0.65, returnForce: 0.9, pointSize: 0.8 }
    },
    {
        id: 1,
        shaderMode: 1,
        label: '中心爆發 (Reverse Growth)',
        targetProgress: 0.8,
        params: { intensity: 1.1, turbulence: 0.3, returnForce: 0.75, pointSize: 0.8 }
    },
    {
        id: 2,
        shaderMode: 2,
        label: '狂暴龍捲風 (Polar Fluid)',
        targetProgress: 0.85,
        params: { intensity: 1.25, turbulence: 0.9, returnForce: 0.7, pointSize: 0.75 }
    },
    {
        id: 3,
        shaderMode: 3,
        label: '空間碎裂 (Topology Shatter)',
        targetProgress: 0.8,
        params: { intensity: 1.15, turbulence: 1.0, returnForce: 0.65, pointSize: 0.75 }
    },
    {
        id: 4,
        shaderMode: 4,
        label: '螺旋星系 (Spiral Galaxy)',
        targetProgress: 0.75,
        params: { intensity: 1.1, turbulence: 0.25, returnForce: 0.8, pointSize: 0.85 }
    },
    {
        id: 5,
        shaderMode: 5,
        label: '數位陣雨 (Digital Rain)',
        targetProgress: 1.0,
        params: { intensity: 1.0, turbulence: 0.45, returnForce: 0.6, pointSize: 0.7 }
    },
    {
        id: 6,
        shaderMode: 6,
        label: 'LOGO 形變 (Logo Morph)',
        targetProgress: 1.0,
        params: { intensity: 1.0, turbulence: 0.8, returnForce: 1.0, pointSize: 0.8 }
    },
    {
        id: 7,
        shaderMode: 7,
        label: '飛灰消散 (Ash Disintegration)',
        targetProgress: 0.9,
        params: { intensity: 1.15, turbulence: 1.0, returnForce: 0.7, pointSize: 0.65 }
    },
    {
        id: 8,
        shaderMode: 8,
        label: '螢火蟲群聚 (Firefly Swarm)',
        targetProgress: 0.65,
        params: { intensity: 0.75, turbulence: 0.85, returnForce: 0.9, pointSize: 1.0 }
    },
    {
        id: 9,
        shaderMode: 13,
        label: '銀白禮炮 (Silver Finale)',
        targetProgress: 1.0,
        params: { intensity: 1.25, turbulence: 0.75, returnForce: 0.55, pointSize: 1.2 }
    }
];

export function getModeConfig(modeId) {
    const numericId = Number.parseInt(modeId, 10);
    return MODE_CONFIGS.find((mode) => mode.id === numericId) || MODE_CONFIGS[0];
}
