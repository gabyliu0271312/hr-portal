import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
const props = withDefaults(defineProps(), {
    options: () => [
        { value: 'none', label: '不设置规则', showInfo: true },
        { value: 'condition', label: '按条件计算' },
    ],
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    options: () => [
        { value: 'none', label: '不设置规则', showInfo: true },
        { value: 'condition', label: '按条件计算' },
    ],
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "calculation-rule-section" },
    'data-component': "review-question-calculation-rule",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "additional-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (props.modelValue),
    options: (props.options),
    name: "review-question-calculation-rule",
    'aria-label': "计算规则",
    gap: (24),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (props.modelValue),
    options: (props.options),
    name: "review-question-calculation-rule",
    'aria-label': "计算规则",
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
/** @type {__VLS_StyleScopedClasses['calculation-rule-section']} */ ;
/** @type {__VLS_StyleScopedClasses['additional-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRadioGroup: PerformanceRadioGroup,
            emit: emit,
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
