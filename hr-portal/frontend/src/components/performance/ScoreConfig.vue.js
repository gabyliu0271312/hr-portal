import { computed } from 'vue';
import FixedScoreOptionsEditor from './FixedScoreOptionsEditor.vue';
import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
import ScoreBoundsField from './ScoreBoundsField.vue';
const props = withDefaults(defineProps(), {
    modelValue: () => ({
        method: '在分数上下限内输入评分',
        min: '',
        max: '',
        precision: '不保留小数',
        fixedOptions: [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }],
    }),
    errors: () => ({}),
    disabled: false,
});
const emit = defineEmits();
const methodOptions = ['在分数上下限内输入评分', '在固定分值选项内选择评分'];
const precisionOptions = ['不保留小数', '保留 1 位小数', '保留 2 位小数'];
const value = computed(() => props.modelValue);
const fixedOptions = computed(() => value.value.fixedOptions?.length
    ? value.value.fixedOptions
    : [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }]);
const precisionDigits = computed(() => value.value.precision === '保留 1 位小数' ? 1 : value.value.precision === '保留 2 位小数' ? 2 : 0);
function update(patch) {
    emit('update:modelValue', { ...value.value, ...patch });
}
function formatValue(raw, digits) {
    if (raw === '' || raw === '.')
        return raw;
    const numericValue = Number(raw);
    if (!Number.isFinite(numericValue))
        return raw;
    return digits > 0 ? numericValue.toFixed(digits) : String(Math.round(numericValue));
}
function updatePrecision(precision) {
    const digits = precision === '保留 1 位小数' ? 1 : precision === '保留 2 位小数' ? 2 : 0;
    update({ precision, min: formatValue(value.value.min, digits), max: formatValue(value.value.max, digits) });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    modelValue: () => ({
        method: '在分数上下限内输入评分',
        min: '',
        max: '',
        precision: '不保留小数',
        fixedOptions: [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }],
    }),
    errors: () => ({}),
    disabled: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['score-config']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['solid-radio']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "score-config" },
    'aria-label': "评分设置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.value.method),
    options: (__VLS_ctx.methodOptions.map((label) => ({ value: label, label }))),
    name: "score-method",
    'aria-label': "评分方式",
    disabled: (__VLS_ctx.disabled),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.value.method),
    options: (__VLS_ctx.methodOptions.map((label) => ({ value: label, label }))),
    name: "score-method",
    'aria-label': "评分方式",
    disabled: (__VLS_ctx.disabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': ((method) => __VLS_ctx.update({ method }))
};
var __VLS_2;
if (__VLS_ctx.value.method === '在分数上下限内输入评分') {
    /** @type {[typeof ScoreBoundsField, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(ScoreBoundsField, new ScoreBoundsField({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ({ min: __VLS_ctx.value.min, max: __VLS_ctx.value.max }),
        precision: (__VLS_ctx.precisionDigits),
        invalid: (!!__VLS_ctx.errors?.bounds),
        disabled: (__VLS_ctx.disabled),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: ({ min: __VLS_ctx.value.min, max: __VLS_ctx.value.max }),
        precision: (__VLS_ctx.precisionDigits),
        invalid: (!!__VLS_ctx.errors?.bounds),
        disabled: (__VLS_ctx.disabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        'onUpdate:modelValue': (__VLS_ctx.update)
    };
    var __VLS_9;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-row fixed-score-options-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-label" },
    });
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "配置分值选项",
    }));
    const __VLS_15 = __VLS_14({
        label: "配置分值选项",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-control" },
    });
    /** @type {[typeof FixedScoreOptionsEditor, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(FixedScoreOptionsEditor, new FixedScoreOptionsEditor({
        ...{ 'onUpdate:options': {} },
        options: (__VLS_ctx.fixedOptions),
        errors: (__VLS_ctx.errors?.fixedOptions),
        disabled: (__VLS_ctx.disabled),
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onUpdate:options': {} },
        options: (__VLS_ctx.fixedOptions),
        errors: (__VLS_ctx.errors?.fixedOptions),
        disabled: (__VLS_ctx.disabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        'onUpdate:options': ((options) => __VLS_ctx.update({ fixedOptions: options }))
    };
    var __VLS_19;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: "小数位数设置",
}));
const __VLS_25 = __VLS_24({
    label: "小数位数设置",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.value.precision),
    options: (__VLS_ctx.precisionOptions.map((label) => ({ value: label, label }))),
    name: "score-precision",
    'aria-label': "小数位数设置",
    disabled: (__VLS_ctx.disabled),
}));
const __VLS_28 = __VLS_27({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.value.precision),
    options: (__VLS_ctx.precisionOptions.map((label) => ({ value: label, label }))),
    name: "score-precision",
    'aria-label': "小数位数设置",
    disabled: (__VLS_ctx.disabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
let __VLS_30;
let __VLS_31;
let __VLS_32;
const __VLS_33 = {
    'onUpdate:modelValue': (__VLS_ctx.updatePrecision)
};
var __VLS_29;
/** @type {__VLS_StyleScopedClasses['score-config']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-options-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FixedScoreOptionsEditor: FixedScoreOptionsEditor,
            PerformanceRadioGroup: PerformanceRadioGroup,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            ScoreBoundsField: ScoreBoundsField,
            methodOptions: methodOptions,
            precisionOptions: precisionOptions,
            value: value,
            fixedOptions: fixedOptions,
            precisionDigits: precisionDigits,
            update: update,
            updatePrecision: updatePrecision,
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
