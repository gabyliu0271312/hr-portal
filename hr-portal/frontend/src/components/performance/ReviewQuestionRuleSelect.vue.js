/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const selectedOption = computed(() => props.options.find((option) => option.id === props.modelValue) ?? null);
function ruleSummary(option) {
    if (option.review_type === '评级') {
        const min = Number(option.config_summary.quantified_score_min);
        const max = Number(option.config_summary.quantified_score_max);
        if (Boolean(option.config_summary.grade_participates_in_calculation) && Number.isFinite(min) && Number.isFinite(max))
            return `评级（量化分: ${min}-${max} 分）`;
    }
    return option.review_type;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-rule-select-wrap" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    ...{ class: "review-rule-select" },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: "请选择",
    ...{ style: {} },
    loading: (__VLS_ctx.loading),
    disabled: (__VLS_ctx.loading),
    popperClass: "review-rule-select-popper",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    ...{ class: "review-rule-select" },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: "请选择",
    ...{ style: {} },
    loading: (__VLS_ctx.loading),
    disabled: (__VLS_ctx.loading),
    popperClass: "review-rule-select-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', $event);
    }
};
__VLS_3.slots.default;
if (__VLS_ctx.selectedOption) {
    {
        const { label: __VLS_thisSlot } = __VLS_3.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "selected-rule-name" },
        });
        (__VLS_ctx.selectedOption.name);
    }
}
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (option.id),
        label: (option.name),
        value: (option.id),
    }));
    const __VLS_10 = __VLS_9({
        key: (option.id),
        label: (option.name),
        value: (option.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-option-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (option.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rule-option-summary" },
    });
    (__VLS_ctx.ruleSummary(option));
    var __VLS_11;
}
var __VLS_3;
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "review-rule-select-error" },
        role: "alert",
    });
    (__VLS_ctx.error);
}
/** @type {__VLS_StyleScopedClasses['review-rule-select-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-select']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-rule-name']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-option-content']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-option-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-select-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            selectedOption: selectedOption,
            ruleSummary: ruleSummary,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
