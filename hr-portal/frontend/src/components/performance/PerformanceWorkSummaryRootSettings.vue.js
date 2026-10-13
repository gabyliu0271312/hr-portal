import PerformanceCheckbox from './PerformanceCheckbox.vue';
const props = defineProps();
const emit = defineEmits();
function update(patch) {
    emit('update:modelValue', { ...props.modelValue, ...patch });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-summary-root-settings" },
    'aria-label': "工作总结整体设置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
    ...{ class: "work-summary-setting-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({});
/** @type {[typeof PerformanceCheckbox, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.hideDescription),
    label: "隐藏描述",
    checkedColor: "#336df4",
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.hideDescription),
    label: "隐藏描述",
    checkedColor: "#336df4",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update({ hideDescription: $event });
    }
};
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
    ...{ class: "work-summary-setting-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({});
/** @type {[typeof PerformanceCheckbox, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.allowMultiple),
    label: "允许添加多个",
    checkedColor: "#336df4",
}));
const __VLS_8 = __VLS_7({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.allowMultiple),
    label: "允许添加多个",
    checkedColor: "#336df4",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
let __VLS_10;
let __VLS_11;
let __VLS_12;
const __VLS_13 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update({ allowMultiple: $event });
    }
};
var __VLS_9;
/** @type {__VLS_StyleScopedClasses['work-summary-root-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceCheckbox: PerformanceCheckbox,
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
