/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const definitions = {
    info: { label: '用于常规提示', noticeBackground: '#F0F4FF', iconColor: '#1456F0', iconPath: 'M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11Z', iconInnerPath: 'M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z' },
    warning: { label: '用于警示提示', noticeBackground: '#FFF3E5', iconColor: '#FF811A', iconPath: 'M12 23c6.075 0 11-4.925 11-11S18.075 1 12 1 1 5.925 1 12s4.925 11 11 11Z', iconInnerPath: 'M13 7.5a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm-2 4v4h-.5a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2H13c0-.667 0-1.333.002-2 0-1.001.002-2.002 0-3.004a.998.998 0 0 0-.998-.996H11a1 1 0 1 0 0 2Z' },
    error: { label: '用于较强负面内容提示', noticeBackground: '#FEF0F0', iconColor: '#F54A45', iconPath: 'M12 23C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Z', iconInnerPath: 'M7.465 8.879 10.585 12l-3.12 3.121a1 1 0 1 0 1.414 1.414L12 13.415l3.121 3.12a1 1 0 1 0 1.415-1.414L13.414 12l3.122-3.121a1 1 0 0 0-1.415-1.415l-3.12 3.122-3.122-3.122A1 1 0 0 0 7.465 8.88Z' },
    success: { label: '用于正向内容提示', noticeBackground: '#E4FAE1', iconColor: '#32A645', iconPath: 'M11.996 22.98c-6.067 0-10.983-4.918-10.983-10.984S5.93 1.013 11.996 1.013c6.066 0 10.983 4.917 10.983 10.983 0 6.066-4.917 10.984-10.983 10.984Z', iconInnerPath: 'M17.537 10.746a1.38 1.38 0 0 0-.005-1.95 1.378 1.378 0 0 0-1.95-.005l-4.89 4.89-2.285-2.285a1.375 1.375 0 0 0-1.942.012 1.373 1.373 0 0 0-.013 1.942c1.178 1.175 2.356 2.348 3.53 3.528.392.394 1.03.394 1.422 0 2.037-2.051 4.087-4.09 6.133-6.132Z' }
};
const definition = computed(() => definitions[props.type]);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['prompt-notice__icon']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "prompt-notice" },
    ...{ style: ({ backgroundColor: __VLS_ctx.definition.noticeBackground }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "prompt-notice__icon" },
    ...{ style: ({ color: __VLS_ctx.definition.iconColor }) },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.definition.iconPath),
    fill: "currentColor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.definition.iconInnerPath),
    fill: "#fff",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "prompt-notice__text" },
});
(__VLS_ctx.definition.label);
/** @type {__VLS_StyleScopedClasses['prompt-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-notice__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-notice__text']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            definition: definition,
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
