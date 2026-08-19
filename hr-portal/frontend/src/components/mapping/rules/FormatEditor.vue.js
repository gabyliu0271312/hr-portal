/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const config = props.rule.config || (props.rule.config = { formatType: 'trim', options: {}, onError: 'reject' });
config.options = config.options || {};
const formatTypes = [{ value: 'trim', label: '去除首尾空格' }, { value: 'lower', label: '转小写' }, { value: 'upper', label: '转大写' }, { value: 'date', label: '日期格式化' }, { value: 'pad', label: '补齐' }, { value: 'truncate', label: '截断' }, { value: 'unit_convert', label: '单位转换' }];
const errorOptions = [{ value: 'keep', label: '保留原值' }, { value: 'set_null', label: '设置为空' }, { value: 'flag', label: '标记错误' }, { value: 'reject', label: '拒绝' }];
const sourceField = computed({ get: () => props.rule.sourceFields?.[0] || '', set: (v) => { props.rule.sourceFields = v ? [v] : []; changed(); } });
const targetField = computed({ get: () => props.rule.targetFields?.[0] || '', set: (v) => { props.rule.targetFields = v ? [v] : []; changed(); } });
function fieldCode(field) { return typeof field === 'string' ? field : field.code; }
function fieldLabel(field) { return typeof field === 'string' ? field : (field.label || field.code); }
function changed() { emit('change'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['option-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['option-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-editor" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-grid" },
});
const __VLS_0 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    label: "源字段",
}));
const __VLS_2 = __VLS_1({
    label: "源字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    modelValue: (__VLS_ctx.sourceField),
    placeholder: "选择源字段",
    filterable: true,
    clearable: true,
}));
const __VLS_6 = __VLS_5({
    modelValue: (__VLS_ctx.sourceField),
    placeholder: "选择源字段",
    filterable: true,
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.sourceFields))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }));
    const __VLS_10 = __VLS_9({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_7;
var __VLS_3;
const __VLS_12 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    label: "目标字段",
}));
const __VLS_14 = __VLS_13({
    label: "目标字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.targetField),
    placeholder: "选择目标字段",
    filterable: true,
    clearable: true,
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.targetField),
    placeholder: "选择目标字段",
    filterable: true,
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.targetFields))) {
    const __VLS_20 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }));
    const __VLS_22 = __VLS_21({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
var __VLS_19;
var __VLS_15;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "格式类型",
}));
const __VLS_26 = __VLS_25({
    label: "格式类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.formatType),
    filterable: true,
}));
const __VLS_30 = __VLS_29({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.formatType),
    filterable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_31.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.formatTypes))) {
    const __VLS_36 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        key: (item.value),
        ...(item),
    }));
    const __VLS_38 = __VLS_37({
        key: (item.value),
        ...(item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
}
var __VLS_31;
var __VLS_27;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "option-grid" },
});
const __VLS_40 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.trim),
}));
const __VLS_42 = __VLS_41({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.trim),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_43.slots.default;
var __VLS_43;
const __VLS_48 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.lower),
}));
const __VLS_50 = __VLS_49({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.lower),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_51.slots.default;
var __VLS_51;
const __VLS_56 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.upper),
}));
const __VLS_58 = __VLS_57({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.upper),
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_59.slots.default;
var __VLS_59;
const __VLS_64 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onInput': {} },
    modelValue: (__VLS_ctx.config.options.date),
    placeholder: "日期格式，如 YYYY-MM-DD",
}));
const __VLS_66 = __VLS_65({
    ...{ 'onInput': {} },
    modelValue: (__VLS_ctx.config.options.date),
    placeholder: "日期格式，如 YYYY-MM-DD",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onInput: (__VLS_ctx.changed)
};
__VLS_67.slots.default;
{
    const { prepend: __VLS_thisSlot } = __VLS_67.slots;
}
var __VLS_67;
const __VLS_72 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.pad),
    min: (0),
    controlsPosition: "right",
}));
const __VLS_74 = __VLS_73({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.pad),
    min: (0),
    controlsPosition: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_75.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_75.slots;
}
var __VLS_75;
const __VLS_80 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.truncate),
    min: (0),
    controlsPosition: "right",
}));
const __VLS_82 = __VLS_81({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.options.truncate),
    min: (0),
    controlsPosition: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
let __VLS_84;
let __VLS_85;
let __VLS_86;
const __VLS_87 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_83.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_83.slots;
}
var __VLS_83;
const __VLS_88 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onInput': {} },
    modelValue: (__VLS_ctx.config.options.unit_convert),
    placeholder: "单位转换规则",
}));
const __VLS_90 = __VLS_89({
    ...{ 'onInput': {} },
    modelValue: (__VLS_ctx.config.options.unit_convert),
    placeholder: "单位转换规则",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onInput: (__VLS_ctx.changed)
};
__VLS_91.slots.default;
{
    const { prepend: __VLS_thisSlot } = __VLS_91.slots;
}
var __VLS_91;
const __VLS_96 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "格式化失败处理",
}));
const __VLS_98 = __VLS_97({
    label: "格式化失败处理",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.onError),
}));
const __VLS_102 = __VLS_101({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.onError),
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
let __VLS_104;
let __VLS_105;
let __VLS_106;
const __VLS_107 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_103.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.errorOptions))) {
    const __VLS_108 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        key: (item.value),
        ...(item),
    }));
    const __VLS_110 = __VLS_109({
        key: (item.value),
        ...(item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
}
var __VLS_103;
var __VLS_99;
/** @type {__VLS_StyleScopedClasses['rule-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['option-grid']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            config: config,
            formatTypes: formatTypes,
            errorOptions: errorOptions,
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
