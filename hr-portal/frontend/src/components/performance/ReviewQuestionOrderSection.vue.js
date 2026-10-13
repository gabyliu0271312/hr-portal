/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import ReviewQuestionOrderPreview from './ReviewQuestionOrderPreview.vue';
const props = withDefaults(defineProps(), { fillOrder: 'top', viewOrder: 'top' });
const emit = defineEmits();
const fillOrder = ref(props.fillOrder);
const viewOrder = ref(props.viewOrder);
const orderOptions = [
    { value: 'top', label: '总项在上' },
    { value: 'bottom', label: '总项在下' },
];
function selectFillOrder(value) {
    fillOrder.value = value;
    emit('update:fillOrder', value);
}
function selectViewOrder(value) {
    viewOrder.value = value;
    emit('update:viewOrder', value);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ fillOrder: 'top', viewOrder: 'top' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['order-option']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option-title']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['order-columns']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-section" },
    'data-component': "review-question-order-section",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-columns" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-column" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-options" },
    role: "radiogroup",
    'aria-label': "填写顺序",
});
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.orderOptions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectFillOrder(option.value);
            } },
        key: (option.value),
        ...{ class: "order-option" },
        ...{ class: ({ selected: __VLS_ctx.fillOrder === option.value }) },
        type: "button",
        role: "radio",
        'aria-checked': (__VLS_ctx.fillOrder === option.value),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "order-option-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "radio-dot" },
        'aria-hidden': "true",
    });
    (option.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "order-option-seam" },
        ...{ style: ({ backgroundColor: __VLS_ctx.fillOrder === option.value ? '#f0f4ff' : '#dee0e3' }) },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "order-preview" },
    });
    /** @type {[typeof ReviewQuestionOrderPreview, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(ReviewQuestionOrderPreview, new ReviewQuestionOrderPreview({
        totalPosition: (option.value),
    }));
    const __VLS_1 = __VLS_0({
        totalPosition: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-column" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "order-options" },
    role: "radiogroup",
    'aria-label': "查看顺序",
});
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.orderOptions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectViewOrder(option.value);
            } },
        key: (option.value),
        ...{ class: "order-option" },
        ...{ class: ({ selected: __VLS_ctx.viewOrder === option.value }) },
        type: "button",
        role: "radio",
        'aria-checked': (__VLS_ctx.viewOrder === option.value),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "order-option-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "radio-dot" },
        'aria-hidden': "true",
    });
    (option.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "order-option-seam" },
        ...{ style: ({ backgroundColor: __VLS_ctx.viewOrder === option.value ? '#f0f4ff' : '#dee0e3' }) },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "order-preview" },
    });
    /** @type {[typeof ReviewQuestionOrderPreview, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(ReviewQuestionOrderPreview, new ReviewQuestionOrderPreview({
        totalPosition: (option.value),
    }));
    const __VLS_4 = __VLS_3({
        totalPosition: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
}
/** @type {__VLS_StyleScopedClasses['order-section']} */ ;
/** @type {__VLS_StyleScopedClasses['order-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['order-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['order-column']} */ ;
/** @type {__VLS_StyleScopedClasses['order-label']} */ ;
/** @type {__VLS_StyleScopedClasses['order-options']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option-title']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option-seam']} */ ;
/** @type {__VLS_StyleScopedClasses['order-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['order-column']} */ ;
/** @type {__VLS_StyleScopedClasses['order-label']} */ ;
/** @type {__VLS_StyleScopedClasses['order-options']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option-title']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['order-option-seam']} */ ;
/** @type {__VLS_StyleScopedClasses['order-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReviewQuestionOrderPreview: ReviewQuestionOrderPreview,
            fillOrder: fillOrder,
            viewOrder: viewOrder,
            orderOptions: orderOptions,
            selectFillOrder: selectFillOrder,
            selectViewOrder: selectViewOrder,
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
