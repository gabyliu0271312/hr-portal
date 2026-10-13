/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = defineProps();
function display(value) {
    return value === undefined || value === null || value === '' ? '—' : String(value);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "fixed-score-options-summary sub-fixed-score-options" },
    'data-component': "fixed-score-options-summary",
    'aria-label': "分值选项",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "config-field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "fixed-score-option-list sub-fixed-option-list" },
});
for (const [option, index] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (String(option.id ?? index)),
        ...{ class: "fixed-score-option sub-fixed-option bg-B-100 px-4 text-14 min-w-23 text-center" },
    });
    (__VLS_ctx.display(option.value));
}
/** @type {__VLS_StyleScopedClasses['fixed-score-options-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-fixed-score-options']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-option-list']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-fixed-option-list']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-option']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-fixed-option']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-B-100']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['text-14']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-23']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            display: display,
        };
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
