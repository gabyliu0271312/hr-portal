/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const props = withDefaults(defineProps(), { required: false, disabled: false });
const emit = defineEmits();
function handleInput(event) {
    const textarea = event.target;
    const value = textarea.value.slice(0, props.maxLength);
    if (value !== textarea.value)
        textarea.value = value;
    emit('update:modelValue', value);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ required: false, disabled: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__input']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-counted-textarea" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-counted-textarea__label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    for: (__VLS_ctx.inputId),
});
(__VLS_ctx.label);
if (__VLS_ctx.required) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "required-mark" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-counted-textarea__control" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
    ...{ onInput: (__VLS_ctx.handleInput) },
    id: (__VLS_ctx.inputId),
    ...{ class: "performance-counted-textarea__input" },
    value: (__VLS_ctx.modelValue),
    disabled: (__VLS_ctx.disabled),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "performance-counted-textarea__suffix" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "performance-counted-textarea__count" },
});
(__VLS_ctx.modelValue.length);
(__VLS_ctx.maxLength);
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__control']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__suffix']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-counted-textarea__count']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            handleInput: handleInput,
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
