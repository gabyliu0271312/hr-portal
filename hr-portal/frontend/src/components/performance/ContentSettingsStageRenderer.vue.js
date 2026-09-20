/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = withDefaults(defineProps(), { ariaLabel: '' });
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ ariaLabel: '' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['content-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['content-tab--active']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "content-canvas" },
    'aria-label': (__VLS_ctx.ariaLabel),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content-tabs" },
    role: "tablist",
});
for (const [tab] of __VLS_getVForSourceType((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.$emit('update:activeTab', tab.key);
            } },
        key: (tab.key),
        ...{ class: "content-tab" },
        ...{ class: ({ 'content-tab--active': __VLS_ctx.activeTab === tab.key }) },
        role: "tab",
        'aria-selected': (__VLS_ctx.activeTab === tab.key),
        type: "button",
    });
    (tab.label);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content-tabs__divider" },
    'aria-hidden': "true",
});
var __VLS_0 = {};
/** @type {__VLS_StyleScopedClasses['content-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['content-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['content-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['content-tabs__divider']} */ ;
// @ts-ignore
var __VLS_1 = __VLS_0;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
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
