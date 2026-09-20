/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import PerformanceOptionNavigator from './PerformanceOptionNavigator.vue';
const props = defineProps();
const navigatorOptions = computed(() => props.levels.map((level, index) => ({
    id: level.id || level.code || `rating-level-${index + 1}`,
    label: level.code,
})));
const layoutPolicy = {
    naturalMax: 5,
    distributedMax: 10,
    viewportWidth: 552,
    viewportHeight: 38,
    optionMinWidth: 42,
    optionHeight: 32,
    connectorMinWidth: 12,
    connectorMaxWidth: 88,
    overflowGap: 12,
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rating-rule-preview" },
    'data-quantified': (__VLS_ctx.quantified),
});
/** @type {[typeof PerformanceOptionNavigator, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceOptionNavigator, new PerformanceOptionNavigator({
    options: (__VLS_ctx.navigatorOptions),
    label: "评级预览",
    appearanceVariant: "rating-preview",
    layoutPolicy: (__VLS_ctx.layoutPolicy),
}));
const __VLS_1 = __VLS_0({
    options: (__VLS_ctx.navigatorOptions),
    label: "评级预览",
    appearanceVariant: "rating-preview",
    layoutPolicy: (__VLS_ctx.layoutPolicy),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {__VLS_StyleScopedClasses['rating-rule-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceOptionNavigator: PerformanceOptionNavigator,
            navigatorOptions: navigatorOptions,
            layoutPolicy: layoutPolicy,
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
