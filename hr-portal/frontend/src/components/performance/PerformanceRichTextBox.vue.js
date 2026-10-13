/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceRichTextToolbar from './PerformanceRichTextToolbar.vue';
const __VLS_props = withDefaults(defineProps(), { readonly: false, active: () => ({}) });
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ readonly: false, active: () => ({}) });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box__content']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box__content']} */ ;
/** @type {__VLS_StyleScopedClasses['rich-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box__content']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-rich-text-box" },
    ...{ class: ({ 'is-readonly': __VLS_ctx.readonly }) },
});
/** @type {[typeof PerformanceRichTextToolbar, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRichTextToolbar, new PerformanceRichTextToolbar({
    ...{ 'onBeforeCommand': {} },
    ...{ 'onCommand': {} },
    readonly: (__VLS_ctx.readonly),
    active: (__VLS_ctx.active),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBeforeCommand': {} },
    ...{ 'onCommand': {} },
    readonly: (__VLS_ctx.readonly),
    active: (__VLS_ctx.active),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBeforeCommand: (...[$event]) => {
        __VLS_ctx.$emit('before-command', $event);
    }
};
const __VLS_7 = {
    onCommand: (...[$event]) => {
        __VLS_ctx.$emit('command', $event);
    }
};
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-rich-text-box__content" },
});
var __VLS_8 = {};
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-rich-text-box__content']} */ ;
// @ts-ignore
var __VLS_9 = __VLS_8;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRichTextToolbar: PerformanceRichTextToolbar,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
