const DENSITY_SETTINGS = {
    1: { density: 1, imageStep: 1, logoStep: 1, minParticles: 240000 },
    2: { density: 2, imageStep: 2, logoStep: 2, minParticles: 160000 },
    3: { density: 3, imageStep: 3, logoStep: 3, minParticles: 100000 },
    4: { density: 4, imageStep: 4, logoStep: 4, minParticles: 60000 },
    5: { density: 5, imageStep: 5, logoStep: 5, minParticles: 30000 }
};

export function getParticleSettings(value) {
    const parsed = Number.parseInt(value, 10);
    const density = Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 1;
    return { ...DENSITY_SETTINGS[density] };
}
