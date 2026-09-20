import PerformanceNumberInput from './PerformanceNumberInput.vue';
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
const props = withDefaults(defineProps(), {
    label: '评分上下限',
    minPlaceholder: '请输入分数下限',
    maxPlaceholder: '请输入分数上限',
    required: true,
    precision: undefined,
    min: 0,
    controlHeight: '32px',
    inputLineHeight: '22px',
    stepperWidth: '32px',
    invalid: false,
    disabled: false,
    errorMessage: '评分上下限为必填',
});
const emit = defineEmits();
function update(patch) {
    emit('update:modelValue', { ...props.modelValue, ...patch });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    label: '评分上下限',
    minPlaceholder: '请输入分数下限',
    maxPlaceholder: '请输入分数上限',
    required: true,
    precision: undefined,
    min: 0,
    controlHeight: '32px',
    inputLineHeight: '22px',
    stepperWidth: '32px',
    invalid: false,
    disabled: false,
    errorMessage: '评分上下限为必填',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['bounds-control']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "score-bounds-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
if (__VLS_ctx.required) {
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: (__VLS_ctx.label),
    }));
    const __VLS_1 = __VLS_0({
        label: (__VLS_ctx.label),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "bounds-control" },
});
/** @type {[typeof PerformanceNumberInput, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.min),
    placeholder: (__VLS_ctx.minPlaceholder),
    'aria-label': "分数下限",
    size: "wide",
    precision: (__VLS_ctx.precision),
    allowNegative: (true),
    disabled: (__VLS_ctx.disabled),
    controlHeight: (__VLS_ctx.controlHeight),
    inputLineHeight: (__VLS_ctx.inputLineHeight),
    stepperWidth: (__VLS_ctx.stepperWidth),
    invalid: (__VLS_ctx.invalid),
}));
const __VLS_4 = __VLS_3({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.min),
    placeholder: (__VLS_ctx.minPlaceholder),
    'aria-label': "分数下限",
    size: "wide",
    precision: (__VLS_ctx.precision),
    allowNegative: (true),
    disabled: (__VLS_ctx.disabled),
    controlHeight: (__VLS_ctx.controlHeight),
    inputLineHeight: (__VLS_ctx.inputLineHeight),
    stepperWidth: (__VLS_ctx.stepperWidth),
    invalid: (__VLS_ctx.invalid),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    'onUpdate:modelValue': ((min) => __VLS_ctx.update({ min }))
};
var __VLS_5;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "range-dash" },
});
/** @type {[typeof PerformanceNumberInput, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.max),
    placeholder: (__VLS_ctx.maxPlaceholder),
    'aria-label': "分数上限",
    size: "wide",
    precision: (__VLS_ctx.precision),
    allowNegative: (true),
    disabled: (__VLS_ctx.disabled),
    controlHeight: (__VLS_ctx.controlHeight),
    inputLineHeight: (__VLS_ctx.inputLineHeight),
    stepperWidth: (__VLS_ctx.stepperWidth),
    invalid: (__VLS_ctx.invalid),
}));
const __VLS_11 = __VLS_10({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.max),
    placeholder: (__VLS_ctx.maxPlaceholder),
    'aria-label': "分数上限",
    size: "wide",
    precision: (__VLS_ctx.precision),
    allowNegative: (true),
    disabled: (__VLS_ctx.disabled),
    controlHeight: (__VLS_ctx.controlHeight),
    inputLineHeight: (__VLS_ctx.inputLineHeight),
    stepperWidth: (__VLS_ctx.stepperWidth),
    invalid: (__VLS_ctx.invalid),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
let __VLS_13;
let __VLS_14;
let __VLS_15;
const __VLS_16 = {
    'onUpdate:modelValue': ((max) => __VLS_ctx.update({ max }))
};
var __VLS_12;
if (__VLS_ctx.invalid) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "bounds-error" },
    });
    (__VLS_ctx.errorMessage);
}
/** @type {__VLS_StyleScopedClasses['score-bounds-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['bounds-control']} */ ;
/** @type {__VLS_StyleScopedClasses['range-dash']} */ ;
/** @type {__VLS_StyleScopedClasses['bounds-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceNumberInput: PerformanceNumberInput,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            update: update,
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
