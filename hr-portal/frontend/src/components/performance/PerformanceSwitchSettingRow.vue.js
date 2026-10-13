/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceInfoPopover from './PerformanceInfoPopover.vue';
import PerformanceSwitch from './PerformanceSwitch.vue';
const __VLS_props = withDefaults(defineProps(), {
    info: undefined,
    infoDelay: 124,
    infoColor: '#646a73',
    disabled: false,
});
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    info: undefined,
    infoDelay: 124,
    infoColor: '#646a73',
    disabled: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-switch-setting-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-switch-setting-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "performance-switch-setting-row__label invite-executor-title" },
});
(__VLS_ctx.label);
if (__VLS_ctx.info) {
    /** @type {[typeof PerformanceInfoPopover, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceInfoPopover, new PerformanceInfoPopover({
        ...{ class: "performance-switch-setting-row__info" },
        content: (__VLS_ctx.info),
        delay: (__VLS_ctx.infoDelay),
        iconColor: (__VLS_ctx.infoColor),
    }));
    const __VLS_1 = __VLS_0({
        ...{ class: "performance-switch-setting-row__info" },
        content: (__VLS_ctx.info),
        delay: (__VLS_ctx.infoDelay),
        iconColor: (__VLS_ctx.infoColor),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
/** @type {[typeof PerformanceSwitch, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    disabled: (__VLS_ctx.disabled),
    'aria-label': (__VLS_ctx.label),
}));
const __VLS_4 = __VLS_3({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    disabled: (__VLS_ctx.disabled),
    'aria-label': (__VLS_ctx.label),
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.$emit('update:modelValue', $event);
    }
};
var __VLS_5;
/** @type {__VLS_StyleScopedClasses['performance-switch-setting-row']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-switch-setting-row__label']} */ ;
/** @type {__VLS_StyleScopedClasses['invite-executor-title']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-switch-setting-row__info']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceInfoPopover: PerformanceInfoPopover,
            PerformanceSwitch: PerformanceSwitch,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
