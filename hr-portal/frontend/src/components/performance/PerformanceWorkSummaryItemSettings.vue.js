import PerformanceCheckbox from './PerformanceCheckbox.vue';
import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
const props = defineProps();
const emit = defineEmits();
const options = [
    { value: 'fill', label: '在此环节填写' },
    { value: 'hidden', label: '在此环节隐藏' },
];
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
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-summary-item-settings" },
    'aria-label': "工作总结填写题设置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
    ...{ class: "work-summary-setting-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({});
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.mode),
    options: (__VLS_ctx.options),
    name: "work-summary-item-mode",
    'aria-label': "填写设置",
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.mode),
    options: (__VLS_ctx.options),
    name: "work-summary-item-mode",
    'aria-label': "填写设置",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update({ mode: $event });
    }
};
var __VLS_2;
if (__VLS_ctx.modelValue.mode === 'fill') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
        ...{ class: "work-summary-setting-group work-summary-required-setting" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({});
    /** @type {[typeof PerformanceCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.modelValue.required),
        label: "必填",
        checkedColor: "#336df4",
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.modelValue.required),
        label: "必填",
        checkedColor: "#336df4",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.modelValue.mode === 'fill'))
                return;
            __VLS_ctx.update({ required: $event });
        }
    };
    var __VLS_9;
}
/** @type {__VLS_StyleScopedClasses['work-summary-item-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-setting-group']} */ ;
/** @type {__VLS_StyleScopedClasses['work-summary-required-setting']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceCheckbox: PerformanceCheckbox,
            PerformanceRadioGroup: PerformanceRadioGroup,
            options: options,
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
