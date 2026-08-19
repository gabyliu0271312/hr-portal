/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, reactive } from 'vue';
const props = defineProps();
const emit = defineEmits();
const config = props.rule.config || (props.rule.config = { defaultBehavior: 'keep_source', overrides: {}, unmatched: 'keep' });
config.defaultBehavior = 'keep_source';
config.overrides = config.overrides || {};
const overrideKeys = reactive({ ...Object.fromEntries(Object.keys(config.overrides).map((key) => [key, key])) });
const unmatchedOptions = [{ value: 'keep', label: '保留原值' }, { value: 'set_default', label: '设置默认值' }, { value: 'set_null', label: '设置为空' }, { value: 'flag', label: '标记未匹配' }, { value: 'reject', label: '拒绝' }];
const sourceField = computed({ get: () => props.rule.sourceFields?.[0] || '', set: (v) => { props.rule.sourceFields = v ? [v] : []; changed(); } });
const targetField = computed({ get: () => props.rule.targetFields?.[0] || '', set: (v) => { props.rule.targetFields = v ? [v] : []; changed(); } });
function fieldCode(field) { return typeof field === 'string' ? field : field.code; }
function fieldLabel(field) { return typeof field === 'string' ? field : (field.label || field.code); }
function addOverride() { let key = ''; let i = 1; while (Object.prototype.hasOwnProperty.call(config.overrides, key))
    key = `源值${i++}`; config.overrides[key] = ''; overrideKeys[key] = key; changed(); }
function removeOverride(key) { const oldKey = String(key); delete config.overrides[oldKey]; delete overrideKeys[oldKey]; changed(); }
function renameOverride(oldKeyValue, newKeyValue) { const oldKey = String(oldKeyValue); const key = String(newKeyValue || '').trim(); if (!key || key === oldKey || Object.prototype.hasOwnProperty.call(config.overrides, key)) {
    overrideKeys[oldKey] = oldKey;
    return;
} config.overrides[key] = config.overrides[oldKey]; delete config.overrides[oldKey]; overrideKeys[key] = key; delete overrideKeys[oldKey]; changed(); }
function changed() { emit('change'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
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
    label: "默认行为",
}));
const __VLS_26 = __VLS_25({
    label: "默认行为",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    type: "info",
}));
const __VLS_30 = __VLS_29({
    type: "info",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
var __VLS_31;
var __VLS_27;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
for (const [value, key] of __VLS_getVForSourceType((__VLS_ctx.config.overrides))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (key),
        ...{ class: "mapping-row" },
    });
    const __VLS_32 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.overrideKeys[key]),
        placeholder: "源值",
    }));
    const __VLS_34 = __VLS_33({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.overrideKeys[key]),
        placeholder: "源值",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    let __VLS_36;
    let __VLS_37;
    let __VLS_38;
    const __VLS_39 = {
        onChange: (...[$event]) => {
            __VLS_ctx.renameOverride(key, __VLS_ctx.overrideKeys[key]);
        }
    };
    var __VLS_35;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_40 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        ...{ 'onInput': {} },
        modelValue: (__VLS_ctx.config.overrides[key]),
        placeholder: "覆盖值",
    }));
    const __VLS_42 = __VLS_41({
        ...{ 'onInput': {} },
        modelValue: (__VLS_ctx.config.overrides[key]),
        placeholder: "覆盖值",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    let __VLS_44;
    let __VLS_45;
    let __VLS_46;
    const __VLS_47 = {
        onInput: (__VLS_ctx.changed)
    };
    var __VLS_43;
    const __VLS_48 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_50 = __VLS_49({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    let __VLS_52;
    let __VLS_53;
    let __VLS_54;
    const __VLS_55 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeOverride(key);
        }
    };
    __VLS_51.slots.default;
    var __VLS_51;
}
const __VLS_56 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}));
const __VLS_58 = __VLS_57({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onClick: (__VLS_ctx.addOverride)
};
__VLS_59.slots.default;
var __VLS_59;
const __VLS_64 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "未匹配处理",
    ...{ class: "unmatched" },
}));
const __VLS_66 = __VLS_65({
    label: "未匹配处理",
    ...{ class: "unmatched" },
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.unmatched),
}));
const __VLS_70 = __VLS_69({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.unmatched),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
let __VLS_72;
let __VLS_73;
let __VLS_74;
const __VLS_75 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_71.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.unmatchedOptions))) {
    const __VLS_76 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        key: (item.value),
        ...(item),
    }));
    const __VLS_78 = __VLS_77({
        key: (item.value),
        ...(item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
}
var __VLS_71;
var __VLS_67;
/** @type {__VLS_StyleScopedClasses['rule-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['unmatched']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            config: config,
            overrideKeys: overrideKeys,
            unmatchedOptions: unmatchedOptions,
            sourceField: sourceField,
            targetField: targetField,
            fieldCode: fieldCode,
            fieldLabel: fieldLabel,
            addOverride: addOverride,
            removeOverride: removeOverride,
            renameOverride: renameOverride,
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
