/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import ReviewQuestionMethodSelector from './ReviewQuestionMethodSelector.vue';
const props = defineProps();
const emit = defineEmits();
const fullOptions = [
    { value: 'direct', label: '直接评分', showInfo: true },
    { value: 'sub_items', label: '按子评估项评分', showInfo: true },
    { value: 'total_score', label: '作为总分项计算评分', showInfo: true },
];
function normalizeMethod(value) {
    const text = String(value ?? '');
    if (text === 'sub_items' || text.includes('子评估项'))
        return 'sub_items';
    if (text === 'total_score' || text.includes('总分项'))
        return 'total_score';
    return 'direct';
}
const options = computed(() => props.variant === 'score_fixed' ? fullOptions.slice(0, 1) : fullOptions);
const selectedMethod = ref(props.modelValue || (props.variant === 'score_fixed' ? 'direct' : normalizeMethod(props.config.evaluationMethod ?? props.config.evaluation_method)));
watch(() => [props.variant, props.config, props.modelValue], () => {
    selectedMethod.value = props.modelValue || (props.variant === 'score_fixed' ? 'direct' : normalizeMethod(props.config.evaluationMethod ?? props.config.evaluation_method));
}, { deep: true });
watch(selectedMethod, (value) => emit('update:modelValue', value));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "question-card scoring-method-card" },
    ...{ class: ({ 'has-additional': !!__VLS_ctx.$slots.default }) },
    'data-variant': (__VLS_ctx.variant),
    'aria-label': "评估方式",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
/** @type {[typeof ReviewQuestionMethodSelector, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(ReviewQuestionMethodSelector, new ReviewQuestionMethodSelector({
    modelValue: (__VLS_ctx.selectedMethod),
    label: "评分方式",
    options: (__VLS_ctx.options),
    name: (`scoring-method-${__VLS_ctx.variant}`),
}));
const __VLS_1 = __VLS_0({
    modelValue: (__VLS_ctx.selectedMethod),
    label: "评分方式",
    options: (__VLS_ctx.options),
    name: (`scoring-method-${__VLS_ctx.variant}`),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
var __VLS_3 = {};
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['scoring-method-card']} */ ;
// @ts-ignore
var __VLS_4 = __VLS_3;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReviewQuestionMethodSelector: ReviewQuestionMethodSelector,
            options: options,
            selectedMethod: selectedMethod,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
