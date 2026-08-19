/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, watch } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';
const props = withDefaults(defineProps(), { modelValue: null, isPeriod: false, periodLabel: null, keyLabels: () => [], disabled: false });
const emit = defineEmits();
const options = [
    { value: 'current_snapshot', label: '全量同步', description: '每次输入代表当前完整状态：同一业务主键更新或新增；未出现的历史记录按资产规则处理。适用于员工花名册、组织等当前状态数据。' },
    { value: 'incremental_upsert', label: '增量变更', description: '每次仅输入新增或变更记录：同一业务主键更新或新增，不清理未出现的旧记录。' },
    { value: 'append', label: '流水追加', description: '每次只新增记录，不更新或删除已有历史数据。适用于日志、审批和事件流水。' },
    { value: 'period_full_snapshot', label: '期间覆盖', description: '仅覆盖本次期间：按完整业务主键更新或新增，并清理该期间未出现的记录；历史期间保持不变。适用于薪资、社保、考勤、月度分摊等。' },
];
const isLockedPeriodMode = computed(() => props.isPeriod);
const selected = computed(() => options.find(option => option.value === props.modelValue));
const visibleOptions = computed(() => props.isPeriod ? options.filter(option => option.value === 'period_full_snapshot') : options.filter(option => option.value !== 'period_full_snapshot'));
watch(() => props.isPeriod, (isPeriod) => {
    if (isPeriod && props.modelValue !== 'period_full_snapshot')
        emit('update:modelValue', 'period_full_snapshot');
}, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ modelValue: null, isPeriod: false, periodLabel: null, keyLabels: () => [], disabled: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    label: "入仓方式",
}));
const __VLS_2 = __VLS_1({
    label: "入仓方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ingestion-mode-row" },
});
const __VLS_5 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: "选择入仓方式",
    disabled: (__VLS_ctx.disabled || __VLS_ctx.isLockedPeriodMode),
    ...{ style: {} },
}));
const __VLS_7 = __VLS_6({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: "选择入仓方式",
    disabled: (__VLS_ctx.disabled || __VLS_ctx.isLockedPeriodMode),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
let __VLS_9;
let __VLS_10;
let __VLS_11;
const __VLS_12 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', $event);
    }
};
__VLS_8.slots.default;
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.visibleOptions))) {
    const __VLS_13 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }));
    const __VLS_15 = __VLS_14({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_16.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (option.label);
    var __VLS_16;
}
var __VLS_8;
if (__VLS_ctx.selected) {
    const __VLS_17 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        content: (__VLS_ctx.selected.description),
        placement: "top",
        showAfter: (200),
    }));
    const __VLS_19 = __VLS_18({
        content: (__VLS_ctx.selected.description),
        placement: "top",
        showAfter: (200),
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_20.slots.default;
    const __VLS_21 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        ...{ class: "mode-info" },
    }));
    const __VLS_23 = __VLS_22({
        ...{ class: "mode-info" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    const __VLS_25 = {}.InfoFilled;
    /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({}));
    const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
    var __VLS_24;
    var __VLS_20;
}
if (__VLS_ctx.modelValue === 'period_full_snapshot') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mode-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    (__VLS_ctx.periodLabel || '待配置');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    (__VLS_ctx.keyLabels.length ? __VLS_ctx.keyLabels.join(' + ') : '请先在字段管理中标记');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['ingestion-mode-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-info']} */ ;
/** @type {__VLS_StyleScopedClasses['mode-meta']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            InfoFilled: InfoFilled,
            emit: emit,
            isLockedPeriodMode: isLockedPeriodMode,
            selected: selected,
            visibleOptions: visibleOptions,
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
