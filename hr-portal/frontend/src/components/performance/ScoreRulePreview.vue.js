/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import PerformanceNumberInput from './PerformanceNumberInput.vue';
import FixedScorePreviewNavigator from './FixedScorePreviewNavigator.vue';
const props = withDefaults(defineProps(), { precision: 0 });
const previewValue = ref('');
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ precision: 0 });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['score-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['score-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['score-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['score-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "score-rule-preview" },
});
if (__VLS_ctx.method === '在分数上下限内输入评分') {
    /** @type {[typeof PerformanceNumberInput, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
        modelValue: (__VLS_ctx.previewValue),
        placeholder: (`${__VLS_ctx.minimum} - ${__VLS_ctx.maximum}`),
        width: "240px",
        precision: (__VLS_ctx.precision),
        min: (Number(__VLS_ctx.minimum)),
        max: (Number(__VLS_ctx.maximum)),
        'aria-label': "预览评分",
    }));
    const __VLS_1 = __VLS_0({
        modelValue: (__VLS_ctx.previewValue),
        placeholder: (`${__VLS_ctx.minimum} - ${__VLS_ctx.maximum}`),
        width: "240px",
        precision: (__VLS_ctx.precision),
        min: (Number(__VLS_ctx.minimum)),
        max: (Number(__VLS_ctx.maximum)),
        'aria-label': "预览评分",
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
else {
    /** @type {[typeof FixedScorePreviewNavigator, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(FixedScorePreviewNavigator, new FixedScorePreviewNavigator({
        options: (__VLS_ctx.fixedOptions),
    }));
    const __VLS_4 = __VLS_3({
        options: (__VLS_ctx.fixedOptions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
}
/** @type {__VLS_StyleScopedClasses['score-rule-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceNumberInput: PerformanceNumberInput,
            FixedScorePreviewNavigator: FixedScorePreviewNavigator,
            previewValue: previewValue,
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
