/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = withDefaults(defineProps(), { disabled: false, checkedColor: '#0442d2' });
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ disabled: false, checkedColor: '#0442d2' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-checkbox--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-checkbox__control']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-checkbox--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-checkbox--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-checkbox--disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox__wallpaper--checked']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-checkbox" },
    ...{ class: ({ 'performance-checkbox--disabled': __VLS_ctx.disabled }) },
    ...{ style: ({ '--performance-checkbox-checked-color': __VLS_ctx.checkedColor }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "performance-checkbox__control" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ud__checkbox" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onChange: (...[$event]) => {
            __VLS_ctx.$emit('update:modelValue', $event.target.checked);
        } },
    ...{ class: "ud__checkbox__input" },
    type: "checkbox",
    checked: (__VLS_ctx.modelValue),
    disabled: (__VLS_ctx.disabled),
    'aria-label': (__VLS_ctx.label),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ud__checkbox__wallpaper" },
    ...{ class: ({ 'ud__checkbox__wallpaper--checked': __VLS_ctx.modelValue }) },
    'aria-hidden': "true",
});
if (__VLS_ctx.modelValue) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "12",
        height: "12",
        viewBox: "0 0 12 12",
        fill: "none",
        ...{ class: "ud__checkbox__checked-svg" },
        'data-icon': "CheckboxChecked",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z",
        fill: "currentColor",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "performance-checkbox__label" },
});
(__VLS_ctx.label);
/** @type {__VLS_StyleScopedClasses['performance-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-checkbox__control']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox__input']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox__wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__checkbox__checked-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-checkbox__label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
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
