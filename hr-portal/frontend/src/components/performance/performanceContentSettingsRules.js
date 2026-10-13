const genericRule = {
    visibleSlots: ['fill', 'reference'],
    forbiddenSlots: ['adjustment', 'view'],
    rootSettingsVariant: 'generic-root',
    itemSettingsVariant: 'generic-item',
    allowedContentTypes: ['work_summary', 'rating', 'custom'],
};
export const stageContentRules = {
    work_summary: {
        ...genericRule,
        visibleSlots: ['fill'],
        forbiddenSlots: ['reference', 'adjustment', 'view'],
        rootSettingsVariant: 'work-summary-root',
        itemSettingsVariant: 'work-summary-item',
    },
    reviewer_360_invite: genericRule,
    reviewer_360_confirm: genericRule,
    evaluation: genericRule,
    calibration: {
        ...genericRule,
        visibleSlots: ['adjustment', 'reference'],
        forbiddenSlots: ['fill', 'view'],
    },
    result_communication: genericRule,
    result_view: {
        ...genericRule,
        visibleSlots: ['view'],
        forbiddenSlots: ['fill', 'reference', 'adjustment'],
        allowedContentTypes: ['rating', 'custom'],
    },
    result_reconsideration: {
        ...genericRule,
        rootSettingsVariant: 'appeal-root',
    },
};
export const contentSlotLabels = {
    fill: '配置填写内容',
    reference: '配置参考内容',
    adjustment: '配置供调整内容',
    view: '配置查看内容',
};
export function getStageContentRule(nodeType) {
    return stageContentRules[nodeType || ''] || genericRule;
}
export function getStageContentTabs(nodeType) {
    return getStageContentRule(nodeType).visibleSlots.map((key) => ({ key, label: contentSlotLabels[key] }));
}
