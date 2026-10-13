/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const props = defineProps();
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
    ...{ class: "score-range-summary-component" },
    'data-component': "score-range-summary",
    'aria-label': "评分上下限",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "config-field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "score-range-summary" },
    'aria-label': "评分上下限摘要",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.display(props.minimum));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "range-dash" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.display(props.maximum));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.display(props.precision));
/** @type {__VLS_StyleScopedClasses['score-range-summary-component']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['score-range-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['range-dash']} */ ;
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
