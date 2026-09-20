/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceTemplateOperateBar from './PerformanceTemplateOperateBar.vue';
const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['template-section__heading']} */ ;
/** @type {__VLS_StyleScopedClasses['template-section__hover-border']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-section" },
    'data-ui-flow-id': "TemplateSectionCard",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-section__heading" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-section__hover-border" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-section__title" },
});
(__VLS_ctx.title);
if (__VLS_ctx.actions.length) {
    /** @type {[typeof PerformanceTemplateOperateBar, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceTemplateOperateBar, new PerformanceTemplateOperateBar({
        ...{ 'onAction': {} },
        actions: (__VLS_ctx.actions),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onAction': {} },
        actions: (__VLS_ctx.actions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onAction: (...[$event]) => {
            if (!(__VLS_ctx.actions.length))
                return;
            __VLS_ctx.$emit('action', $event);
        }
    };
    var __VLS_2;
}
/** @type {__VLS_StyleScopedClasses['template-section']} */ ;
/** @type {__VLS_StyleScopedClasses['template-section__heading']} */ ;
/** @type {__VLS_StyleScopedClasses['template-section__hover-border']} */ ;
/** @type {__VLS_StyleScopedClasses['template-section__title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceTemplateOperateBar: PerformanceTemplateOperateBar,
        };
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
