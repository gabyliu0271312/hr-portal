/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
if (!props.rule.sourceFields)
    props.rule.sourceFields = [];
if (!props.rule.targetFields)
    props.rule.targetFields = [];
if (!props.rule.config)
    props.rule.config = { mode: 'rename' };
const sourceField = computed({
    get: () => props.rule.sourceFields[0] || '',
    set: (value) => {
        props.rule.sourceFields = value ? [value] : [];
        changed();
    },
});
const targetField = computed({
    get: () => props.rule.targetFields[0] || '',
    set: (value) => {
        props.rule.targetFields = value ? [value] : [];
        changed();
    },
});
function fieldCode(field) { return typeof field === 'string' ? field : field.code; }
function fieldLabel(field) { return typeof field === 'string' ? field : (field.label || field.code); }
function changed() { emit('change'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-editor" },
});
const __VLS_0 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    labelPosition: "top",
    size: "small",
}));
const __VLS_2 = __VLS_1({
    labelPosition: "top",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-grid" },
});
const __VLS_4 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    label: "源字段",
}));
const __VLS_6 = __VLS_5({
    label: "源字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.sourceField),
    placeholder: "选择源字段",
    filterable: true,
    clearable: true,
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.sourceField),
    placeholder: "选择源字段",
    filterable: true,
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.sourceFields))) {
    const __VLS_12 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }));
    const __VLS_14 = __VLS_13({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
var __VLS_11;
var __VLS_7;
const __VLS_16 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "目标字段",
}));
const __VLS_18 = __VLS_17({
    label: "目标字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.targetField),
    placeholder: "选择目标字段",
    filterable: true,
    clearable: true,
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.targetField),
    placeholder: "选择目标字段",
    filterable: true,
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.targetFields))) {
    const __VLS_24 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }));
    const __VLS_26 = __VLS_25({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
var __VLS_23;
var __VLS_19;
const __VLS_28 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "映射方式",
}));
const __VLS_30 = __VLS_29({
    label: "映射方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.rule.config.mode),
}));
const __VLS_34 = __VLS_33({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.rule.config.mode),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    'onUpdate:modelValue': (__VLS_ctx.changed)
};
__VLS_35.slots.default;
const __VLS_40 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    value: "rename",
}));
const __VLS_42 = __VLS_41({
    value: "rename",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
var __VLS_43;
const __VLS_44 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    value: "copy",
}));
const __VLS_46 = __VLS_45({
    value: "copy",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
var __VLS_47;
var __VLS_35;
var __VLS_31;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['rule-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            sourceField: sourceField,
            targetField: targetField,
            fieldCode: fieldCode,
            fieldLabel: fieldLabel,
            changed: changed,
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
