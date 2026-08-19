/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { Delete } from '@element-plus/icons-vue';
import ReportFilterList from './ReportFilterList.vue';
const props = defineProps();
const emit = defineEmits();
const operatorOptions = [
    { value: 'union', label: '并集 union', symbol: 'A ∪ B', description: '保留任意来源中出现过的名单' },
    { value: 'intersect', label: '交集 intersect', symbol: 'A ∩ B', description: '只保留所有来源都命中的名单' },
    { value: 'except', label: '差集 except', symbol: 'A - B', description: '用第一个来源减去后续来源' },
];
const textColumns = computed(() => props.allColumns.filter((item) => item.data_type !== 'number'));
const sourceCount = computed(() => props.listLookup.sources?.length || 0);
const operatorMeta = computed(() => operatorOptions.find((item) => item.value === (props.listLookup.operator || 'union')) || operatorOptions[0]);
const targetLabel = computed(() => fieldLabel(props.listLookup.lookup?.target_field));
const readySourceCount = computed(() => (props.listLookup.sources || []).filter(sourceReady).length);
const lookupReady = computed(() => props.listLookup.enabled
    && !!props.listLookup.lookup?.target_field
    && sourceCount.value > 0
    && readySourceCount.value === sourceCount.value);
const flowSummary = computed(() => {
    if (!props.listLookup.enabled)
        return '开启后，从一个或多个来源生成名单，再回查完整记录。';
    if (!sourceCount.value)
        return '先添加一个名单来源，再选择集合运算和回查目标字段。';
    const target = targetLabel.value || '未选择回查目标';
    return `${sourceCount.value} 个来源 · ${operatorMeta.value.label} · 回查 ${target}`;
});
function patch(patchValue) {
    emit('update:listLookup', { ...props.listLookup, ...patchValue });
}
function patchLookup(targetField) {
    patch({ lookup: { ...(props.listLookup.lookup || {}), target_field: targetField } });
}
function patchSource(index, patchValue) {
    const sources = [...(props.listLookup.sources || [])];
    sources[index] = { ...sources[index], ...patchValue };
    patch({ sources });
}
function patchResolver(index, patchValue) {
    const source = props.listLookup.sources[index];
    if (!source)
        return;
    patchSource(index, { resolver: { ...(source.resolver || {}), ...patchValue } });
}
function patchSourceFilters(index, filters) {
    patchSource(index, { filters });
}
function patchSourceFilterLogic(index, filterLogic) {
    patchSource(index, { filter_logic: filterLogic });
}
function sourceName(type) {
    const sameTypeCount = (props.listLookup.sources || []).filter((item) => item.type === type).length + 1;
    return type === 'field_values' ? `字段值名单 ${sameTypeCount}` : `条件筛选名单 ${sameTypeCount}`;
}
function isDefaultSourceName(name) {
    return !name || /^字段值名单 \d+$/.test(name) || /^条件筛选名单 \d+$/.test(name);
}
function createSource(type) {
    return type === 'field_values'
        ? {
            type,
            name: sourceName(type),
            source_field: '',
            resolver: { enabled: false, match_field: '', return_field: '' },
            filters: [],
            filter_logic: null,
        }
        : {
            type,
            name: sourceName(type),
            return_field: '',
            filters: [],
            filter_logic: null,
        };
}
function addSource(type = 'filtered_rows') {
    emit('update:listLookup', {
        ...props.listLookup,
        enabled: true,
        sources: [...(props.listLookup.sources || []), createSource(type)],
    });
}
function removeSource(index) {
    const sources = [...(props.listLookup.sources || [])];
    sources.splice(index, 1);
    patch({ sources });
}
function changeSourceType(index, type) {
    const current = props.listLookup.sources[index];
    if (!current || current.type === type)
        return;
    patchSource(index, {
        ...createSource(type),
        name: isDefaultSourceName(current.name) ? sourceName(type) : current.name,
        filters: current.filters || [],
        filter_logic: current.filter_logic || null,
    });
}
function sourceTitle(source, index) {
    return source.name || (source.type === 'field_values' ? `字段值名单 ${index + 1}` : `条件筛选名单 ${index + 1}`);
}
function fieldLabel(code) {
    if (!code)
        return '';
    const col = props.allColumns.find((item) => item.code === code);
    return col?.label || code;
}
function sourceReady(source) {
    if (source.type === 'field_values') {
        if (!source.source_field)
            return false;
        if (source.resolver?.enabled !== true)
            return true;
        return !!source.resolver?.match_field && !!source.resolver?.return_field;
    }
    return !!source.return_field;
}
function filterSummary(source) {
    const count = source.filters?.filter((item) => item.column).length || 0;
    return count ? `${count} 个来源筛选` : '未设置来源筛选';
}
function sourceSummary(source) {
    if (source.type === 'field_values') {
        if (!source.source_field)
            return '选择一个字段，系统会抽取该字段的去重值作为名单。';
        if (source.resolver?.enabled !== true) {
            return `抽取「${fieldLabel(source.source_field)}」的去重值，直接作为回查键。`;
        }
        const match = fieldLabel(source.resolver?.match_field) || '待选择匹配字段';
        const returns = fieldLabel(source.resolver?.return_field) || '待选择返回字段';
        return `抽取「${fieldLabel(source.source_field)}」，匹配「${match}」后返回「${returns}」。`;
    }
    const returns = fieldLabel(source.return_field) || '待选择返回字段';
    return `先按条件筛选数据行，再返回「${returns}」作为名单。`;
}
function returnFieldHint(source) {
    const target = targetLabel.value || '回查目标字段';
    if (source.type === 'filtered_rows') {
        return `这里要选择最终用于回查的键，需和「${target}」同一种字段；筛选条件请在下方“来源筛选”里配置。`;
    }
    if (source.resolver?.enabled === true) {
        return `匹配成功后返回的字段需和「${target}」同一种键。`;
    }
    return `直接使用抽取字段时，抽取字段需和「${target}」同一种键。`;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['lookup-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['source-title-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-head']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-guide']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-guide']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-source']} */ ;
/** @type {__VLS_StyleScopedClasses['is-ready']} */ ;
/** @type {__VLS_StyleScopedClasses['source-title-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-head']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['source-head']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-head']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['source-title-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['source-title-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['source-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['source-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['source-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-board']} */ ;
/** @type {__VLS_StyleScopedClasses['source-form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['source-head']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-head']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-state']} */ ;
/** @type {__VLS_StyleScopedClasses['source-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['source-template-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['source-form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block-wide']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "list-lookup-config" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "lookup-hero" },
    ...{ class: ({ 'is-enabled': __VLS_ctx.listLookup.enabled, 'is-ready': __VLS_ctx.lookupReady }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hero-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
(__VLS_ctx.flowSummary);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hero-state" },
});
const __VLS_0 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.listLookup.enabled),
    activeText: "启用",
    inactiveText: "关闭",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.listLookup.enabled),
    activeText: "启用",
    inactiveText: "关闭",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': ((v) => __VLS_ctx.patch({ enabled: v }))
};
var __VLS_3;
if (__VLS_ctx.listLookup.enabled) {
    const __VLS_8 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        type: (__VLS_ctx.lookupReady ? 'success' : 'warning'),
        effect: "plain",
    }));
    const __VLS_10 = __VLS_9({
        type: (__VLS_ctx.lookupReady ? 'success' : 'warning'),
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    (__VLS_ctx.lookupReady ? '配置完整' : '待完善');
    var __VLS_11;
}
if (__VLS_ctx.listLookup.enabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "flow-board" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-card sources-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "step-index" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.readySourceCount);
    (__VLS_ctx.sourceCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "source-template-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.listLookup.enabled))
                    return;
                __VLS_ctx.addSource('field_values');
            } },
        ...{ class: "template-card" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.listLookup.enabled))
                    return;
                __VLS_ctx.addSource('filtered_rows');
            } },
        ...{ class: "template-card" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-card operator-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "step-index" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.operatorMeta.description);
    const __VLS_12 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.listLookup.operator || 'union'),
        size: "small",
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.listLookup.operator || 'union'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patch({ operator: v }))
    };
    __VLS_15.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.operatorOptions))) {
        const __VLS_20 = {}.ElRadioButton;
        /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            key: (item.value),
            value: (item.value),
        }));
        const __VLS_22 = __VLS_21({
            key: (item.value),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        (item.symbol);
        var __VLS_23;
    }
    var __VLS_15;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-card target-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "step-index" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    const __VLS_24 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.listLookup.lookup?.target_field || ''),
        filterable: true,
        clearable: true,
        placeholder: "选择回查目标字段",
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.listLookup.lookup?.target_field || ''),
        filterable: true,
        clearable: true,
        placeholder: "选择回查目标字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.patchLookup(v))
    };
    __VLS_27.slots.default;
    for (const [col] of __VLS_getVForSourceType((__VLS_ctx.allColumns))) {
        const __VLS_32 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            key: (col.code),
            label: (col.label),
            value: (col.code),
        }));
        const __VLS_34 = __VLS_33({
            key: (col.code),
            label: (col.label),
            value: (col.code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    }
    var __VLS_27;
    if (!__VLS_ctx.sourceCount) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-guide" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    for (const [source, index] of __VLS_getVForSourceType((__VLS_ctx.listLookup.sources))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            key: (index),
            ...{ class: "lookup-source" },
            ...{ class: ({ 'is-ready': __VLS_ctx.sourceReady(source) }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "source-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "source-title-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "source-number" },
        });
        (index + 1);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.sourceTitle(source, index));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.sourceSummary(source));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "source-actions" },
        });
        const __VLS_36 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            type: (__VLS_ctx.sourceReady(source) ? 'success' : 'warning'),
            effect: "plain",
        }));
        const __VLS_38 = __VLS_37({
            type: (__VLS_ctx.sourceReady(source) ? 'success' : 'warning'),
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        __VLS_39.slots.default;
        (__VLS_ctx.sourceReady(source) ? '已配置' : '待完善');
        var __VLS_39;
        const __VLS_40 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_42 = __VLS_41({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        let __VLS_44;
        let __VLS_45;
        let __VLS_46;
        const __VLS_47 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.listLookup.enabled))
                    return;
                __VLS_ctx.removeSource(index);
            }
        };
        __VLS_43.slots.default;
        const __VLS_48 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
        const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        const __VLS_52 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
        const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
        var __VLS_51;
        var __VLS_43;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "source-form-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "field-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_56 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (source.name || ''),
            placeholder: "便于识别这个名单来源",
        }));
        const __VLS_58 = __VLS_57({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (source.name || ''),
            placeholder: "便于识别这个名单来源",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        let __VLS_60;
        let __VLS_61;
        let __VLS_62;
        const __VLS_63 = {
            'onUpdate:modelValue': ((v) => __VLS_ctx.patchSource(index, { name: v }))
        };
        var __VLS_59;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "field-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_64 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (source.type),
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (source.type),
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            'onUpdate:modelValue': ((v) => __VLS_ctx.changeSourceType(index, v))
        };
        __VLS_67.slots.default;
        const __VLS_72 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            label: "字段值名单",
            value: "field_values",
        }));
        const __VLS_74 = __VLS_73({
            label: "字段值名单",
            value: "field_values",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        const __VLS_76 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            label: "条件筛选名单",
            value: "filtered_rows",
        }));
        const __VLS_78 = __VLS_77({
            label: "条件筛选名单",
            value: "filtered_rows",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        var __VLS_67;
        if (source.type === 'field_values') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-block field-block-wide" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_80 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (source.source_field || ''),
                filterable: true,
                clearable: true,
                placeholder: "选择要抽取去重值的字段",
            }));
            const __VLS_82 = __VLS_81({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (source.source_field || ''),
                filterable: true,
                clearable: true,
                placeholder: "选择要抽取去重值的字段",
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            let __VLS_84;
            let __VLS_85;
            let __VLS_86;
            const __VLS_87 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.patchSource(index, { source_field: v }))
            };
            __VLS_83.slots.default;
            for (const [col] of __VLS_getVForSourceType((__VLS_ctx.textColumns))) {
                const __VLS_88 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                    key: (col.code),
                    label: (col.label),
                    value: (col.code),
                }));
                const __VLS_90 = __VLS_89({
                    key: (col.code),
                    label: (col.label),
                    value: (col.code),
                }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            }
            var __VLS_83;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-block field-block-wide" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_92 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (source.return_field || ''),
                filterable: true,
                clearable: true,
                placeholder: "筛选命中后返回哪个字段作为名单",
            }));
            const __VLS_94 = __VLS_93({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (source.return_field || ''),
                filterable: true,
                clearable: true,
                placeholder: "筛选命中后返回哪个字段作为名单",
            }, ...__VLS_functionalComponentArgsRest(__VLS_93));
            let __VLS_96;
            let __VLS_97;
            let __VLS_98;
            const __VLS_99 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.patchSource(index, { return_field: v }))
            };
            __VLS_95.slots.default;
            for (const [col] of __VLS_getVForSourceType((__VLS_ctx.allColumns))) {
                const __VLS_100 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                    key: (col.code),
                    label: (col.label),
                    value: (col.code),
                }));
                const __VLS_102 = __VLS_101({
                    key: (col.code),
                    label: (col.label),
                    value: (col.code),
                }, ...__VLS_functionalComponentArgsRest(__VLS_101));
            }
            var __VLS_95;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (__VLS_ctx.returnFieldHint(source));
        }
        if (source.type === 'field_values') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "resolver-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "resolver-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            const __VLS_104 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (source.resolver?.enabled === true),
                activeText: "需要解析",
                inactiveText: "直接使用",
            }));
            const __VLS_106 = __VLS_105({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (source.resolver?.enabled === true),
                activeText: "需要解析",
                inactiveText: "直接使用",
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
            let __VLS_108;
            let __VLS_109;
            let __VLS_110;
            const __VLS_111 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.patchResolver(index, { enabled: v }))
            };
            var __VLS_107;
            if (source.resolver?.enabled === true) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "resolver-grid" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "field-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                const __VLS_112 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (source.resolver?.match_field || ''),
                    filterable: true,
                    clearable: true,
                    placeholder: "用抽取值匹配哪个字段",
                }));
                const __VLS_114 = __VLS_113({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (source.resolver?.match_field || ''),
                    filterable: true,
                    clearable: true,
                    placeholder: "用抽取值匹配哪个字段",
                }, ...__VLS_functionalComponentArgsRest(__VLS_113));
                let __VLS_116;
                let __VLS_117;
                let __VLS_118;
                const __VLS_119 = {
                    'onUpdate:modelValue': ((v) => __VLS_ctx.patchResolver(index, { match_field: v }))
                };
                __VLS_115.slots.default;
                for (const [col] of __VLS_getVForSourceType((__VLS_ctx.textColumns))) {
                    const __VLS_120 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
                        key: (col.code),
                        label: (col.label),
                        value: (col.code),
                    }));
                    const __VLS_122 = __VLS_121({
                        key: (col.code),
                        label: (col.label),
                        value: (col.code),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
                }
                var __VLS_115;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "field-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                const __VLS_124 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (source.resolver?.return_field || ''),
                    filterable: true,
                    clearable: true,
                    placeholder: "匹配成功后返回哪个字段",
                }));
                const __VLS_126 = __VLS_125({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (source.resolver?.return_field || ''),
                    filterable: true,
                    clearable: true,
                    placeholder: "匹配成功后返回哪个字段",
                }, ...__VLS_functionalComponentArgsRest(__VLS_125));
                let __VLS_128;
                let __VLS_129;
                let __VLS_130;
                const __VLS_131 = {
                    'onUpdate:modelValue': ((v) => __VLS_ctx.patchResolver(index, { return_field: v }))
                };
                __VLS_127.slots.default;
                for (const [col] of __VLS_getVForSourceType((__VLS_ctx.allColumns))) {
                    const __VLS_132 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                        key: (col.code),
                        label: (col.label),
                        value: (col.code),
                    }));
                    const __VLS_134 = __VLS_133({
                        key: (col.code),
                        label: (col.label),
                        value: (col.code),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
                }
                var __VLS_127;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                (__VLS_ctx.returnFieldHint(source));
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "source-filters" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "filter-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (source.type === 'filtered_rows' ? '用于定义哪些行进入名单' : '可选，只从符合条件的行中抽取字段值');
        const __VLS_136 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            size: "small",
            effect: "plain",
        }));
        const __VLS_138 = __VLS_137({
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        (__VLS_ctx.filterSummary(source));
        var __VLS_139;
        /** @type {[typeof ReportFilterList, ]} */ ;
        // @ts-ignore
        const __VLS_140 = __VLS_asFunctionalComponent(ReportFilterList, new ReportFilterList({
            ...{ 'onUpdate:filters': {} },
            ...{ 'onUpdate:filterLogic': {} },
            filters: (source.filters || []),
            filterLogic: (source.filter_logic || null),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDatasetTables),
            showViewControls: (false),
        }));
        const __VLS_141 = __VLS_140({
            ...{ 'onUpdate:filters': {} },
            ...{ 'onUpdate:filterLogic': {} },
            filters: (source.filters || []),
            filterLogic: (source.filter_logic || null),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDatasetTables),
            showViewControls: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_140));
        let __VLS_143;
        let __VLS_144;
        let __VLS_145;
        const __VLS_146 = {
            'onUpdate:filters': ((v) => __VLS_ctx.patchSourceFilters(index, v))
        };
        const __VLS_147 = {
            'onUpdate:filterLogic': ((v) => __VLS_ctx.patchSourceFilterLogic(index, v))
        };
        var __VLS_142;
    }
}
/** @type {__VLS_StyleScopedClasses['list-lookup-config']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hero-state']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-board']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sources-card']} */ ;
/** @type {__VLS_StyleScopedClasses['step-index']} */ ;
/** @type {__VLS_StyleScopedClasses['source-template-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['template-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-card']} */ ;
/** @type {__VLS_StyleScopedClasses['step-index']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['target-card']} */ ;
/** @type {__VLS_StyleScopedClasses['step-index']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-guide']} */ ;
/** @type {__VLS_StyleScopedClasses['lookup-source']} */ ;
/** @type {__VLS_StyleScopedClasses['source-head']} */ ;
/** @type {__VLS_StyleScopedClasses['source-title-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['source-number']} */ ;
/** @type {__VLS_StyleScopedClasses['source-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['source-form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-head']} */ ;
/** @type {__VLS_StyleScopedClasses['resolver-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['field-block']} */ ;
/** @type {__VLS_StyleScopedClasses['source-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Delete: Delete,
            ReportFilterList: ReportFilterList,
            operatorOptions: operatorOptions,
            textColumns: textColumns,
            sourceCount: sourceCount,
            operatorMeta: operatorMeta,
            readySourceCount: readySourceCount,
            lookupReady: lookupReady,
            flowSummary: flowSummary,
            patch: patch,
            patchLookup: patchLookup,
            patchSource: patchSource,
            patchResolver: patchResolver,
            patchSourceFilters: patchSourceFilters,
            patchSourceFilterLogic: patchSourceFilterLogic,
            addSource: addSource,
            removeSource: removeSource,
            changeSourceType: changeSourceType,
            sourceTitle: sourceTitle,
            sourceReady: sourceReady,
            filterSummary: filterSummary,
            sourceSummary: sourceSummary,
            returnFieldHint: returnFieldHint,
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
