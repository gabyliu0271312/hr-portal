/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { QUESTION_TYPE_OPTIONS } from './reviewQuestionTypes';
import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
const props = withDefaults(defineProps(), { entryMode: 'regular_question' });
const emit = defineEmits();
const options = computed(() => QUESTION_TYPE_OPTIONS
    .filter((option) => props.entryMode === 'regular_question' || option.key !== 'okr')
    .map((option) => ({ value: option.key, label: option.label, showInfo: true })));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ entryMode: 'regular_question' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    ...{ class: "rq-type-radio" },
    modelValue: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.options),
    name: "review-question-type",
    'aria-label': "评估题类型",
    gap: (28),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    ...{ class: "rq-type-radio" },
    modelValue: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.options),
    name: "review-question-type",
    'aria-label': "评估题类型",
    gap: (28),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', $event);
    }
};
var __VLS_7 = {};
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['rq-type-radio']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRadioGroup: PerformanceRadioGroup,
            emit: emit,
            options: options,
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
