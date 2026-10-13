/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceExecutorTag from './PerformanceExecutorTag.vue';
const __VLS_props = withDefaults(defineProps(), {
    label: '环节执行人',
    required: true,
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    label: '环节执行人',
    required: true,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field__label-text']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-fixed-executor-field ud__row ud__form__item" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-fixed-executor-field__label ud__col ud__form__item__label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "workflow-fixed-executor-field__label-text ud__text" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
(__VLS_ctx.label);
if (__VLS_ctx.required) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "workflow-fixed-executor-field__required ud__text ud__form__item__required-mark" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-fixed-executor-field__control ud__col ud__form__item__control" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-fixed-executor-field__content" },
});
/** @type {[typeof PerformanceExecutorTag, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceExecutorTag, new PerformanceExecutorTag({
    executor: (__VLS_ctx.executor),
}));
const __VLS_1 = __VLS_0({
    executor: (__VLS_ctx.executor),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__row']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__form__item']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field__label']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__col']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__form__item__label']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field__label-text']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__text']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field__required']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__text']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__form__item__required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field__control']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__col']} */ ;
/** @type {__VLS_StyleScopedClasses['ud__form__item__control']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-fixed-executor-field__content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceExecutorTag: PerformanceExecutorTag,
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
