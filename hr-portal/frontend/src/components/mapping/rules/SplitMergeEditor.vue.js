/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const config = props.rule.config || (props.rule.config = { action: 'merge', delimiter: '', nullBehavior: 'keep_null' });
const sourceFieldSelection = computed({ get: () => props.rule.sourceFields || [], set: (v) => { props.rule.sourceFields = v; changed(); } });
const targetFieldSelection = computed({ get: () => props.rule.targetFields || [], set: (v) => { props.rule.targetFields = v; changed(); } });
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
const __VLS_0 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    label: "操作",
}));
const __VLS_2 = __VLS_1({
    label: "操作",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.action),
}));
const __VLS_6 = __VLS_5({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.action),
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_7.slots.default;
const __VLS_12 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    value: "split",
}));
const __VLS_14 = __VLS_13({
    value: "split",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
var __VLS_15;
const __VLS_16 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    value: "merge",
}));
const __VLS_18 = __VLS_17({
    value: "merge",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
var __VLS_19;
var __VLS_7;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-grid" },
});
const __VLS_20 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "源字段",
}));
const __VLS_22 = __VLS_21({
    label: "源字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.sourceFieldSelection),
    multiple: true,
    filterable: true,
    allowCreate: true,
    collapseTags: true,
    placeholder: "选择或输入源字段",
}));
const __VLS_26 = __VLS_25({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.sourceFieldSelection),
    multiple: true,
    filterable: true,
    allowCreate: true,
    collapseTags: true,
    placeholder: "选择或输入源字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_27.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.sourceFields))) {
    const __VLS_32 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }));
    const __VLS_34 = __VLS_33({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
var __VLS_27;
var __VLS_23;
const __VLS_36 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "目标字段",
}));
const __VLS_38 = __VLS_37({
    label: "目标字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.targetFieldSelection),
    multiple: true,
    filterable: true,
    allowCreate: true,
    collapseTags: true,
    placeholder: "选择或输入目标字段",
}));
const __VLS_42 = __VLS_41({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.targetFieldSelection),
    multiple: true,
    filterable: true,
    allowCreate: true,
    collapseTags: true,
    placeholder: "选择或输入目标字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_43.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.targetFields))) {
    const __VLS_48 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }));
    const __VLS_50 = __VLS_49({
        key: (__VLS_ctx.fieldCode(field)),
        label: (__VLS_ctx.fieldLabel(field)),
        value: (__VLS_ctx.fieldCode(field)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
}
var __VLS_43;
var __VLS_39;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "分隔符",
}));
const __VLS_54 = __VLS_53({
    label: "分隔符",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onInput': {} },
    modelValue: (__VLS_ctx.config.delimiter),
    placeholder: "例如：, 或 |",
}));
const __VLS_58 = __VLS_57({
    ...{ 'onInput': {} },
    modelValue: (__VLS_ctx.config.delimiter),
    placeholder: "例如：, 或 |",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onInput: (__VLS_ctx.changed)
};
var __VLS_59;
var __VLS_55;
const __VLS_64 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "空值处理",
}));
const __VLS_66 = __VLS_65({
    label: "空值处理",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.nullBehavior),
}));
const __VLS_70 = __VLS_69({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.nullBehavior),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
let __VLS_72;
let __VLS_73;
let __VLS_74;
const __VLS_75 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_71.slots.default;
const __VLS_76 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    label: "保留空值",
    value: "keep_null",
}));
const __VLS_78 = __VLS_77({
    label: "保留空值",
    value: "keep_null",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
const __VLS_80 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "跳过空值",
    value: "skip_null",
}));
const __VLS_82 = __VLS_81({
    label: "跳过空值",
    value: "skip_null",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
const __VLS_84 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "视为空字符串",
    value: "empty_string",
}));
const __VLS_86 = __VLS_85({
    label: "视为空字符串",
    value: "empty_string",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
var __VLS_71;
var __VLS_67;
/** @type {__VLS_StyleScopedClasses['rule-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            config: config,
            sourceFieldSelection: sourceFieldSelection,
            targetFieldSelection: targetFieldSelection,
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
