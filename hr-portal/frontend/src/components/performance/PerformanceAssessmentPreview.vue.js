/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceAssessmentPreviewHeader from './PerformanceAssessmentPreviewHeader.vue';
const __VLS_props = withDefaults(defineProps(), { name: '', description: '', showLabel: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ name: '', description: '', showLabel: true });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "performance-assessment-preview" },
    'data-preview-type': (__VLS_ctx.type),
});
if (__VLS_ctx.showLabel) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "preview-label" },
    });
}
/** @type {[typeof PerformanceAssessmentPreviewHeader, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceAssessmentPreviewHeader, new PerformanceAssessmentPreviewHeader({
    name: (__VLS_ctx.name),
    description: (__VLS_ctx.description),
}));
const __VLS_1 = __VLS_0({
    name: (__VLS_ctx.name),
    description: (__VLS_ctx.description),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
/** @type {__VLS_StyleScopedClasses['performance-assessment-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-label']} */ ;
// @ts-ignore
var __VLS_4 = __VLS_3;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceAssessmentPreviewHeader: PerformanceAssessmentPreviewHeader,
        };
    },
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
