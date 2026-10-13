/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
import PerformanceTextField from './PerformanceTextField.vue';
const __VLS_props = withDefaults(defineProps(), {
    required: false,
    placeholder: '',
    textarea: false,
    inside: false,
    invalid: false,
});
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    required: false,
    placeholder: '',
    textarea: false,
    inside: false,
    invalid: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: (['performance-form-field', { 'performance-form-field--inside': __VLS_ctx.inside }]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: (__VLS_ctx.label),
    required: (__VLS_ctx.required),
}));
const __VLS_1 = __VLS_0({
    label: (__VLS_ctx.label),
    required: (__VLS_ctx.required),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    type: (__VLS_ctx.textarea ? 'textarea' : 'input'),
    placeholder: (__VLS_ctx.placeholder),
    invalid: (__VLS_ctx.invalid),
}));
const __VLS_4 = __VLS_3({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    type: (__VLS_ctx.textarea ? 'textarea' : 'input'),
    placeholder: (__VLS_ctx.placeholder),
    invalid: (__VLS_ctx.invalid),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.$emit('update:modelValue', $event);
    }
};
var __VLS_5;
if (__VLS_ctx.invalid) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-error" },
    });
}
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            PerformanceTextField: PerformanceTextField,
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
