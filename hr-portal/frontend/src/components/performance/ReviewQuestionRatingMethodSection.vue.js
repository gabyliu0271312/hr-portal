/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
import ReviewQuestionCalculationRuleSection from './ReviewQuestionCalculationRuleSection.vue';
import ReviewQuestionSubQuestionList from './ReviewQuestionSubQuestionList.vue';
const props = withDefaults(defineProps(), {
    modelValue: 'direct',
    calculationRule: 'none',
    subQuestions: () => [],
    subQuestionOptions: () => [],
    subQuestionOptionsLoading: false,
});
const emit = defineEmits();
const ratingOptions = [
    { value: 'direct', label: '直接评级' },
    { value: 'sub_items', label: '通过子评估项评级' },
    { value: 'total_score', label: '作为总分项计算评级', showInfo: true },
];
const isSubItems = () => props.modelValue === 'sub_items';
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    modelValue: 'direct',
    calculationRule: 'none',
    subQuestions: () => [],
    subQuestionOptions: () => [],
    subQuestionOptionsLoading: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-method-section']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-method-field']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "question-card rating-method-section" },
    ...{ class: ({ 'has-sub-items': __VLS_ctx.isSubItems() }) },
    'aria-label': "评估方式",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "additional-form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rating-method-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "additional-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "radio-options" },
});
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (props.modelValue),
    options: (__VLS_ctx.ratingOptions),
    name: "review-question-rating-method",
    'aria-label': "评级方式",
    gap: (24),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (props.modelValue),
    options: (__VLS_ctx.ratingOptions),
    name: "review-question-rating-method",
    'aria-label': "评级方式",
    gap: (24),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', $event);
    }
};
var __VLS_2;
if (__VLS_ctx.isSubItems()) {
    /** @type {[typeof ReviewQuestionCalculationRuleSection, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(ReviewQuestionCalculationRuleSection, new ReviewQuestionCalculationRuleSection({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (props.calculationRule),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (props.calculationRule),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.isSubItems()))
                return;
            __VLS_ctx.emit('update:calculationRule', $event);
        }
    };
    var __VLS_9;
}
if (__VLS_ctx.isSubItems()) {
    /** @type {[typeof ReviewQuestionSubQuestionList, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(ReviewQuestionSubQuestionList, new ReviewQuestionSubQuestionList({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (props.subQuestions),
        calculationRule: (props.calculationRule),
        options: (props.subQuestionOptions),
        loading: (props.subQuestionOptionsLoading),
    }));
    const __VLS_15 = __VLS_14({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (props.subQuestions),
        calculationRule: (props.calculationRule),
        options: (props.subQuestionOptions),
        loading: (props.subQuestionOptionsLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    let __VLS_17;
    let __VLS_18;
    let __VLS_19;
    const __VLS_20 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.isSubItems()))
                return;
            __VLS_ctx.emit('update:subQuestions', $event);
        }
    };
    var __VLS_16;
}
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-method-section']} */ ;
/** @type {__VLS_StyleScopedClasses['additional-form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-method-field']} */ ;
/** @type {__VLS_StyleScopedClasses['additional-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-options']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRadioGroup: PerformanceRadioGroup,
            ReviewQuestionCalculationRuleSection: ReviewQuestionCalculationRuleSection,
            ReviewQuestionSubQuestionList: ReviewQuestionSubQuestionList,
            emit: emit,
            ratingOptions: ratingOptions,
            isSubItems: isSubItems,
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
