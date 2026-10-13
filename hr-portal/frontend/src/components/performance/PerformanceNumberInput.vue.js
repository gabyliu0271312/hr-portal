/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = withDefaults(defineProps(), {
    modelValue: '',
    placeholder: '',
    ariaLabel: '数字输入',
    size: 'wide',
    width: undefined,
    controlHeight: '32px',
    inputLineHeight: '22px',
    stepperWidth: '32px',
    step: undefined,
    precision: undefined,
    min: 0,
    max: undefined,
    allowNegative: false,
    disabled: false,
    readonly: false,
    required: false,
    invalid: false,
});
const emit = defineEmits();
const inputValue = computed(() => String(props.modelValue ?? ''));
const effectiveStep = computed(() => props.step ?? (props.precision === undefined ? 1 : 10 ** -props.precision));
const effectivePrecision = computed(() => props.precision ?? decimalPlaces(effectiveStep.value));
const hasNumericValue = computed(() => inputValue.value !== '' && inputValue.value !== '.' && Number.isFinite(Number(inputValue.value)));
const effectiveMin = computed(() => props.allowNegative ? Number.NEGATIVE_INFINITY : props.min);
const atMinimum = computed(() => hasNumericValue.value && Number(inputValue.value) <= effectiveMin.value);
const atMaximum = computed(() => hasNumericValue.value && props.max !== undefined && Number(inputValue.value) >= props.max);
const effectiveControlHeight = computed(() => props.size === 'interval' && props.controlHeight === '32px' ? '31px' : props.controlHeight);
const controlStyle = computed(() => ({
    '--number-input-width': props.width ?? (props.size === 'compact' ? '112px' : props.size === 'interval' ? '98px' : '100%'),
    '--number-input-control-height': effectiveControlHeight.value,
    '--number-input-line-height': props.inputLineHeight,
    '--number-input-stepper-width': props.stepperWidth,
}));
function decimalPlaces(value) {
    const text = String(value);
    return text.includes('.') ? text.split('.')[1].length : 0;
}
function formatValue(value) {
    return effectivePrecision.value > 0 ? value.toFixed(effectivePrecision.value) : String(Math.round(value));
}
function update(value) {
    const pattern = props.allowNegative ? /^-?\d*(\.\d*)?$/ : /^\d*(\.\d*)?$/;
    if (!pattern.test(value))
        return;
    if (value === '' || value === '.' || value === '-' || value === '-.') {
        emit('update:modelValue', value);
        return;
    }
    const numericValue = Number(value);
    const boundedValue = Math.min(props.max ?? Number.POSITIVE_INFINITY, Math.max(effectiveMin.value, numericValue));
    emit('update:modelValue', boundedValue !== numericValue ? formatValue(boundedValue) : value);
}
function formatInput() {
    if (props.disabled || props.readonly || inputValue.value === '' || inputValue.value === '.')
        return;
    const numericValue = Number(inputValue.value);
    if (!Number.isFinite(numericValue))
        return;
    const boundedValue = Math.max(effectiveMin.value, props.max === undefined ? numericValue : Math.min(props.max, numericValue));
    const formattedValue = formatValue(boundedValue);
    if (formattedValue !== inputValue.value)
        emit('update:modelValue', formattedValue);
}
function adjust(delta) {
    const current = Number(inputValue.value);
    const baseValue = Number.isFinite(current) ? current : (props.allowNegative ? 0 : effectiveMin.value);
    const next = baseValue + delta * effectiveStep.value;
    const boundedMin = Math.max(effectiveMin.value, next);
    const boundedValue = props.max === undefined ? boundedMin : Math.min(props.max, boundedMin);
    emit('update:modelValue', formatValue(boundedValue));
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    modelValue: '',
    placeholder: '',
    ariaLabel: '数字输入',
    size: 'wide',
    width: undefined,
    controlHeight: '32px',
    inputLineHeight: '22px',
    stepperWidth: '32px',
    step: undefined,
    precision: undefined,
    min: 0,
    max: undefined,
    allowNegative: false,
    disabled: false,
    readonly: false,
    required: false,
    invalid: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['is-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-number-input" },
    ...{ class: ({ 'is-disabled': __VLS_ctx.disabled, 'is-readonly': __VLS_ctx.readonly, 'is-invalid': __VLS_ctx.invalid }) },
    'data-size': (__VLS_ctx.size),
    'data-min': (__VLS_ctx.min),
    'data-step': (__VLS_ctx.effectiveStep),
    ...{ style: (__VLS_ctx.controlStyle) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "number-input-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.update($event.target.value);
        } },
    ...{ onBlur: (__VLS_ctx.formatInput) },
    value: (__VLS_ctx.inputValue),
    inputmode: "decimal",
    min: (__VLS_ctx.allowNegative ? undefined : __VLS_ctx.min),
    max: (__VLS_ctx.max),
    step: (__VLS_ctx.effectiveStep),
    placeholder: (__VLS_ctx.placeholder),
    disabled: (__VLS_ctx.disabled),
    readonly: (__VLS_ctx.readonly),
    required: (__VLS_ctx.required),
    'aria-label': (__VLS_ctx.ariaLabel),
    'aria-readonly': (__VLS_ctx.readonly),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "number-stepper" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.adjust(1);
        } },
    type: "button",
    'aria-label': (`${__VLS_ctx.ariaLabel}增加`),
    disabled: (__VLS_ctx.disabled || __VLS_ctx.readonly || __VLS_ctx.atMaximum),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "8",
    height: "8",
    viewBox: "0 0 24 24",
    fill: "none",
    'data-icon': "UpBoldOutlined",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m20.385 16.914.707-.707a1 1 0 0 0 0-1.414l-7.778-7.778a2 2 0 0 0-2.829 0l-7.778 7.778a1 1 0 0 0 0 1.414l.707.707a1 1 0 0 0 1.414 0l7.071-7.07 7.071 7.07a1 1 0 0 0 1.415 0Z",
    fill: "currentColor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.adjust(-1);
        } },
    type: "button",
    'aria-label': (`${__VLS_ctx.ariaLabel}减少`),
    disabled: (__VLS_ctx.disabled || __VLS_ctx.readonly || __VLS_ctx.atMinimum),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "8",
    height: "8",
    viewBox: "0 0 24 24",
    fill: "none",
    'data-icon': "DownBoldOutlined",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['number-input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['number-stepper']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            inputValue: inputValue,
            effectiveStep: effectiveStep,
            atMinimum: atMinimum,
            atMaximum: atMaximum,
            controlStyle: controlStyle,
            update: update,
            formatInput: formatInput,
            adjust: adjust,
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
