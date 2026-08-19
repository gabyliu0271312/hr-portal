/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
// ── 内置预设 ────────────────────────────────────────
const defaultPresets = [
    { label: '每天', rrule: 'FREQ=DAILY;INTERVAL=1', desc: '每天同一时间执行' },
    { label: '每周一', rrule: 'FREQ=WEEKLY;BYDAY=MO', desc: '每周一执行' },
    { label: '每周一至周五', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', desc: '工作日执行' },
    { label: '每月1日', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1', desc: '每月1号执行' },
    { label: '每周', rrule: 'FREQ=WEEKLY;INTERVAL=1', desc: '每周同一天执行' },
    { label: '每两周', rrule: 'FREQ=WEEKLY;INTERVAL=2', desc: '每隔一周执行' },
];
const presets = computed(() => props.customPresets || defaultPresets);
// ── 状态 ────────────────────────────────────────────
const localRRule = ref(props.rrule);
const localStartTime = ref(props.startTime);
const selectedPreset = ref('');
// 初始化：匹配当前 rrule 到预设
function matchPreset(rrule) {
    const found = presets.value.find(p => p.rrule === rrule);
    return found?.rrule || '';
}
watch(() => props.rrule, (val) => {
    localRRule.value = val;
    selectedPreset.value = matchPreset(val);
}, { immediate: true });
watch(() => props.startTime, (val) => {
    localStartTime.value = val;
}, { immediate: true });
// ── 操作 ────────────────────────────────────────────
function applyPreset(preset) {
    selectedPreset.value = preset.rrule;
    localRRule.value = preset.rrule;
    emit('update:rrule', preset.rrule);
}
function onCustomRRuleChange(val) {
    localRRule.value = val;
    // 如果输入的值匹配某个预设，自动选中；否则清除预设选中状态
    const matched = presets.value.find(p => p.rrule === val);
    selectedPreset.value = matched ? matched.rrule : '';
    emit('update:rrule', val);
}
function onStartTimeChange(val) {
    localStartTime.value = val;
    emit('update:startTime', val);
}
function isCustomMode() {
    return selectedPreset.value === '' && localRRule.value !== '';
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sp-label']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-chip']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "schedule-picker" },
});
if (__VLS_ctx.showStartTime !== false) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sp-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "sp-label required" },
    });
    const __VLS_0 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.localStartTime),
        type: "datetime",
        placeholder: "选择首次执行时间",
        format: "YYYY-MM-DD HH:mm",
        valueFormat: "YYYY-MM-DDTHH:mm",
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.localStartTime),
        type: "datetime",
        placeholder: "选择首次执行时间",
        format: "YYYY-MM-DD HH:mm",
        valueFormat: "YYYY-MM-DDTHH:mm",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        'onUpdate:modelValue': (__VLS_ctx.onStartTimeChange)
    };
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sp-hint" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sp-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "sp-label required" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sp-chips" },
});
for (const [preset] of __VLS_getVForSourceType((__VLS_ctx.presets))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.applyPreset(preset);
            } },
        key: (preset.rrule),
        ...{ class: "sp-chip" },
        ...{ class: ({ active: __VLS_ctx.selectedPreset === preset.rrule }) },
        title: (preset.desc),
    });
    (preset.label);
}
if (__VLS_ctx.isCustomMode()) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sp-custom" },
    });
    const __VLS_8 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.localRRule),
        placeholder: "自定义 RRULE 表达式，如 FREQ=HOURLY;INTERVAL=2",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.localRRule),
        placeholder: "自定义 RRULE 表达式，如 FREQ=HOURLY;INTERVAL=2",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        'onUpdate:modelValue': (__VLS_ctx.onCustomRRuleChange)
    };
    var __VLS_11;
}
/** @type {__VLS_StyleScopedClasses['schedule-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-field']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-field']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['sp-custom']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            presets: presets,
            localRRule: localRRule,
            localStartTime: localStartTime,
            selectedPreset: selectedPreset,
            applyPreset: applyPreset,
            onCustomRRuleChange: onCustomRRuleChange,
            onStartTimeChange: onStartTimeChange,
            isCustomMode: isCustomMode,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
