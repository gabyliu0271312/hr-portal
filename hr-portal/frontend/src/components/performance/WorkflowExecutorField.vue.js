/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceCheckbox from './PerformanceCheckbox.vue';
import PerformanceExecutorSelect from './PerformanceExecutorSelect.vue';
const props = withDefaults(defineProps(), {
    label: '环节执行人',
    required: true,
    modeDisabled: false,
    typesDisabled: false,
});
const emit = defineEmits();
function toggleManagerLevel(type, checked) {
    const next = checked
        ? [...new Set([...props.executorTypes, type])]
        : props.executorTypes.filter((value) => value !== type);
    emit('update:executorTypes', next);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    label: '环节执行人',
    required: true,
    modeDisabled: false,
    typesDisabled: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "workflow-executor-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row executor-row" },
    ...{ class: ({ 'executor-row--with-sub-options': __VLS_ctx.modelValue === '实线上级' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "font-medium" },
});
(__VLS_ctx.label);
if (__VLS_ctx.required) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "required-mark" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "select-wrap" },
});
/** @type {[typeof PerformanceExecutorSelect, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceExecutorSelect, new PerformanceExecutorSelect({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.options),
    disabled: (__VLS_ctx.modeDisabled),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.options),
    disabled: (__VLS_ctx.modeDisabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.$emit('update:modelValue', $event);
    }
};
var __VLS_2;
if (__VLS_ctx.modelValue === '实线上级') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-options" },
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.managerLevelOptions))) {
        /** @type {[typeof PerformanceCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
            ...{ 'onUpdate:modelValue': {} },
            key: (option.type),
            ...{ class: "check-row" },
            modelValue: (__VLS_ctx.executorTypes.includes(option.type)),
            label: (option.label),
            disabled: (__VLS_ctx.typesDisabled),
        }));
        const __VLS_8 = __VLS_7({
            ...{ 'onUpdate:modelValue': {} },
            key: (option.type),
            ...{ class: "check-row" },
            modelValue: (__VLS_ctx.executorTypes.includes(option.type)),
            label: (option.label),
            disabled: (__VLS_ctx.typesDisabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        let __VLS_10;
        let __VLS_11;
        let __VLS_12;
        const __VLS_13 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!(__VLS_ctx.modelValue === '实线上级'))
                    return;
                __VLS_ctx.toggleManagerLevel(option.type, $event);
            }
        };
        var __VLS_9;
    }
}
/** @type {__VLS_StyleScopedClasses['workflow-executor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['executor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['form-label']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['select-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-options']} */ ;
/** @type {__VLS_StyleScopedClasses['check-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceCheckbox: PerformanceCheckbox,
            PerformanceExecutorSelect: PerformanceExecutorSelect,
            toggleManagerLevel: toggleManagerLevel,
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
