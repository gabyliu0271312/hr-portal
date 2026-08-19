/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, reactive, ref } from 'vue';
import { listAssetColumns } from '@/api/warehouse';
const props = defineProps();
const emit = defineEmits();
const config = props.rule.config || (props.rule.config = { lookupConfigs: [], unmatched: 'keep' });
config.lookupConfigs = config.lookupConfigs || [];
const fieldCache = reactive({ ...(props.policy?.referenceLookup?.datasetFields || {}) });
const loading = ref(new Set());
const conditionKeys = reactive({});
const referenceDatasets = computed(() => Array.from(new Set((props.policy?.referenceLookup?.allowedDatasetIds || []))).map((id) => ({ id, name: props.policy?.referenceLookup?.datasetLabels?.[id] || id })).sort((left, right) => String(left.name).localeCompare(String(right.name))));
const allowedReferenceDatasetIds = computed(() => new Set(referenceDatasets.value.map((dataset) => dataset.id)));
const unmatchedOptions = [{ label: '保留原值', value: 'keep' }, { label: '设置默认值', value: 'set_default' }, { label: '置空', value: 'set_null' }, { label: '标记未匹配', value: 'flag' }, { label: '阻断执行', value: 'reject' }];
//参考字段', value: 'keep' }, { label: '参考字段?', value: 'set_default' }, { label: '??', value: 'set_null' }, { label: '参考字段?', value: 'flag' }, { label: '参考字段', value: 'reject' }]
const fieldCode = (field) => field.code || field.column_code || field.id || field;
const fieldLabel = (field) => field.label || field.column_label || fieldCode(field);
const uniqueFields = (fields) => Array.from(new Map(fields.map((field) => [fieldCode(field), field])).values());
const referenceFields = (datasetId) => fieldCache[datasetId] || [];
const isLoading = (datasetId) => loading.value.has(datasetId);
function changed() { emit('change'); }
async function ensureReferenceFields(datasetId) {
    if (!datasetId || fieldCache[datasetId] || loading.value.has(datasetId))
        return;
    loading.value.add(datasetId);
    try {
        const response = await listAssetColumns(datasetId);
        fieldCache[datasetId] = response.columns.map((column) => column.column_code);
    }
    finally {
        loading.value.delete(datasetId);
    }
}
function newConfig() { return { id: `lookup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, priority: (config.lookupConfigs.length + 1) * 10, referenceDatasetId: '', sourceField: '', referenceMatchField: '', referenceReturnField: '', targetField: config.lookupConfigs[0]?.targetField || '', conditions: {} }; }
function addConfig() { config.lookupConfigs.push(newConfig()); changed(); }
function removeConfig(index) { config.lookupConfigs.splice(index, 1); changed(); }
function syncTarget(targetField) { config.lookupConfigs.forEach((item) => { item.targetField = targetField; }); props.rule.targetFields = targetField ? [targetField] : []; changed(); }
function resetDatasetFields(item) { item.referenceMatchField = ''; item.referenceReturnField = ''; }
function normalizeDataset(item) {
    if (!item.referenceDatasetId || allowedReferenceDatasetIds.value.has(item.referenceDatasetId))
        return false;
    item.referenceDatasetId = '';
    resetDatasetFields(item);
    return true;
}
async function changedDataset(item) { normalizeDataset(item); resetDatasetFields(item); await ensureReferenceFields(item.referenceDatasetId); changed(); }
function addCondition(item) { const key = `condition_${Object.keys(item.conditions).length + 1}`; item.conditions[key] = ''; (conditionKeys[item.id] ||= {})[key] = key; changed(); }
function removeCondition(item, field) { delete item.conditions[field]; delete (conditionKeys[item.id] || {})[field]; changed(); }
function renameCondition(item, oldField, nextField) { if (!nextField || nextField === oldField)
    return; const value = item.conditions[oldField]; delete item.conditions[oldField]; item.conditions[nextField] = value; delete conditionKeys[item.id][oldField]; conditionKeys[item.id][nextField] = nextField; changed(); }
if (!config.lookupConfigs.length)
    addConfig();
let normalizedLegacyConfig = false;
for (const item of config.lookupConfigs) {
    normalizedLegacyConfig = normalizeDataset(item) || normalizedLegacyConfig;
    conditionKeys[item.id] = Object.fromEntries(Object.keys(item.conditions || {}).map((field) => [field, field]));
    ensureReferenceFields(item.referenceDatasetId);
}
if (normalizedLegacyConfig)
    changed();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-row']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-editor lookup-editor" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "lookup-hint" },
});
for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.config.lookupConfigs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.id),
        ...{ class: "lookup-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "lookup-card__header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (index + 1);
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        disabled: (__VLS_ctx.config.lookupConfigs.length === 1),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        disabled: (__VLS_ctx.config.lookupConfigs.length === 1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeConfig(index);
        }
    };
    __VLS_3.slots.default;
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-grid" },
    });
    const __VLS_8 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        label: "优先级",
    }));
    const __VLS_10 = __VLS_9({
        label: "优先级",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ 'onChange': {} },
        modelValue: (item.priority),
        min: (1),
        controlsPosition: "right",
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onChange': {} },
        modelValue: (item.priority),
        min: (1),
        controlsPosition: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        onChange: (__VLS_ctx.changed)
    };
    var __VLS_15;
    var __VLS_11;
    const __VLS_20 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        label: "参考数据表",
    }));
    const __VLS_22 = __VLS_21({
        label: "参考数据表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onChange': {} },
        modelValue: (item.referenceDatasetId),
        filterable: true,
        clearable: true,
        placeholder: "选择 DWD 数据表",
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onChange': {} },
        modelValue: (item.referenceDatasetId),
        filterable: true,
        clearable: true,
        placeholder: "选择 DWD 数据表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onChange: (...[$event]) => {
            __VLS_ctx.changedDataset(item);
        }
    };
    __VLS_27.slots.default;
    for (const [dataset] of __VLS_getVForSourceType((__VLS_ctx.referenceDatasets))) {
        const __VLS_32 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            key: (dataset.id),
            label: (dataset.name),
            value: (dataset.id),
        }));
        const __VLS_34 = __VLS_33({
            key: (dataset.id),
            label: (dataset.name),
            value: (dataset.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    }
    var __VLS_27;
    var __VLS_23;
    const __VLS_36 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        label: "ODS 源字段",
    }));
    const __VLS_38 = __VLS_37({
        label: "ODS 源字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    const __VLS_40 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        ...{ 'onChange': {} },
        modelValue: (item.sourceField),
        filterable: true,
        clearable: true,
        placeholder: "选择 ODS 源字段",
    }));
    const __VLS_42 = __VLS_41({
        ...{ 'onChange': {} },
        modelValue: (item.sourceField),
        filterable: true,
        clearable: true,
        placeholder: "选择 ODS 源字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    let __VLS_44;
    let __VLS_45;
    let __VLS_46;
    const __VLS_47 = {
        onChange: (__VLS_ctx.changed)
    };
    __VLS_43.slots.default;
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.uniqueFields(__VLS_ctx.sourceFields)))) {
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
        label: "参考匹配字段",
    }));
    const __VLS_54 = __VLS_53({
        label: "参考匹配字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ 'onChange': {} },
        modelValue: (item.referenceMatchField),
        filterable: true,
        clearable: true,
        loading: (__VLS_ctx.isLoading(item.referenceDatasetId)),
        placeholder: "选择参考匹配字段",
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onChange': {} },
        modelValue: (item.referenceMatchField),
        filterable: true,
        clearable: true,
        loading: (__VLS_ctx.isLoading(item.referenceDatasetId)),
        placeholder: "选择参考匹配字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onChange: (__VLS_ctx.changed)
    };
    __VLS_59.slots.default;
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.referenceFields(item.referenceDatasetId)))) {
        const __VLS_64 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            key: (field),
            label: (field),
            value: (field),
        }));
        const __VLS_66 = __VLS_65({
            key: (field),
            label: (field),
            value: (field),
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    }
    var __VLS_59;
    var __VLS_55;
    const __VLS_68 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        label: "参考返回字段",
    }));
    const __VLS_70 = __VLS_69({
        label: "参考返回字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    const __VLS_72 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onChange': {} },
        modelValue: (item.referenceReturnField),
        filterable: true,
        clearable: true,
        loading: (__VLS_ctx.isLoading(item.referenceDatasetId)),
        placeholder: "选择参考返回字段",
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onChange': {} },
        modelValue: (item.referenceReturnField),
        filterable: true,
        clearable: true,
        loading: (__VLS_ctx.isLoading(item.referenceDatasetId)),
        placeholder: "选择参考返回字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onChange: (__VLS_ctx.changed)
    };
    __VLS_75.slots.default;
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.referenceFields(item.referenceDatasetId)))) {
        const __VLS_80 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            key: (field),
            label: (field),
            value: (field),
        }));
        const __VLS_82 = __VLS_81({
            key: (field),
            label: (field),
            value: (field),
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    }
    var __VLS_75;
    var __VLS_71;
    const __VLS_84 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        label: "目标 DWD 字段",
    }));
    const __VLS_86 = __VLS_85({
        label: "目标 DWD 字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    const __VLS_88 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onChange': {} },
        modelValue: (item.targetField),
        filterable: true,
        clearable: true,
        disabled: (index > 0),
        placeholder: "选择目标 DWD 字段",
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onChange': {} },
        modelValue: (item.targetField),
        filterable: true,
        clearable: true,
        disabled: (index > 0),
        placeholder: "选择目标 DWD 字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onChange: (...[$event]) => {
            __VLS_ctx.syncTarget(item.targetField);
        }
    };
    __VLS_91.slots.default;
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.uniqueFields(__VLS_ctx.targetFields)))) {
        const __VLS_96 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            key: (__VLS_ctx.fieldCode(field)),
            label: (__VLS_ctx.fieldLabel(field)),
            value: (__VLS_ctx.fieldCode(field)),
        }));
        const __VLS_98 = __VLS_97({
            key: (__VLS_ctx.fieldCode(field)),
            label: (__VLS_ctx.fieldLabel(field)),
            value: (__VLS_ctx.fieldCode(field)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    }
    var __VLS_91;
    var __VLS_87;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "conditions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "conditions__title" },
    });
    for (const [_value, field] of __VLS_getVForSourceType((item.conditions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (String(field)),
            ...{ class: "condition-row" },
        });
        const __VLS_100 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.conditionKeys[item.id][String(field)]),
            filterable: true,
            placeholder: "参考条件字段",
        }));
        const __VLS_102 = __VLS_101({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.conditionKeys[item.id][String(field)]),
            filterable: true,
            placeholder: "参考条件字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        let __VLS_104;
        let __VLS_105;
        let __VLS_106;
        const __VLS_107 = {
            onChange: (...[$event]) => {
                __VLS_ctx.renameCondition(item, String(field), __VLS_ctx.conditionKeys[item.id][String(field)]);
            }
        };
        __VLS_103.slots.default;
        for (const [referenceField] of __VLS_getVForSourceType((__VLS_ctx.referenceFields(item.referenceDatasetId)))) {
            const __VLS_108 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                key: (referenceField),
                label: (referenceField),
                value: (referenceField),
            }));
            const __VLS_110 = __VLS_109({
                key: (referenceField),
                label: (referenceField),
                value: (referenceField),
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        }
        var __VLS_103;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_112 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            ...{ 'onInput': {} },
            modelValue: (item.conditions[String(field)]),
            placeholder: "固定值",
        }));
        const __VLS_114 = __VLS_113({
            ...{ 'onInput': {} },
            modelValue: (item.conditions[String(field)]),
            placeholder: "固定值",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        let __VLS_116;
        let __VLS_117;
        let __VLS_118;
        const __VLS_119 = {
            onInput: (__VLS_ctx.changed)
        };
        var __VLS_115;
        const __VLS_120 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_124;
        let __VLS_125;
        let __VLS_126;
        const __VLS_127 = {
            onClick: (...[$event]) => {
                __VLS_ctx.removeCondition(item, String(field));
            }
        };
        __VLS_123.slots.default;
        var __VLS_123;
    }
    const __VLS_128 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_130 = __VLS_129({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    let __VLS_132;
    let __VLS_133;
    let __VLS_134;
    const __VLS_135 = {
        onClick: (...[$event]) => {
            __VLS_ctx.addCondition(item);
        }
    };
    __VLS_131.slots.default;
    var __VLS_131;
}
const __VLS_136 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    ...{ 'onClick': {} },
    plain: true,
    type: "primary",
}));
const __VLS_138 = __VLS_137({
    ...{ 'onClick': {} },
    plain: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
let __VLS_140;
let __VLS_141;
let __VLS_142;
const __VLS_143 = {
    onClick: (__VLS_ctx.addConfig)
};
__VLS_139.slots.default;
var __VLS_139;
const __VLS_144 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
const __VLS_148 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "未匹配处理",
}));
const __VLS_150 = __VLS_149({
    label: "未匹配处理",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.unmatched),
}));
const __VLS_154 = __VLS_153({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.config.unmatched),
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
let __VLS_156;
let __VLS_157;
let __VLS_158;
const __VLS_159 = {
    onChange: (__VLS_ctx.changed)
};
__VLS_155.slots.default;
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.unmatchedOptions))) {
    const __VLS_160 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }));
    const __VLS_162 = __VLS_161({
        key: (option.value),
        label: (option.label),
        value: (option.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
}
var __VLS_155;
var __VLS_151;
if (__VLS_ctx.config.unmatched === 'set_default') {
    const __VLS_164 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        label: "默认值",
    }));
    const __VLS_166 = __VLS_165({
        label: "默认值",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    const __VLS_168 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        ...{ 'onInput': {} },
        modelValue: (__VLS_ctx.config.defaultValue),
        placeholder: "未匹配时写入的默认值",
    }));
    const __VLS_170 = __VLS_169({
        ...{ 'onInput': {} },
        modelValue: (__VLS_ctx.config.defaultValue),
        placeholder: "未匹配时写入的默认值",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    let __VLS_172;
    let __VLS_173;
    let __VLS_174;
    const __VLS_175 = {
        onInput: (__VLS_ctx.changed)
    };
    var __VLS_171;
    var __VLS_167;
}
/** @type {__VLS_StyleScopedClasses['rule-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-card']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-card__header']} */ ;
/** @type {__VLS_StyleScopedClasses['field-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['conditions']} */ ;
/** @type {__VLS_StyleScopedClasses['conditions__title']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            config: config,
            conditionKeys: conditionKeys,
            referenceDatasets: referenceDatasets,
            unmatchedOptions: unmatchedOptions,
            fieldCode: fieldCode,
            fieldLabel: fieldLabel,
            uniqueFields: uniqueFields,
            referenceFields: referenceFields,
            isLoading: isLoading,
            changed: changed,
            addConfig: addConfig,
            removeConfig: removeConfig,
            syncTarget: syncTarget,
            changedDataset: changedDataset,
            addCondition: addCondition,
            removeCondition: removeCondition,
            renameCondition: renameCondition,
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
