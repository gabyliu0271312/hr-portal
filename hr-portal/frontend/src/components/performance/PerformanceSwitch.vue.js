const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-switch__handler']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-switch']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('update:modelValue', !__VLS_ctx.modelValue);
        } },
    ...{ class: "performance-switch" },
    ...{ class: ({ on: __VLS_ctx.modelValue }) },
    type: "button",
    role: "switch",
    'aria-checked': (__VLS_ctx.modelValue),
    'aria-label': (__VLS_ctx.ariaLabel),
    disabled: (__VLS_ctx.disabled),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "performance-switch__handler" },
});
/** @type {__VLS_StyleScopedClasses['performance-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-switch__handler']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
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
