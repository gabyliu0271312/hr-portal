/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import PerformancePromptNotice from './PerformancePromptNotice.vue';
const props = defineProps();
const popoverStyle = computed(() => props.anchor ? { left: `${props.anchor.left + props.anchor.width / 2}px`, top: `${props.anchor.top - 8}px` } : {});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.visible && __VLS_ctx.anchor) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "prompt-popover" },
        ...{ style: (__VLS_ctx.popoverStyle) },
        role: "tooltip",
    });
    /** @type {[typeof PerformancePromptNotice, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PerformancePromptNotice, new PerformancePromptNotice({
        type: (__VLS_ctx.type),
    }));
    const __VLS_5 = __VLS_4({
        type: (__VLS_ctx.type),
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        ...{ class: "prompt-popover__arrow" },
        width: "16",
        height: "8",
        viewBox: "0 0 16 8",
        fill: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z",
        fill: "#fff",
    });
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['prompt-popover']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-popover__arrow']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformancePromptNotice: PerformancePromptNotice,
            popoverStyle: popoverStyle,
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
