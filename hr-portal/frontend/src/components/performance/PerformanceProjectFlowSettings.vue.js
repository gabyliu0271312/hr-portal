/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import PerformanceCheckbox from '@/components/performance/PerformanceCheckbox.vue';
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue';
import PerformanceMultiSelect from '@/components/performance/PerformanceMultiSelect.vue';
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue';
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue';
const props = withDefaults(defineProps(), { modelValue: () => ({ node_settings: {}, node_times: {} }), peopleOptions: () => [], evaluatedCount: 0, loading: false, error: '' });
const emit = defineEmits();
const draft = ref(cloneSettings(props.modelValue));
const lastEmitted = ref(JSON.stringify(draft.value));
const editingRules = ref({});
const inviteEdit = ref({});
const descriptions = {
    reviewer_360_invite: '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效',
    reviewer_360_confirm: '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效',
    evaluation: '「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效',
    calibration: '校准人可按校准范围查看和修改最终绩效结果（不受汇报线限制）',
};
const handlerOptions = computed(() => [{ value: 'HRBP', label: 'HRBP' }, ...props.peopleOptions]);
const peopleOptions = computed(() => props.peopleOptions);
function cloneSettings(value) {
    return JSON.parse(JSON.stringify(value || { node_settings: {}, node_times: {} }));
}
function nodeKey(node) { return node.node_id || `${node.node_type}-${node.order}`; }
function defaultFor(node) {
    if (node.node_type === 'reviewer_360_invite')
        return { invite: { default_invite: 'DIRECT_SUBORDINATES', minimum_invited_count: 5, exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false } };
    if (node.node_type === 'calibration')
        return { calibration: { force_distribution_enabled: false, phases: [{ rules: [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] }] } };
    if (node.node_type === 'result_view')
        return { result_view: { opening_mode: 'MANUAL' } };
    if (node.node_type === 'result_reconsideration')
        return { result_reconsideration: { handler: null } };
    return {};
}
function ensureNode(node) {
    const key = nodeKey(node);
    const defaults = defaultFor(node);
    if (!draft.value.node_settings[key])
        draft.value.node_settings[key] = defaults;
    const settings = draft.value.node_settings[key];
    if (node.node_type === 'reviewer_360_invite' && !settings.invite)
        settings.invite = defaults.invite;
    if (node.node_type === 'result_view' && !settings.result_view)
        settings.result_view = defaults.result_view;
    if (node.node_type === 'result_reconsideration' && !settings.result_reconsideration)
        settings.result_reconsideration = defaults.result_reconsideration;
    if (node.node_type === 'calibration') {
        const calibration = settings.calibration || defaults.calibration;
        if (!settings.calibration)
            settings.calibration = calibration;
        if (!calibration.phases?.length)
            calibration.phases = defaults.calibration.phases;
        calibration.phases.forEach(phase => { if (!phase.rules?.length)
            phase.rules = [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }]; });
    }
}
function ensureAllNodes() { props.nodes.forEach(ensureNode); }
function inviteSettings(node) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].invite; }
function calibrationSettings(node) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].calibration; }
function resultViewSettings(node) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].result_view; }
function reconsiderationSettings(node) { ensureNode(node); return draft.value.node_settings[nodeKey(node)].result_reconsideration; }
function descriptionFor(node) { return node.description || descriptions[node.node_type] || ''; }
function inviteLabel(value) { return value === 'DIRECT_SUBORDINATES' ? '直属下级' : '暂未配置'; }
function subjectLabel(value) { return value === 'PERSON' ? '人员' : value; }
function scopeLabel(value) { return value === 'PROJECT_ALL' ? '项目全员' : value; }
function ruleKey(node, phaseIndex, ruleIndex) { return `${nodeKey(node)}:${phaseIndex}:${ruleIndex}`; }
function isEditingRule(node, phaseIndex, ruleIndex) { return editingRules.value[ruleKey(node, phaseIndex, ruleIndex)] === true; }
function toggleRuleEdit(node, phaseIndex, ruleIndex) { const key = ruleKey(node, phaseIndex, ruleIndex); editingRules.value[key] = !editingRules.value[key]; }
function setInviteDefault(node, event) { inviteSettings(node).default_invite = event.target.value; }
function setMinimumInviteCount(node, event) { inviteSettings(node).minimum_invited_count = Number(event.target.value); }
function assignedCount(node) { return calibrationSettings(node).phases.reduce((sum, phase) => sum + phase.rules.length, 0) ? props.evaluatedCount : 0; }
function addRule(node, phaseIndex) { calibrationSettings(node).phases[phaseIndex].rules.push({ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }); }
function removeRule(node, phaseIndex, ruleIndex) { const rules = calibrationSettings(node).phases[phaseIndex].rules; if (rules.length > 1)
    rules.splice(ruleIndex, 1); }
function removePhase(node, phaseIndex) { const phases = calibrationSettings(node).phases; if (phases.length > 1)
    phases.splice(phaseIndex, 1); }
function addPhase(node) { calibrationSettings(node).phases.push({ rules: [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] }); }
function setReconsiderationHandler(node, event) { reconsiderationSettings(node).handler = event.target.value || null; }
function setOpeningMode(node, mode, enabled) { if (enabled)
    resultViewSettings(node).opening_mode = mode; }
watch(() => props.modelValue, value => { const next = JSON.stringify(value || { node_settings: {}, node_times: {} }); if (next !== lastEmitted.value) {
    draft.value = cloneSettings(value);
    ensureAllNodes();
    lastEmitted.value = JSON.stringify(draft.value);
} }, { deep: true });
watch(() => props.nodes, ensureAllNodes, { deep: true, immediate: true });
watch(draft, value => { const next = JSON.stringify(value); if (next === lastEmitted.value)
    return; lastEmitted.value = next; emit('update:modelValue', cloneSettings(value)); }, { deep: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ modelValue: () => ({ node_settings: {}, node_times: {} }), peopleOptions: () => [], evaluatedCount: 0, loading: false, error: '' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['flow-node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['node-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['number-field']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['info-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['phase-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-person']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-scope-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['result-view-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-help']} */ ;
/** @type {__VLS_StyleScopedClasses['reconsideration-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "project-flow-settings" },
    'aria-label': "流程设置",
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-state" },
        role: "status",
    });
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-state flow-state--error" },
        role: "alert",
    });
    (__VLS_ctx.error);
}
else if (!__VLS_ctx.nodes.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-state" },
    });
}
else {
    for (const [node] of __VLS_getVForSourceType((__VLS_ctx.nodes))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (node.node_id || `${node.node_type}-${node.order}`),
            ...{ class: "flow-node-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "flow-node-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "flow-node-icon" },
            'aria-hidden': "true",
        });
        /** @type {[typeof PerformanceWorkflowStageIcon, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(PerformanceWorkflowStageIcon, new PerformanceWorkflowStageIcon({
            type: (node.node_type),
        }));
        const __VLS_1 = __VLS_0({
            type: (node.node_type),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flow-node-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        (node.name);
        if (__VLS_ctx.descriptionFor(node)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (__VLS_ctx.descriptionFor(node));
        }
        if (node.node_type === 'reviewer_360_invite') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "node-settings invite-settings" },
                'aria-label': "360°评估人设置",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "settings-heading" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!(node.node_type === 'reviewer_360_invite'))
                            return;
                        __VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)] = !__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)];
                    } },
                ...{ class: "outline-button" },
                type: "button",
            });
            (__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)] ? '完成' : '设置');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "invite-grid" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "invite-column" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-label" },
                for: "default-invite",
            });
            if (__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                    ...{ onChange: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.error))
                                return;
                            if (!!(!__VLS_ctx.nodes.length))
                                return;
                            if (!(node.node_type === 'reviewer_360_invite'))
                                return;
                            if (!(__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]))
                                return;
                            __VLS_ctx.setInviteDefault(node, $event);
                        } },
                    id: "default-invite",
                    value: (__VLS_ctx.inviteSettings(node).default_invite),
                    ...{ class: "field-control" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    value: "DIRECT_SUBORDINATES",
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    value: "NONE",
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.inviteLabel(__VLS_ctx.inviteSettings(node).default_invite));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-label invite-count-label" },
                for: (`invite-count-${__VLS_ctx.nodeKey(node)}`),
            });
            if (__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "number-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    ...{ onInput: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.error))
                                return;
                            if (!!(!__VLS_ctx.nodes.length))
                                return;
                            if (!(node.node_type === 'reviewer_360_invite'))
                                return;
                            if (!(__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]))
                                return;
                            __VLS_ctx.setMinimumInviteCount(node, $event);
                        } },
                    id: (`invite-count-${__VLS_ctx.nodeKey(node)}`),
                    value: (__VLS_ctx.inviteSettings(node).minimum_invited_count),
                    type: "number",
                    min: "0",
                    max: "100",
                });
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "setting-value" },
                });
                (__VLS_ctx.inviteSettings(node).minimum_invited_count);
            }
            if (__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "check-line" },
                });
                /** @type {[typeof PerformanceCheckbox, ]} */ ;
                // @ts-ignore
                const __VLS_3 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.inviteSettings(node).exclude_default_invite_from_limit),
                    label: "“直属下级”不计入邀请人数限制",
                }));
                const __VLS_4 = __VLS_3({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.inviteSettings(node).exclude_default_invite_from_limit),
                    label: "“直属下级”不计入邀请人数限制",
                }, ...__VLS_functionalComponentArgsRest(__VLS_3));
                let __VLS_6;
                let __VLS_7;
                let __VLS_8;
                const __VLS_9 = {
                    'onUpdate:modelValue': (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!(node.node_type === 'reviewer_360_invite'))
                            return;
                        if (!(__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]))
                            return;
                        __VLS_ctx.inviteSettings(node).exclude_default_invite_from_limit = $event;
                    }
                };
                var __VLS_5;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "setting-value" },
                });
                (__VLS_ctx.inviteSettings(node).exclude_default_invite_from_limit ? '“直属下级”不计入邀请人数限制' : '“直属下级”计入邀请人数限制');
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "invite-column" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-label" },
            });
            if (__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]) {
                /** @type {[typeof PerformanceMultiSelect, ]} */ ;
                // @ts-ignore
                const __VLS_10 = __VLS_asFunctionalComponent(PerformanceMultiSelect, new PerformanceMultiSelect({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.inviteSettings(node).recommended_invite),
                    options: (__VLS_ctx.peopleOptions),
                    placeholder: "暂未配置",
                }));
                const __VLS_11 = __VLS_10({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.inviteSettings(node).recommended_invite),
                    options: (__VLS_ctx.peopleOptions),
                    placeholder: "暂未配置",
                }, ...__VLS_functionalComponentArgsRest(__VLS_10));
                let __VLS_13;
                let __VLS_14;
                let __VLS_15;
                const __VLS_16 = {
                    'onUpdate:modelValue': (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!(node.node_type === 'reviewer_360_invite'))
                            return;
                        if (!(__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]))
                            return;
                        __VLS_ctx.inviteSettings(node).recommended_invite = $event;
                    }
                };
                var __VLS_12;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (__VLS_ctx.inviteSettings(node).recommended_invite.length ? __VLS_ctx.inviteSettings(node).recommended_invite.join('、') : '暂未配置');
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-label invite-count-label" },
            });
            if (__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]) {
                /** @type {[typeof PerformanceSwitch, ]} */ ;
                // @ts-ignore
                const __VLS_17 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.inviteSettings(node).allow_voluntary_evaluation),
                    'aria-label': "允许自愿评估",
                }));
                const __VLS_18 = __VLS_17({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.inviteSettings(node).allow_voluntary_evaluation),
                    'aria-label': "允许自愿评估",
                }, ...__VLS_functionalComponentArgsRest(__VLS_17));
                let __VLS_20;
                let __VLS_21;
                let __VLS_22;
                const __VLS_23 = {
                    'onUpdate:modelValue': (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!(node.node_type === 'reviewer_360_invite'))
                            return;
                        if (!(__VLS_ctx.inviteEdit[__VLS_ctx.nodeKey(node)]))
                            return;
                        __VLS_ctx.inviteSettings(node).allow_voluntary_evaluation = $event;
                    }
                };
                var __VLS_19;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ class: "setting-value" },
                });
                (__VLS_ctx.inviteSettings(node).allow_voluntary_evaluation ? '允许' : '不允许');
            }
        }
        else if (node.node_type === 'calibration') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "node-settings calibration-settings" },
                'aria-label': "校准规则设置",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "calibration-switch-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            /** @type {[typeof PerformanceSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.calibrationSettings(node).force_distribution_enabled),
                'aria-label': "绩效结果强制建议分布",
            }));
            const __VLS_25 = __VLS_24({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.calibrationSettings(node).force_distribution_enabled),
                'aria-label': "绩效结果强制建议分布",
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            let __VLS_27;
            let __VLS_28;
            let __VLS_29;
            const __VLS_30 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!!(node.node_type === 'reviewer_360_invite'))
                        return;
                    if (!(node.node_type === 'calibration'))
                        return;
                    __VLS_ctx.calibrationSettings(node).force_distribution_enabled = $event;
                }
            };
            var __VLS_26;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "settings-heading calibration-heading" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "required-mark" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "info-mark" },
                'aria-label': "校准规则说明",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "calibration-summary" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "info-circle" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.evaluatedCount);
            (__VLS_ctx.assignedCount(node));
            (Math.max(0, __VLS_ctx.evaluatedCount - __VLS_ctx.assignedCount(node)));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                type: "button",
                ...{ class: "link-button" },
            });
            for (const [phase, phaseIndex] of __VLS_getVForSourceType((__VLS_ctx.calibrationSettings(node).phases))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (phaseIndex),
                    ...{ class: "calibration-phase" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "phase-heading" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "phase-title" },
                });
                (phaseIndex + 1);
                /** @type {[typeof PerformanceIconButton, ]} */ ;
                // @ts-ignore
                const __VLS_31 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
                    ...{ 'onClick': {} },
                    icon: "DeleteTrashOutlined",
                    label: (`删除第 ${phaseIndex + 1} 阶段`),
                    disabled: (__VLS_ctx.calibrationSettings(node).phases.length <= 1),
                }));
                const __VLS_32 = __VLS_31({
                    ...{ 'onClick': {} },
                    icon: "DeleteTrashOutlined",
                    label: (`删除第 ${phaseIndex + 1} 阶段`),
                    disabled: (__VLS_ctx.calibrationSettings(node).phases.length <= 1),
                }, ...__VLS_functionalComponentArgsRest(__VLS_31));
                let __VLS_34;
                let __VLS_35;
                let __VLS_36;
                const __VLS_37 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!!(node.node_type === 'reviewer_360_invite'))
                            return;
                        if (!(node.node_type === 'calibration'))
                            return;
                        __VLS_ctx.removePhase(node, phaseIndex);
                    }
                };
                var __VLS_33;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "rule-table" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "rule-table-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                for (const [rule, ruleIndex] of __VLS_getVForSourceType((phase.rules))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (ruleIndex),
                        ...{ class: "rule-row" },
                    });
                    if (__VLS_ctx.isEditingRule(node, phaseIndex, ruleIndex)) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                            value: (rule.subject_type),
                            'aria-label': "校准人类型",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                            value: "PERSON",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "scope-editor" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                            value: (rule.operator),
                            'aria-label': "校准范围操作",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                            value: "INCLUDE",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                            value: "EXCLUDE",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                            value: (rule.scope),
                            'aria-label': "校准范围",
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                            value: "PROJECT_ALL",
                        });
                    }
                    else {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "rule-person" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "rule-tag" },
                        });
                        (__VLS_ctx.subjectLabel(rule.subject_type));
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                        (rule.operator === 'INCLUDE' ? '包含...' : '不包含...');
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "rule-scope-tag" },
                        });
                        (__VLS_ctx.scopeLabel(rule.scope));
                    }
                    /** @type {[typeof PerformanceCheckbox, ]} */ ;
                    // @ts-ignore
                    const __VLS_38 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
                        ...{ 'onUpdate:modelValue': {} },
                        modelValue: (rule.allow_authorize),
                        label: "",
                    }));
                    const __VLS_39 = __VLS_38({
                        ...{ 'onUpdate:modelValue': {} },
                        modelValue: (rule.allow_authorize),
                        label: "",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
                    let __VLS_41;
                    let __VLS_42;
                    let __VLS_43;
                    const __VLS_44 = {
                        'onUpdate:modelValue': (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.error))
                                return;
                            if (!!(!__VLS_ctx.nodes.length))
                                return;
                            if (!!(node.node_type === 'reviewer_360_invite'))
                                return;
                            if (!(node.node_type === 'calibration'))
                                return;
                            rule.allow_authorize = $event;
                        }
                    };
                    var __VLS_40;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "rule-actions" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.loading))
                                    return;
                                if (!!(__VLS_ctx.error))
                                    return;
                                if (!!(!__VLS_ctx.nodes.length))
                                    return;
                                if (!!(node.node_type === 'reviewer_360_invite'))
                                    return;
                                if (!(node.node_type === 'calibration'))
                                    return;
                                __VLS_ctx.toggleRuleEdit(node, phaseIndex, ruleIndex);
                            } },
                        type: "button",
                        ...{ class: "text-button" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!!(__VLS_ctx.loading))
                                    return;
                                if (!!(__VLS_ctx.error))
                                    return;
                                if (!!(!__VLS_ctx.nodes.length))
                                    return;
                                if (!!(node.node_type === 'reviewer_360_invite'))
                                    return;
                                if (!(node.node_type === 'calibration'))
                                    return;
                                __VLS_ctx.removeRule(node, phaseIndex, ruleIndex);
                            } },
                        type: "button",
                        ...{ class: "text-button" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.loading))
                                return;
                            if (!!(__VLS_ctx.error))
                                return;
                            if (!!(!__VLS_ctx.nodes.length))
                                return;
                            if (!!(node.node_type === 'reviewer_360_invite'))
                                return;
                            if (!(node.node_type === 'calibration'))
                                return;
                            __VLS_ctx.addRule(node, phaseIndex);
                        } },
                    type: "button",
                    ...{ class: "link-button add-rule" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!!(node.node_type === 'reviewer_360_invite'))
                            return;
                        if (!(node.node_type === 'calibration'))
                            return;
                        __VLS_ctx.addPhase(node);
                    } },
                type: "button",
                ...{ class: "link-button add-phase" },
            });
        }
        else if (node.node_type === 'result_view') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "node-settings result-view-settings" },
                'aria-label': "绩效结果查看设置",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "required-mark" },
            });
            /** @type {[typeof PerformanceCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.resultViewSettings(node).opening_mode === 'AUTOMATIC'),
                label: "按流程自动开通",
            }));
            const __VLS_46 = __VLS_45({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.resultViewSettings(node).opening_mode === 'AUTOMATIC'),
                label: "按流程自动开通",
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            let __VLS_48;
            let __VLS_49;
            let __VLS_50;
            const __VLS_51 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!!(node.node_type === 'reviewer_360_invite'))
                        return;
                    if (!!(node.node_type === 'calibration'))
                        return;
                    if (!(node.node_type === 'result_view'))
                        return;
                    __VLS_ctx.setOpeningMode(node, 'AUTOMATIC', $event);
                }
            };
            var __VLS_47;
            /** @type {[typeof PerformanceCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_52 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.resultViewSettings(node).opening_mode === 'MANUAL'),
                label: "手动开通",
            }));
            const __VLS_53 = __VLS_52({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.resultViewSettings(node).opening_mode === 'MANUAL'),
                label: "手动开通",
            }, ...__VLS_functionalComponentArgsRest(__VLS_52));
            let __VLS_55;
            let __VLS_56;
            let __VLS_57;
            const __VLS_58 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!!(node.node_type === 'reviewer_360_invite'))
                        return;
                    if (!!(node.node_type === 'calibration'))
                        return;
                    if (!(node.node_type === 'result_view'))
                        return;
                    __VLS_ctx.setOpeningMode(node, 'MANUAL', $event);
                }
            };
            var __VLS_54;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "setting-help" },
            });
        }
        else if (node.node_type === 'result_reconsideration') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "node-settings reconsideration-settings" },
                'aria-label': "结果复议处理设置",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                ...{ onChange: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!!(!__VLS_ctx.nodes.length))
                            return;
                        if (!!(node.node_type === 'reviewer_360_invite'))
                            return;
                        if (!!(node.node_type === 'calibration'))
                            return;
                        if (!!(node.node_type === 'result_view'))
                            return;
                        if (!(node.node_type === 'result_reconsideration'))
                            return;
                        __VLS_ctx.setReconsiderationHandler(node, $event);
                    } },
                value: (__VLS_ctx.reconsiderationSettings(node).handler),
                ...{ class: "field-control" },
                'aria-label': "结果复议处理人",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: (null),
            });
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.handlerOptions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                    key: (option.value),
                    value: (option.value),
                });
                (option.label);
            }
        }
    }
}
/** @type {__VLS_StyleScopedClasses['project-flow-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-state']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-state']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-state--error']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-state']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-header']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['node-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['outline-button']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-column']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-count-label']} */ ;
/** @type {__VLS_StyleScopedClasses['number-field']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-value']} */ ;
/** @type {__VLS_StyleScopedClasses['check-line']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-value']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-column']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-count-label']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-value']} */ ;
/** @type {__VLS_StyleScopedClasses['node-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['info-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['info-circle']} */ ;
/** @type {__VLS_StyleScopedClasses['link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['calibration-phase']} */ ;
/** @type {__VLS_StyleScopedClasses['phase-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['phase-title']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-table']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-table-header']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-person']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-scope-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['text-button']} */ ;
/** @type {__VLS_StyleScopedClasses['link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['add-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['add-phase']} */ ;
/** @type {__VLS_StyleScopedClasses['node-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['result-view-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-help']} */ ;
/** @type {__VLS_StyleScopedClasses['node-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['reconsideration-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceCheckbox: PerformanceCheckbox,
            PerformanceIconButton: PerformanceIconButton,
            PerformanceMultiSelect: PerformanceMultiSelect,
            PerformanceSwitch: PerformanceSwitch,
            PerformanceWorkflowStageIcon: PerformanceWorkflowStageIcon,
            inviteEdit: inviteEdit,
            handlerOptions: handlerOptions,
            peopleOptions: peopleOptions,
            nodeKey: nodeKey,
            inviteSettings: inviteSettings,
            calibrationSettings: calibrationSettings,
            resultViewSettings: resultViewSettings,
            reconsiderationSettings: reconsiderationSettings,
            descriptionFor: descriptionFor,
            inviteLabel: inviteLabel,
            subjectLabel: subjectLabel,
            scopeLabel: scopeLabel,
            isEditingRule: isEditingRule,
            toggleRuleEdit: toggleRuleEdit,
            setInviteDefault: setInviteDefault,
            setMinimumInviteCount: setMinimumInviteCount,
            assignedCount: assignedCount,
            addRule: addRule,
            removeRule: removeRule,
            removePhase: removePhase,
            addPhase: addPhase,
            setReconsiderationHandler: setReconsiderationHandler,
            setOpeningMode: setOpeningMode,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
