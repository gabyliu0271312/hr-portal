/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceContentRenderer from './PerformanceContentRenderer.vue';
const __VLS_props = withDefaults(defineProps(), { interactive: false, selectedItemId: null, itemSettings: () => ({}) });
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ interactive: false, selectedItemId: null, itemSettings: () => ({}) });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceContentRenderer, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceContentRenderer, new PerformanceContentRenderer({
    ...{ 'onSelectItem': {} },
    content: (__VLS_ctx.content),
    variant: "configured-card",
    interactive: (__VLS_ctx.interactive),
    selectedItemId: (__VLS_ctx.selectedItemId),
    selectionPrefix: (__VLS_ctx.content.id),
    itemSettings: (__VLS_ctx.itemSettings),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onSelectItem': {} },
    content: (__VLS_ctx.content),
    variant: "configured-card",
    interactive: (__VLS_ctx.interactive),
    selectedItemId: (__VLS_ctx.selectedItemId),
    selectionPrefix: (__VLS_ctx.content.id),
    itemSettings: (__VLS_ctx.itemSettings),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onSelectItem: (...[$event]) => {
        __VLS_ctx.$emit('select-item', $event);
    }
};
var __VLS_7 = {};
var __VLS_2;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceContentRenderer: PerformanceContentRenderer,
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
