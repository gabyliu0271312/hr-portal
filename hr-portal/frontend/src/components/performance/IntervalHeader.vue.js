/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
const __VLS_props = withDefaults(defineProps(), { showDelete: false });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ showDelete: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['interval-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "interval-header" },
    ...{ class: ({ 'has-delete': __VLS_ctx.showDelete }) },
    'aria-label': "分数子区间字段标题",
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    ...{ class: "interval-header__bounds" },
    label: "分数子区间",
}));
const __VLS_1 = __VLS_0({
    ...{ class: "interval-header__bounds" },
    label: "分数子区间",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    ...{ class: "interval-header__code" },
    label: "等级代号",
}));
const __VLS_4 = __VLS_3({
    ...{ class: "interval-header__code" },
    label: "等级代号",
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "interval-header__name" },
});
if (__VLS_ctx.showDelete) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "interval-header__delete" },
        'aria-hidden': "true",
    });
}
/** @type {__VLS_StyleScopedClasses['interval-header']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-header__bounds']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-header__code']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-header__name']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-header__delete']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRequiredLabel: PerformanceRequiredLabel,
        };
    },
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
