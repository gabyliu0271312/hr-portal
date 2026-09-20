export const PERFORMANCE_LEVEL_COLORS = [
    { value: 'rgb(251, 191, 188)', trigger: 'rgb(253, 226, 226)' },
    { value: 'rgb(254, 212, 164)', trigger: 'rgb(254, 234, 210)' },
    { value: 'rgb(248, 230, 171)', trigger: 'rgb(250, 241, 209)' },
    { value: 'rgb(183, 237, 177)', trigger: 'rgb(217, 245, 214)' },
    { value: 'rgb(169, 239, 230)', trigger: 'rgb(211, 247, 242)' },
    { value: 'rgb(177, 232, 252)', trigger: 'rgb(215, 243, 253)' },
    { value: 'rgb(186, 206, 253)', trigger: 'rgb(221, 232, 254)' },
    { value: 'rgb(180, 185, 243)', trigger: 'rgb(222, 224, 250)' },
    { value: 'rgb(205, 178, 250)', trigger: 'rgb(233, 220, 252)' },
    { value: 'rgb(239, 185, 239)', trigger: 'rgb(248, 221, 248)' },
    { value: 'rgb(249, 174, 217)', trigger: 'rgb(252, 217, 237)' },
    { value: 'rgb(210, 211, 212)', trigger: 'rgb(235, 236, 237)' },
];
export function performanceLevelBackground(value) {
    if (typeof value !== 'string')
        return 'transparent';
    const normalized = value.replace(/\s+/g, '').toLowerCase();
    return PERFORMANCE_LEVEL_COLORS.find(option => option.value.replace(/\s+/g, '').toLowerCase() === normalized)?.trigger ?? value;
}
