/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { reportsApi, } from '@/api/reports';
import ReportDimensionCombinationPicker from './ReportDimensionCombinationPicker.vue';
import ReportDimensionMergeRuleList from './ReportDimensionMergeRuleList.vue';
import ReportDimensionMergeTargetEditor from './ReportDimensionMergeTargetEditor.vue';
const props = defineProps();
const emit = defineEmits();
const selectedId = ref('');
const previewing = ref(false);
const preview = ref(null);
function idOf(column) {
    return column._instance_id || column.code;
}
const signature = computed(() => props.dimensions.map(idOf));
const selectedRule = computed(() => props.modelValue.find((rule) => rule.id === selectedId.value) || null);
const searchConfig = computed(() => ({
    ...props.reportConfig,
    aggregate: true,
    dimension_merge_rules: props.modelValue.filter((rule) => rule.sources.length > 0),
}));
const errorRuleIds = computed(() => {
    const names = new Map();
    const sources = new Map();
    const invalid = new Set();
    for (const rule of props.modelValue) {
        const name = rule.name.trim();
        if (!name || names.has(name))
            invalid.add(rule.id);
        names.set(name, rule.id);
        if (rule.dimension_signature.join('|') !== signature.value.join('|') || !rule.sources.length)
            invalid.add(rule.id);
        for (const source of rule.sources) {
            const key = JSON.stringify(signature.value.map((field) => source.values[field]));
            if (sources.has(key) && sources.get(key) !== rule.id)
                invalid.add(rule.id);
            sources.set(key, rule.id);
        }
    }
    for (const item of props.errors || []) {
        if (item.rule_id)
            invalid.add(item.rule_id);
    }
    return [...invalid];
});
function replaceRule(nextRule) {
    emit('update:modelValue', props.modelValue.map((rule) => rule.id === nextRule.id ? nextRule : rule));
    preview.value = null;
}
function setRuleMode(mode) {
    const rule = selectedRule.value;
    if (!rule)
        return;
    const expandBy = mode === 'expand' ? rule.expand_by : [];
    const expanded = new Set(expandBy);
    const sources = rule.sources.map((source) => ({
        values: Object.fromEntries(Object.entries(source.values).filter(([field]) => !expanded.has(field))),
    }));
    const values = Object.fromEntries(Object.entries(rule.target.values).filter(([field]) => !expanded.has(field)));
    const modes = Object.fromEntries(signature.value.map((field) => [field, expanded.has(field) ? 'preserve' : (rule.target.modes[field] === 'preserve' ? 'custom' : rule.target.modes[field] || 'custom')]));
    replaceRule({ ...rule, mode, expand_by: expandBy, sources, target: { values, modes } });
}
function setExpandBy(expandBy) {
    const rule = selectedRule.value;
    if (!rule)
        return;
    const expanded = new Set(expandBy);
    const sources = rule.sources.map((source) => ({
        values: Object.fromEntries(Object.entries(source.values).filter(([field]) => !expanded.has(field))),
    }));
    const values = Object.fromEntries(Object.entries(rule.target.values).filter(([field]) => !expanded.has(field)));
    const modes = Object.fromEntries(signature.value.map((field) => [field, expanded.has(field) ? 'preserve' : (rule.target.modes[field] === 'preserve' ? 'custom' : rule.target.modes[field] || 'custom')]));
    replaceRule({ ...rule, mode: 'expand', expand_by: expandBy, sources, target: { values, modes } });
}
function createRule() {
    if (!signature.value.length) {
        ElMessage.warning('请先在字段编排中添加至少一个维度字段');
        return;
    }
    const values = Object.fromEntries(signature.value.map((field) => [field, '']));
    const modes = Object.fromEntries(signature.value.map((field) => [field, 'custom']));
    const rule = {
        id: globalThis.crypto?.randomUUID?.() || `merge-${Date.now()}`,
        name: `归并规则 ${props.modelValue.length + 1}`,
        mode: 'exact',
        expand_by: [],
        dimension_signature: [...signature.value],
        sources: [],
        target: { values, modes },
    };
    emit('update:modelValue', [...props.modelValue, rule]);
    selectedId.value = rule.id;
}
async function removeRule(id) {
    const rule = props.modelValue.find((item) => item.id === id);
    if (!rule)
        return;
    await ElMessageBox.confirm(`确认删除归并规则“${rule.name}”？`, '删除归并规则', { type: 'warning' });
    const next = props.modelValue.filter((item) => item.id !== id);
    emit('update:modelValue', next);
    selectedId.value = next[0]?.id || '';
    preview.value = null;
}
async function loadPreview() {
    const rule = selectedRule.value;
    if (!rule || !props.datasetId)
        return;
    previewing.value = true;
    try {
        preview.value = await reportsApi.previewDimensionMerge({
            report_id: props.reportId,
            dataset_id: props.datasetId,
            scope_strategy: props.scopeStrategy,
            config: searchConfig.value,
            dimension_signature: signature.value,
            expand_by: rule.expand_by || [],
            rule_id: rule.id,
            page: 1,
            page_size: 100,
        });
    }
    finally {
        previewing.value = false;
    }
}
watch(() => props.modelValue.map((item) => item.id), (ids) => {
    if (!ids.includes(selectedId.value))
        selectedId.value = ids[0] || '';
}, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['editor-head']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-head']} */ ;
/** @type {__VLS_StyleScopedClasses['error-list']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-workspace']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "merge-config" },
});
if (__VLS_ctx.errors?.length) {
    const __VLS_0 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        type: "error",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_2 = __VLS_1({
        type: "error",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_3.slots;
        (__VLS_ctx.errors.length);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ class: "error-list" },
        role: "alert",
    });
    for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.errors))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (`${item.code}-${item.rule_id}-${index}`),
        });
        (item.message || item.code);
        if (item.field) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.field);
        }
    }
    var __VLS_3;
}
if (!__VLS_ctx.aggregate) {
    const __VLS_4 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        type: "warning",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_6 = __VLS_5({
        type: "warning",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_7.slots;
    }
    {
        const { default: __VLS_thisSlot } = __VLS_7.slots;
        if (__VLS_ctx.modelValue.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
        else {
            const __VLS_8 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_10 = __VLS_9({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_9));
            let __VLS_12;
            let __VLS_13;
            let __VLS_14;
            const __VLS_15 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.aggregate))
                        return;
                    if (!!(__VLS_ctx.modelValue.length))
                        return;
                    __VLS_ctx.emit('openRules');
                }
            };
            __VLS_11.slots.default;
            var __VLS_11;
        }
    }
    var __VLS_7;
}
if (__VLS_ctx.structuralReshape) {
    const __VLS_16 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        type: "error",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_18 = __VLS_17({
        type: "error",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_19.slots;
    }
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.structuralReshape))
                return;
            __VLS_ctx.emit('openReshape');
        }
    };
    __VLS_23.slots.default;
    var __VLS_23;
    var __VLS_19;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "merge-workspace" },
});
/** @type {[typeof ReportDimensionMergeRuleList, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(ReportDimensionMergeRuleList, new ReportDimensionMergeRuleList({
    ...{ 'onSelect': {} },
    ...{ 'onAdd': {} },
    ...{ 'onRemove': {} },
    rules: (__VLS_ctx.modelValue),
    selectedId: (__VLS_ctx.selectedId),
    errorRuleIds: (__VLS_ctx.errorRuleIds),
}));
const __VLS_29 = __VLS_28({
    ...{ 'onSelect': {} },
    ...{ 'onAdd': {} },
    ...{ 'onRemove': {} },
    rules: (__VLS_ctx.modelValue),
    selectedId: (__VLS_ctx.selectedId),
    errorRuleIds: (__VLS_ctx.errorRuleIds),
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
let __VLS_31;
let __VLS_32;
let __VLS_33;
const __VLS_34 = {
    onSelect: (...[$event]) => {
        __VLS_ctx.selectedId = $event;
    }
};
const __VLS_35 = {
    onAdd: (__VLS_ctx.createRule)
};
const __VLS_36 = {
    onRemove: (__VLS_ctx.removeRule)
};
var __VLS_30;
if (__VLS_ctx.selectedRule) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "rule-editor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "editor-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_37 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewing),
    }));
    const __VLS_39 = __VLS_38({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    let __VLS_41;
    let __VLS_42;
    let __VLS_43;
    const __VLS_44 = {
        onClick: (__VLS_ctx.loadPreview)
    };
    __VLS_40.slots.default;
    var __VLS_40;
    const __VLS_45 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
        labelPosition: "top",
    }));
    const __VLS_47 = __VLS_46({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    __VLS_48.slots.default;
    const __VLS_49 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
        label: "归并方式",
    }));
    const __VLS_51 = __VLS_50({
        label: "归并方式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_50));
    __VLS_52.slots.default;
    const __VLS_53 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.selectedRule.mode || 'exact'),
    }));
    const __VLS_55 = __VLS_54({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.selectedRule.mode || 'exact'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    let __VLS_57;
    let __VLS_58;
    let __VLS_59;
    const __VLS_60 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.selectedRule))
                return;
            __VLS_ctx.setRuleMode($event);
        }
    };
    __VLS_56.slots.default;
    const __VLS_61 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        value: "exact",
    }));
    const __VLS_63 = __VLS_62({
        value: "exact",
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    var __VLS_64;
    const __VLS_65 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        value: "expand",
    }));
    const __VLS_67 = __VLS_66({
        value: "expand",
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_68.slots.default;
    var __VLS_68;
    var __VLS_56;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-hint" },
    });
    var __VLS_52;
    if ((__VLS_ctx.selectedRule.mode || 'exact') === 'expand') {
        const __VLS_69 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
            label: "展开维度",
        }));
        const __VLS_71 = __VLS_70({
            label: "展开维度",
        }, ...__VLS_functionalComponentArgsRest(__VLS_70));
        __VLS_72.slots.default;
        const __VLS_73 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.selectedRule.expand_by || []),
            multiple: true,
            filterable: true,
            clearable: true,
            placeholder: "选择需要分别应用的维度，例如月份",
            ...{ style: {} },
        }));
        const __VLS_75 = __VLS_74({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.selectedRule.expand_by || []),
            multiple: true,
            filterable: true,
            clearable: true,
            placeholder: "选择需要分别应用的维度，例如月份",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_74));
        let __VLS_77;
        let __VLS_78;
        let __VLS_79;
        const __VLS_80 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!(__VLS_ctx.selectedRule))
                    return;
                if (!((__VLS_ctx.selectedRule.mode || 'exact') === 'expand'))
                    return;
                __VLS_ctx.setExpandBy($event);
            }
        };
        __VLS_76.slots.default;
        for (const [column] of __VLS_getVForSourceType((__VLS_ctx.dimensions))) {
            const __VLS_81 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
                key: (__VLS_ctx.idOf(column)),
                label: (column.label || column.code),
                value: (__VLS_ctx.idOf(column)),
            }));
            const __VLS_83 = __VLS_82({
                key: (__VLS_ctx.idOf(column)),
                label: (column.label || column.code),
                value: (__VLS_ctx.idOf(column)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_82));
        }
        var __VLS_76;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "form-hint" },
        });
        var __VLS_72;
    }
    const __VLS_85 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        label: "规则名称",
        error: (!__VLS_ctx.selectedRule.name.trim() ? '请输入规则名称' : ''),
    }));
    const __VLS_87 = __VLS_86({
        label: "规则名称",
        error: (!__VLS_ctx.selectedRule.name.trim() ? '请输入规则名称' : ''),
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    __VLS_88.slots.default;
    const __VLS_89 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.selectedRule.name),
        maxlength: "128",
        showWordLimit: true,
    }));
    const __VLS_91 = __VLS_90({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.selectedRule.name),
        maxlength: "128",
        showWordLimit: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    let __VLS_93;
    let __VLS_94;
    let __VLS_95;
    const __VLS_96 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.selectedRule))
                return;
            __VLS_ctx.replaceRule({ ...__VLS_ctx.selectedRule, name: $event });
        }
    };
    var __VLS_92;
    var __VLS_88;
    var __VLS_48;
    /** @type {[typeof ReportDimensionCombinationPicker, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(ReportDimensionCombinationPicker, new ReportDimensionCombinationPicker({
        ...{ 'onUpdate:modelValue': {} },
        reportId: (__VLS_ctx.reportId),
        datasetId: (__VLS_ctx.datasetId),
        scopeStrategy: (__VLS_ctx.scopeStrategy),
        config: (__VLS_ctx.searchConfig),
        dimensions: (__VLS_ctx.dimensions),
        modelValue: (__VLS_ctx.selectedRule.sources),
        expandBy: (__VLS_ctx.selectedRule.expand_by || []),
        currentRuleName: (__VLS_ctx.selectedRule.name),
    }));
    const __VLS_98 = __VLS_97({
        ...{ 'onUpdate:modelValue': {} },
        reportId: (__VLS_ctx.reportId),
        datasetId: (__VLS_ctx.datasetId),
        scopeStrategy: (__VLS_ctx.scopeStrategy),
        config: (__VLS_ctx.searchConfig),
        dimensions: (__VLS_ctx.dimensions),
        modelValue: (__VLS_ctx.selectedRule.sources),
        expandBy: (__VLS_ctx.selectedRule.expand_by || []),
        currentRuleName: (__VLS_ctx.selectedRule.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    let __VLS_100;
    let __VLS_101;
    let __VLS_102;
    const __VLS_103 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.selectedRule))
                return;
            __VLS_ctx.replaceRule({ ...__VLS_ctx.selectedRule, sources: $event });
        }
    };
    var __VLS_99;
    /** @type {[typeof ReportDimensionMergeTargetEditor, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(ReportDimensionMergeTargetEditor, new ReportDimensionMergeTargetEditor({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.selectedRule.target),
        dimensions: (__VLS_ctx.dimensions),
        sources: (__VLS_ctx.selectedRule.sources),
        expandBy: (__VLS_ctx.selectedRule.expand_by || []),
    }));
    const __VLS_105 = __VLS_104({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.selectedRule.target),
        dimensions: (__VLS_ctx.dimensions),
        sources: (__VLS_ctx.selectedRule.sources),
        expandBy: (__VLS_ctx.selectedRule.expand_by || []),
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    let __VLS_107;
    let __VLS_108;
    let __VLS_109;
    const __VLS_110 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.selectedRule))
                return;
            __VLS_ctx.replaceRule({ ...__VLS_ctx.selectedRule, target: $event });
        }
    };
    var __VLS_106;
    if (__VLS_ctx.preview) {
        const __VLS_111 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
            type: "info",
            closable: (false),
            showIcon: true,
        }));
        const __VLS_113 = __VLS_112({
            type: "info",
            closable: (false),
            showIcon: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_112));
        __VLS_114.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_114.slots;
            (__VLS_ctx.preview.source_count);
            (__VLS_ctx.preview.matched_combination_count);
        }
        {
            const { default: __VLS_thisSlot } = __VLS_114.slots;
            (__VLS_ctx.preview.collides_with_existing ? '结果与现有组合相同，将自动汇总。' : '结果为当前报表中的新组合。');
        }
        var __VLS_114;
    }
}
else {
    const __VLS_115 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
        ...{ class: "workspace-empty" },
        description: "新建规则后开始配置",
    }));
    const __VLS_117 = __VLS_116({
        ...{ class: "workspace-empty" },
        description: "新建规则后开始配置",
    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
}
/** @type {__VLS_StyleScopedClasses['merge-config']} */ ;
/** @type {__VLS_StyleScopedClasses['error-list']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['form-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReportDimensionCombinationPicker: ReportDimensionCombinationPicker,
            ReportDimensionMergeRuleList: ReportDimensionMergeRuleList,
            ReportDimensionMergeTargetEditor: ReportDimensionMergeTargetEditor,
            emit: emit,
            selectedId: selectedId,
            previewing: previewing,
            preview: preview,
            idOf: idOf,
            selectedRule: selectedRule,
            searchConfig: searchConfig,
            errorRuleIds: errorRuleIds,
            replaceRule: replaceRule,
            setRuleMode: setRuleMode,
            setExpandBy: setExpandBy,
            createRule: createRule,
            removeRule: removeRule,
            loadPreview: loadPreview,
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
