/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { DEFAULT_PERFORMANCE_ADMIN_SECTION, getPerformanceAdminSectionLabel, } from '@/utils/performanceAdminNavigation';
const props = withDefaults(defineProps(), {
    section: DEFAULT_PERFORMANCE_ADMIN_SECTION,
});
const sectionLabel = computed(() => getPerformanceAdminSectionLabel(props.section));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    section: DEFAULT_PERFORMANCE_ADMIN_SECTION,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['settings-page']} */ ;
/** @type {__VLS_StyleScopedClasses['paper']} */ ;
/** @type {__VLS_StyleScopedClasses['paper']} */ ;
/** @type {__VLS_StyleScopedClasses['paper']} */ ;
/** @type {__VLS_StyleScopedClasses['paper']} */ ;
/** @type {__VLS_StyleScopedClasses['pencil']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "settings-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
(__VLS_ctx.sectionLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "settings-placeholder" },
    role: "status",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "empty-illustration" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ball" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "paper" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "pencil" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "scribble" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "empty-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "empty-description" },
});
/** @type {__VLS_StyleScopedClasses['settings-page']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-illustration']} */ ;
/** @type {__VLS_StyleScopedClasses['ball']} */ ;
/** @type {__VLS_StyleScopedClasses['paper']} */ ;
/** @type {__VLS_StyleScopedClasses['pencil']} */ ;
/** @type {__VLS_StyleScopedClasses['scribble']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-title']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-description']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            sectionLabel: sectionLabel,
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
