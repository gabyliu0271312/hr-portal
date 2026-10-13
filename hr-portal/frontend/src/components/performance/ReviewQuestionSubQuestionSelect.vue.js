/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const selectedOption = computed(() => props.options.find((option) => String(option.id) === String(props.modelValue)) ?? null);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    ...{ class: "review-sub-question-select" },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: "请选择",
    loading: (__VLS_ctx.loading),
    disabled: (__VLS_ctx.loading),
    popperClass: "review-sub-question-select-popper",
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    ...{ class: "review-sub-question-select" },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: "请选择",
    loading: (__VLS_ctx.loading),
    disabled: (__VLS_ctx.loading),
    popperClass: "review-sub-question-select-popper",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', $event);
    }
};
var __VLS_8 = {};
__VLS_3.slots.default;
if (__VLS_ctx.selectedOption) {
    {
        const { label: __VLS_thisSlot } = __VLS_3.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "selected-question-name" },
        });
        (__VLS_ctx.selectedOption.name);
    }
}
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    const __VLS_9 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        key: (option.id),
        label: (option.name),
        value: (option.id),
    }));
    const __VLS_11 = __VLS_10({
        key: (option.id),
        label: (option.name),
        value: (option.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_12.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-option-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (option.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sub-question-option-type" },
    });
    (option.review_type);
    var __VLS_12;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['review-sub-question-select']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-question-name']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-option-content']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-option-type']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            selectedOption: selectedOption,
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
