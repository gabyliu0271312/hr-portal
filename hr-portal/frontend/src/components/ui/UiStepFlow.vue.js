/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = defineProps();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-step-flow__item']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-step-flow__separator']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "performance-step-flow" },
    'aria-label': (__VLS_ctx.ariaLabel || '配置步骤'),
});
for (const [step, index] of __VLS_getVForSourceType((__VLS_ctx.steps))) {
    (step.key);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "performance-step-flow__item" },
        ...{ class: ({ current: index === __VLS_ctx.currentStep }) },
    });
    (step.label);
    if (index < __VLS_ctx.steps.length - 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "performance-step-flow__separator" },
            'aria-hidden': "true",
        });
    }
}
/** @type {__VLS_StyleScopedClasses['performance-step-flow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-step-flow__item']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-step-flow__separator']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
