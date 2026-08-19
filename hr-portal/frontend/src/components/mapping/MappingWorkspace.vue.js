/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ElMessage } from 'element-plus';
import { ref, computed, nextTick } from 'vue';
import { RULE_TYPES, RULE_LABELS, createEmptyRule, mappingApi, } from '@/api/mapping';
import FieldEditor from './rules/FieldEditor.vue';
import ValueMapEditor from './rules/ValueMapEditor.vue';
import ReferenceLookupEditor from './rules/ReferenceLookupEditor.vue';
import IdentityWithOverridesEditor from './rules/IdentityWithOverridesEditor.vue';
import TypeConvertEditor from './rules/TypeConvertEditor.vue';
import FormatEditor from './rules/FormatEditor.vue';
import SplitMergeEditor from './rules/SplitMergeEditor.vue';
const props = defineProps();
const emit = defineEmits();
const document = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});
const allRules = computed(() => document.value.ruleSet.rules);
const rules = computed(() => {
    if (!props.visibleRuleTypes)
        return allRules.value;
    return allRules.value.filter((rule) => props.visibleRuleTypes.includes(rule.type));
});
const dirty = ref(false);
const editingRuleId = ref(null);
const validating = ref(false);
const previewing = ref(false);
const previewResult = ref(null);
const workspaceRoot = ref(null);
const toggleRefs = ref({});
const panelRefs = ref({});
const addRuleRef = ref(null);
function setToggleRef(id, element) {
    toggleRefs.value[id] = element;
}
function setPanelRef(id, element) {
    panelRefs.value[id] = element;
}
const callerLabels = {
    warehouse: '数据仓库',
    workflow: '流程编排',
    ucp_transform: 'UCP TRANSFORM',
    warehouse_sink: '资产入仓',
    push_target: '推送目标',
};
const callerLabel = computed(() => callerLabels[props.policy.caller] || props.policy.caller);
const allowedRuleTypes = computed(() => {
    return RULE_TYPES.filter((rt) => (props.policy.allowedRuleTypes.includes(rt)
        && (!props.visibleRuleTypes || props.visibleRuleTypes.includes(rt))));
});
const canEdit = computed(() => (props.policy.effects.allowSave
    && props.policy.legacy.allowLegacyWrite
    && (!props.compatibility || props.compatibility.writable)));
const canValidate = computed(() => props.policy.effects.allowPreview || props.policy.effects.allowSave);
const canPublish = computed(() => props.policy.effects.allowPublish && canEdit.value);
const canExecute = computed(() => props.policy.effects.allowExecute);
const canRebuild = computed(() => props.policy.effects.allowRebuild);
const policyDenied = computed(() => {
    if (!props.policy.effects.allowPreview && !props.policy.effects.allowSave) {
        return '当前调用方策略禁止校验、预览和保存';
    }
    if (!canEdit.value) {
        return '当前调用方策略或兼容状态禁止修改映射规则';
    }
    return null;
});
const previewColumns = computed(() => {
    if (!previewResult.value?.outputRows?.length)
        return [];
    const cols = new Set();
    previewResult.value.outputRows.forEach((row) => {
        Object.keys(row).forEach((k) => cols.add(k));
    });
    return Array.from(cols).slice(0, 20);
});
function ruleLabel(type) {
    return RULE_LABELS[type] || type;
}
function ruleEditorComponent(type) {
    const map = {
        field: FieldEditor,
        value_map: ValueMapEditor,
        reference_lookup: ReferenceLookupEditor,
        identity_with_overrides: IdentityWithOverridesEditor,
        type_convert: TypeConvertEditor,
        format: FormatEditor,
        split_merge: SplitMergeEditor,
    };
    return map[type] || null;
}
function ruleSummary(rule) {
    const src = rule.sourceFields.join(', ');
    const tgt = rule.targetFields.join(', ');
    if (rule.type === 'field') {
        return `${src} → ${tgt} (${rule.config.mode || 'rename'})`;
    }
    if (rule.type === 'value_map') {
        const cfg = rule.config;
        return `${src} → ${tgt} (${Object.keys(cfg.mappings || {}).length} 条映射)`;
    }
    if (rule.type === 'reference_lookup') {
        const cfg = rule.config;
        return `${src} → ${tgt} (参考: ${cfg.referenceDatasetId || '?'})`;
    }
    if (rule.type === 'identity_with_overrides') {
        const cfg = rule.config;
        return `${src} → ${tgt} (${Object.keys(cfg.overrides || {}).length} 条例外)`;
    }
    if (rule.type === 'type_convert') {
        const cfg = rule.config;
        return `${src} → ${tgt} (→ ${cfg.targetType})`;
    }
    if (rule.type === 'format') {
        const cfg = rule.config;
        return `${src} → ${tgt} (${cfg.formatType})`;
    }
    if (rule.type === 'split_merge') {
        const cfg = rule.config;
        return `${cfg.action}: ${src} → ${tgt}`;
    }
    return `${src} → ${tgt}`;
}
async function focusRuleEditor(ruleId) {
    await nextTick();
    const panel = panelRefs.value[ruleId];
    const firstControl = panel?.querySelector('button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])');
    (firstControl || panel)?.focus();
}
function focusAddRule() {
    const refValue = addRuleRef.value;
    const target = refValue && ('$el' in refValue ? refValue.$el : refValue);
    if (target instanceof HTMLElement)
        target.focus();
}
async function addRule(type) {
    if (!canEdit.value)
        return;
    const rule = createEmptyRule(type);
    rule.displayOrder = allRules.value.length;
    document.value.ruleSet.rules.push(rule);
    editingRuleId.value = rule.id;
    markDirty();
    await focusRuleEditor(rule.id);
}
async function removeRule(ruleId) {
    if (!canEdit.value)
        return;
    const index = allRules.value.findIndex((rule) => rule.id === ruleId);
    if (index < 0)
        return;
    const wasEditing = editingRuleId.value === ruleId;
    document.value.ruleSet.rules.splice(index, 1);
    document.value.ruleSet.rules.forEach((rule, ruleIndex) => (rule.displayOrder = ruleIndex));
    if (wasEditing)
        editingRuleId.value = null;
    markDirty();
    if (!wasEditing)
        return;
    await nextTick();
    const successor = rules.value[0];
    if (successor)
        toggleRefs.value[successor.id]?.focus();
    else
        focusAddRule();
}
async function duplicateRule(ruleId) {
    if (!canEdit.value)
        return;
    const original = allRules.value.find((rule) => rule.id === ruleId);
    if (!original)
        return;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    copy.displayOrder = allRules.value.length;
    document.value.ruleSet.rules.push(copy);
    editingRuleId.value = copy.id;
    markDirty();
    await focusRuleEditor(copy.id);
}
function moveUp(ruleId) {
    const index = rules.value.findIndex((rule) => rule.id === ruleId);
    if (!canEdit.value || index <= 0)
        return;
    swapRules(ruleId, rules.value[index - 1].id);
    markDirty();
}
function moveDown(ruleId) {
    const index = rules.value.findIndex((rule) => rule.id === ruleId);
    if (!canEdit.value || index < 0 || index === rules.value.length - 1)
        return;
    swapRules(ruleId, rules.value[index + 1].id);
    markDirty();
}
function swapRules(firstRuleId, secondRuleId) {
    const firstIndex = allRules.value.findIndex((rule) => rule.id === firstRuleId);
    const secondIndex = allRules.value.findIndex((rule) => rule.id === secondRuleId);
    if (firstIndex < 0 || secondIndex < 0)
        return;
    const firstRule = document.value.ruleSet.rules[firstIndex];
    document.value.ruleSet.rules[firstIndex] = document.value.ruleSet.rules[secondIndex];
    document.value.ruleSet.rules[secondIndex] = firstRule;
    document.value.ruleSet.rules.forEach((rule, ruleIndex) => (rule.displayOrder = ruleIndex));
}
async function toggleEdit(ruleId) {
    if (!canEdit.value)
        return;
    const rule = rules.value.find((item) => item.id === ruleId);
    if (!rule)
        return;
    const closing = editingRuleId.value === ruleId;
    editingRuleId.value = closing ? null : ruleId;
    if (closing) {
        await nextTick();
        toggleRefs.value[rule.id]?.focus();
        return;
    }
    await focusRuleEditor(rule.id);
}
function markDirty() {
    if (!canEdit.value)
        return;
    dirty.value = true;
    emit('dirty', true);
}
async function doValidate() {
    validating.value = true;
    try {
        const res = await mappingApi.validate(document.value, props.policy);
        emit('validate', { valid: res.data.valid, warnings: res.data.warnings || [] });
        if (!res.data.valid) {
            ElMessage.error('校验未通过');
        }
        else if (res.data.warnings?.length) {
            ElMessage.warning(`校验通过, ${res.data.warnings.length} 条警告`);
        }
        else {
            ElMessage.success('校验通过');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || '校验失败');
    }
    finally {
        validating.value = false;
    }
}
async function doPreview() {
    if (!props.policy.effects.allowPreview) {
        ElMessage.error('当前调用方策略禁止预览');
        return;
    }
    if (!props.previewRows?.length) {
        ElMessage.warning('无预览数据');
        return;
    }
    previewing.value = true;
    try {
        previewResult.value = await mappingApi.preview(document.value, props.previewRows, props.referenceSnapshot, props.policy);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || '预览失败');
    }
    finally {
        previewing.value = false;
    }
}
async function focusRule(ruleId) {
    if (!rules.value.some((rule) => rule.id === ruleId) || !canEdit.value)
        return false;
    workspaceRoot.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    editingRuleId.value = ruleId;
    await focusRuleEditor(ruleId);
    panelRefs.value[ruleId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
}
// 暴露方法给父组件
const __VLS_exposed = {
    markDirty,
    focusRule,
    doValidate,
    doPreview,
    canEdit,
    canPublish,
    canExecute,
    canRebuild,
    resetDirty: () => {
        dirty.value = false;
        emit('dirty', false);
    },
};
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['compat-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-stats']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "workspaceRoot",
    ...{ class: "mapping-workspace" },
});
/** @type {typeof __VLS_ctx.workspaceRoot} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workspace-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "caller-tag" },
    ...{ class: (`caller-${__VLS_ctx.policy.caller}`) },
});
(__VLS_ctx.callerLabel);
if (__VLS_ctx.document.ruleSet.sourceAsset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "asset-info" },
    });
    (__VLS_ctx.document.ruleSet.sourceAsset);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "arrow" },
    });
    if (__VLS_ctx.document.ruleSet.targetAsset) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.document.ruleSet.targetAsset);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "schema-version" },
});
(__VLS_ctx.document.mappingSchemaVersion);
if (__VLS_ctx.compatibility) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "compat-tag" },
        ...{ class: ({ lossy: !__VLS_ctx.compatibility.writable }) },
    });
    (__VLS_ctx.compatibility.sourceFormat || 'component_v1');
    if (!__VLS_ctx.compatibility.writable) {
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-right" },
});
if (__VLS_ctx.dirty) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "dirty-tag" },
    });
}
if (__VLS_ctx.canValidate) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.validating),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.validating),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.doValidate)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
if (props.policy.effects.allowPreview) {
    const __VLS_8 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.previewing),
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.previewing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (__VLS_ctx.doPreview)
    };
    __VLS_11.slots.default;
    var __VLS_11;
}
var __VLS_16 = {
    canSave: (__VLS_ctx.canEdit),
    canPublish: (__VLS_ctx.canPublish),
    canExecute: (__VLS_ctx.canExecute),
    canRebuild: (__VLS_ctx.canRebuild),
};
if (__VLS_ctx.policyDenied) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "policy-denied" },
    });
    const __VLS_18 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
        title: (__VLS_ctx.policyDenied),
        type: "error",
        closable: (false),
    }));
    const __VLS_20 = __VLS_19({
        title: (__VLS_ctx.policyDenied),
        type: "error",
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
}
if (__VLS_ctx.compatibility && !__VLS_ctx.compatibility.writable) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "compat-blocked" },
    });
    const __VLS_22 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
        type: "warning",
        closable: (false),
    }));
    const __VLS_24 = __VLS_23({
        type: "warning",
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    __VLS_25.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_25.slots;
        (__VLS_ctx.compatibility.lossyFields.join(', '));
    }
    var __VLS_25;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-status" },
    'aria-live': "polite",
    'aria-atomic': "true",
});
if (__VLS_ctx.dirty) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-list" },
});
for (const [rule, index] of __VLS_getVForSourceType((__VLS_ctx.rules))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (rule.id),
        ...{ class: "rule-item" },
        ...{ class: ({ disabled: !rule.enabled, editing: __VLS_ctx.editingRuleId === rule.id }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-left" },
    });
    const __VLS_26 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
        ...{ 'onChange': {} },
        modelValue: (rule.enabled),
        size: "small",
        'aria-label': (`${index + 1} ${__VLS_ctx.ruleLabel(rule.type)} 规则启用状态`),
        disabled: (!__VLS_ctx.canEdit),
    }));
    const __VLS_28 = __VLS_27({
        ...{ 'onChange': {} },
        modelValue: (rule.enabled),
        size: "small",
        'aria-label': (`${index + 1} ${__VLS_ctx.ruleLabel(rule.type)} 规则启用状态`),
        disabled: (!__VLS_ctx.canEdit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    let __VLS_30;
    let __VLS_31;
    let __VLS_32;
    const __VLS_33 = {
        onChange: (__VLS_ctx.markDirty)
    };
    var __VLS_29;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.toggleEdit(rule.id);
            } },
        type: "button",
        ...{ class: "rule-toggle" },
        'aria-expanded': (__VLS_ctx.editingRuleId === rule.id),
        'aria-controls': (`mapping-rule-panel-${rule.id}`),
        'aria-label': (`${index + 1} ${__VLS_ctx.ruleLabel(rule.type)} 规则，${__VLS_ctx.editingRuleId === rule.id ? '收起' : '展开'}`),
        ref: ((element) => __VLS_ctx.setToggleRef(rule.id, element)),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rule-type-badge" },
        ...{ class: (`type-${rule.type}`) },
    });
    (__VLS_ctx.ruleLabel(rule.type));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rule-summary" },
    });
    (__VLS_ctx.ruleSummary(rule));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: () => { } },
        ...{ class: "rule-actions" },
    });
    const __VLS_34 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        disabled: (!__VLS_ctx.canEdit || index === 0),
    }));
    const __VLS_36 = __VLS_35({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        disabled: (!__VLS_ctx.canEdit || index === 0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_35));
    let __VLS_38;
    let __VLS_39;
    let __VLS_40;
    const __VLS_41 = {
        onClick: (...[$event]) => {
            __VLS_ctx.moveUp(rule.id);
        }
    };
    __VLS_37.slots.default;
    var __VLS_37;
    const __VLS_42 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent(__VLS_42, new __VLS_42({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        disabled: (!__VLS_ctx.canEdit || index === __VLS_ctx.rules.length - 1),
    }));
    const __VLS_44 = __VLS_43({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        disabled: (!__VLS_ctx.canEdit || index === __VLS_ctx.rules.length - 1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    let __VLS_46;
    let __VLS_47;
    let __VLS_48;
    const __VLS_49 = {
        onClick: (...[$event]) => {
            __VLS_ctx.moveDown(rule.id);
        }
    };
    __VLS_45.slots.default;
    var __VLS_45;
    const __VLS_50 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        disabled: (!__VLS_ctx.canEdit),
    }));
    const __VLS_52 = __VLS_51({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        disabled: (!__VLS_ctx.canEdit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    let __VLS_54;
    let __VLS_55;
    let __VLS_56;
    const __VLS_57 = {
        onClick: (...[$event]) => {
            __VLS_ctx.duplicateRule(rule.id);
        }
    };
    __VLS_53.slots.default;
    var __VLS_53;
    const __VLS_58 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        size: "small",
        disabled: (!__VLS_ctx.canEdit),
    }));
    const __VLS_60 = __VLS_59({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        size: "small",
        disabled: (!__VLS_ctx.canEdit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_59));
    let __VLS_62;
    let __VLS_63;
    let __VLS_64;
    const __VLS_65 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeRule(rule.id);
        }
    };
    __VLS_61.slots.default;
    var __VLS_61;
    if (__VLS_ctx.editingRuleId === rule.id) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            id: (`mapping-rule-panel-${rule.id}`),
            ...{ class: "rule-editor-panel" },
            role: "region",
            tabindex: "-1",
            ref: ((element) => __VLS_ctx.setPanelRef(rule.id, element)),
            'aria-label': (`${index + 1} ${__VLS_ctx.ruleLabel(rule.type)} 规则编辑`),
        });
        const __VLS_66 = ((__VLS_ctx.ruleEditorComponent(rule.type)));
        // @ts-ignore
        const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
            ...{ 'onChange': {} },
            rule: (rule),
            sourceFields: (__VLS_ctx.sourceFields),
            targetFields: (__VLS_ctx.targetFields),
            policy: (__VLS_ctx.policy),
        }));
        const __VLS_68 = __VLS_67({
            ...{ 'onChange': {} },
            rule: (rule),
            sourceFields: (__VLS_ctx.sourceFields),
            targetFields: (__VLS_ctx.targetFields),
            policy: (__VLS_ctx.policy),
        }, ...__VLS_functionalComponentArgsRest(__VLS_67));
        let __VLS_70;
        let __VLS_71;
        let __VLS_72;
        const __VLS_73 = {
            onChange: (__VLS_ctx.markDirty)
        };
        var __VLS_69;
    }
}
if (__VLS_ctx.canEdit) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "add-rule-area" },
    });
    const __VLS_74 = {}.ElDropdown;
    /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
        ...{ 'onCommand': {} },
        trigger: "click",
    }));
    const __VLS_76 = __VLS_75({
        ...{ 'onCommand': {} },
        trigger: "click",
    }, ...__VLS_functionalComponentArgsRest(__VLS_75));
    let __VLS_78;
    let __VLS_79;
    let __VLS_80;
    const __VLS_81 = {
        onCommand: (__VLS_ctx.addRule)
    };
    __VLS_77.slots.default;
    const __VLS_82 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
        ref: "addRuleRef",
    }));
    const __VLS_84 = __VLS_83({
        ref: "addRuleRef",
    }, ...__VLS_functionalComponentArgsRest(__VLS_83));
    /** @type {typeof __VLS_ctx.addRuleRef} */ ;
    var __VLS_86 = {};
    __VLS_85.slots.default;
    var __VLS_85;
    {
        const { dropdown: __VLS_thisSlot } = __VLS_77.slots;
        const __VLS_88 = {}.ElDropdownMenu;
        /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
        const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        for (const [rt] of __VLS_getVForSourceType((__VLS_ctx.allowedRuleTypes))) {
            const __VLS_92 = {}.ElDropdownItem;
            /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                key: (rt),
                command: (rt),
            }));
            const __VLS_94 = __VLS_93({
                key: (rt),
                command: (rt),
            }, ...__VLS_functionalComponentArgsRest(__VLS_93));
            __VLS_95.slots.default;
            (__VLS_ctx.ruleLabel(rt));
            var __VLS_95;
        }
        var __VLS_91;
    }
    var __VLS_77;
}
if (__VLS_ctx.previewResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "preview-panel" },
    });
    const __VLS_96 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        contentPosition: "left",
    }));
    const __VLS_98 = __VLS_97({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    var __VLS_99;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "preview-stats" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.previewResult.stats.input);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.previewResult.stats.output);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "matched" },
    });
    (__VLS_ctx.previewResult.stats.matched);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "unmatched" },
    });
    (__VLS_ctx.previewResult.stats.unmatched);
    if (__VLS_ctx.previewResult.stats.errors) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "errors" },
        });
        (__VLS_ctx.previewResult.stats.errors);
    }
    const __VLS_100 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        data: (__VLS_ctx.previewResult.outputRows),
        maxHeight: "300",
        size: "small",
        border: true,
    }));
    const __VLS_102 = __VLS_101({
        data: (__VLS_ctx.previewResult.outputRows),
        maxHeight: "300",
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    for (const [col] of __VLS_getVForSourceType((__VLS_ctx.previewColumns))) {
        const __VLS_104 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            key: (col),
            prop: (col),
            label: (col),
            minWidth: "120",
        }));
        const __VLS_106 = __VLS_105({
            key: (col),
            prop: (col),
            label: (col),
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    }
    var __VLS_103;
    if (__VLS_ctx.previewResult.errors.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-errors" },
        });
        for (const [err, i] of __VLS_getVForSourceType((__VLS_ctx.previewResult.errors))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (i),
                ...{ class: "error-item" },
            });
            const __VLS_108 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                type: "danger",
                size: "small",
            }));
            const __VLS_110 = __VLS_109({
                type: "danger",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            (err.code);
            var __VLS_111;
            (err.message);
            if (err.rowIndex !== undefined) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (err.rowIndex);
            }
        }
    }
}
/** @type {__VLS_StyleScopedClasses['mapping-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['caller-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-info']} */ ;
/** @type {__VLS_StyleScopedClasses['arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['schema-version']} */ ;
/** @type {__VLS_StyleScopedClasses['compat-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['dirty-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['policy-denied']} */ ;
/** @type {__VLS_StyleScopedClasses['compat-blocked']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-status']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-list']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-header']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-left']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-type-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-editor-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['add-rule-area']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['matched']} */ ;
/** @type {__VLS_StyleScopedClasses['unmatched']} */ ;
/** @type {__VLS_StyleScopedClasses['errors']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-errors']} */ ;
/** @type {__VLS_StyleScopedClasses['error-item']} */ ;
// @ts-ignore
var __VLS_17 = __VLS_16, __VLS_87 = __VLS_86;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            document: document,
            rules: rules,
            dirty: dirty,
            editingRuleId: editingRuleId,
            validating: validating,
            previewing: previewing,
            previewResult: previewResult,
            workspaceRoot: workspaceRoot,
            addRuleRef: addRuleRef,
            setToggleRef: setToggleRef,
            setPanelRef: setPanelRef,
            callerLabel: callerLabel,
            allowedRuleTypes: allowedRuleTypes,
            canEdit: canEdit,
            canValidate: canValidate,
            canPublish: canPublish,
            canExecute: canExecute,
            canRebuild: canRebuild,
            policyDenied: policyDenied,
            previewColumns: previewColumns,
            ruleLabel: ruleLabel,
            ruleEditorComponent: ruleEditorComponent,
            ruleSummary: ruleSummary,
            addRule: addRule,
            removeRule: removeRule,
            duplicateRule: duplicateRule,
            moveUp: moveUp,
            moveDown: moveDown,
            toggleEdit: toggleEdit,
            markDirty: markDirty,
            doValidate: doValidate,
            doPreview: doPreview,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
