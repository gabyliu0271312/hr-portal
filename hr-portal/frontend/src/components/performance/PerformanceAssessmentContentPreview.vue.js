/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceAssessmentPreview from './PerformanceAssessmentPreview.vue';
import PerformanceContentRenderer from './PerformanceContentRenderer.vue';
const __VLS_props = defineProps();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceAssessmentPreview, typeof PerformanceAssessmentPreview, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceAssessmentPreview, new PerformanceAssessmentPreview({
    ...{ class: "assessment-content-preview" },
    type: (__VLS_ctx.content.type),
    name: (__VLS_ctx.content.name),
    description: (__VLS_ctx.content.description),
    showLabel: (false),
}));
const __VLS_1 = __VLS_0({
    ...{ class: "assessment-content-preview" },
    type: (__VLS_ctx.content.type),
    name: (__VLS_ctx.content.name),
    description: (__VLS_ctx.content.description),
    showLabel: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
__VLS_2.slots.default;
/** @type {[typeof PerformanceContentRenderer, ]} */ ;
// @ts-ignore
const __VLS_4 = __VLS_asFunctionalComponent(PerformanceContentRenderer, new PerformanceContentRenderer({
    content: (__VLS_ctx.content),
    variant: "configured-card",
}));
const __VLS_5 = __VLS_4({
    content: (__VLS_ctx.content),
    variant: "configured-card",
}, ...__VLS_functionalComponentArgsRest(__VLS_4));
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['assessment-content-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceAssessmentPreview: PerformanceAssessmentPreview,
            PerformanceContentRenderer: PerformanceContentRenderer,
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
