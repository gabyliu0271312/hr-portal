/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceTextField from './PerformanceTextField.vue';
const props = defineProps();
const emit = defineEmits();
function update(key, value) {
    emit('update:modelValue', { ...props.modelValue, [key]: value });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "tag-card" },
});
if (__VLS_ctx.canRemove) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.canRemove))
                    return;
                __VLS_ctx.emit('remove');
            } },
        ...{ class: "tag-remove" },
        type: "button",
        'aria-label': "删除标签",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.name),
    placeholder: "请输入标签名称",
    maxlength: (100),
    invalid: (__VLS_ctx.submitted && !__VLS_ctx.modelValue.name.trim()),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.name),
    placeholder: "请输入标签名称",
    maxlength: (100),
    invalid: (__VLS_ctx.submitted && !__VLS_ctx.modelValue.name.trim()),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update('name', $event);
    }
};
var __VLS_2;
if (__VLS_ctx.submitted && !__VLS_ctx.modelValue.name.trim()) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-error" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.description),
    type: "textarea",
    placeholder: "请输入标签说明（选填）",
    maxlength: (20000),
    showCount: true,
}));
const __VLS_8 = __VLS_7({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.description),
    type: "textarea",
    placeholder: "请输入标签说明（选填）",
    maxlength: (20000),
    showCount: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
let __VLS_10;
let __VLS_11;
let __VLS_12;
const __VLS_13 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update('description', $event);
    }
};
var __VLS_9;
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "form-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.prompt),
    type: "textarea",
    placeholder: "请输入提示（选填）",
    maxlength: (20000),
    showCount: true,
}));
const __VLS_15 = __VLS_14({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.prompt),
    type: "textarea",
    placeholder: "请输入提示（选填）",
    maxlength: (20000),
    showCount: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
let __VLS_17;
let __VLS_18;
let __VLS_19;
const __VLS_20 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update('prompt', $event);
    }
};
var __VLS_16;
/** @type {__VLS_StyleScopedClasses['tag-card']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['form-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceTextField: PerformanceTextField,
            emit: emit,
            update: update,
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
