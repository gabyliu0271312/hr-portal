import PerformanceTextField from './PerformanceTextField.vue';
import PerformanceCheckbox from './PerformanceCheckbox.vue';
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
const props = defineProps();
const emit = defineEmits();
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }); }
function updateEnglish(enabled) { update('language', enabled ? '英文' : '中文'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['question-basic-form']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['question-basic-form']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['question-basic-form']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['question-basic-form']} */ ;
/** @type {__VLS_StyleScopedClasses['question-basic-form']} */ ;
/** @type {__VLS_StyleScopedClasses['language-control']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    labelPosition: "top",
    ...{ class: "question-basic-form" },
}));
const __VLS_2 = __VLS_1({
    labelPosition: "top",
    ...{ class: "question-basic-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
const __VLS_5 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({}));
const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_8.slots.default;
{
    const { label: __VLS_thisSlot } = __VLS_8.slots;
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "语言",
    }));
    const __VLS_10 = __VLS_9({
        label: "语言",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "language-control" },
});
/** @type {[typeof PerformanceCheckbox, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
    modelValue: (true),
    label: "中文",
    disabled: true,
}));
const __VLS_13 = __VLS_12({
    modelValue: (true),
    label: "中文",
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
/** @type {[typeof PerformanceCheckbox, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.language === '英文'),
    label: "英文",
}));
const __VLS_16 = __VLS_15({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.language === '英文'),
    label: "英文",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
let __VLS_18;
let __VLS_19;
let __VLS_20;
const __VLS_21 = {
    'onUpdate:modelValue': (__VLS_ctx.updateEnglish)
};
var __VLS_17;
var __VLS_8;
const __VLS_22 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({}));
const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
__VLS_25.slots.default;
{
    const { label: __VLS_thisSlot } = __VLS_25.slots;
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "名称",
    }));
    const __VLS_27 = __VLS_26({
        label: "名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
}
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.name),
    placeholder: "请输入名称",
}));
const __VLS_30 = __VLS_29({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.name),
    placeholder: "请输入名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update('name', $event);
    }
};
var __VLS_31;
var __VLS_25;
const __VLS_36 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { label: __VLS_thisSlot } = __VLS_39.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
}
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.description),
    type: "textarea",
    maxlength: (1000),
    showCount: true,
    placeholder: "描述将展示给评估人，帮助其进行评估",
}));
const __VLS_41 = __VLS_40({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue.description),
    type: "textarea",
    maxlength: (1000),
    showCount: true,
    placeholder: "描述将展示给评估人，帮助其进行评估",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
let __VLS_43;
let __VLS_44;
let __VLS_45;
const __VLS_46 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.update('description', $event);
    }
};
var __VLS_42;
var __VLS_39;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['question-basic-form']} */ ;
/** @type {__VLS_StyleScopedClasses['language-control']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceTextField: PerformanceTextField,
            PerformanceCheckbox: PerformanceCheckbox,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            update: update,
            updateEnglish: updateEnglish,
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
