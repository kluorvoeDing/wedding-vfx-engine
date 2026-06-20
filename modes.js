export const MODE_CONFIGS = [
    {
        id: 6,
        shaderMode: 6,
        label: 'LOGO 形變 (Logo Morph)',
        targetProgress: 1.0,
        params: { intensity: 0.0, turbulence: 0.0, returnForce: 1.0, pointSize: 0.8 }
    }
];

export function getModeConfig(modeId) {
    return MODE_CONFIGS[0];
}
