/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { ArrowDown, ArrowRight, Close, Delete, Edit, Filter, Hide, Plus, Rank, Search, View } from '@element-plus/icons-vue';
import { DISPLAY_UNIT_LABELS, formatReportValue, resolveDisplayFormat } from '@/utils/reportNumberFormat';
import { REPORT_AGG_FUNCS, reportAggLabel } from '@/constants/reportAggregation';
import ReportFilterList from './ReportFilterList.vue';
const props = defineProps();
const emit = defineEmits();
const AGG_FUNCS = REPORT_AGG_FUNCS;
/** Track B: source_code lookup — strip #N suffix */
function sourceCode(instanceId) {
    return instanceId.replace(/#\d+$/, '');
}
/** 最大后缀+1 生成下一个 instance_id */
function nextInstanceId(sourceCode) {
    const suffixes = [];
    for (const id of props.selectedCodes) {
        if (id === sourceCode)
            suffixes.push(1);
        else if (id.startsWith(sourceCode + '#')) {
            const n = Number(id.split('#').pop());
            if (!isNaN(n))
                suffixes.push(n);
        }
    }
    const next = Math.max(0, ...suffixes, 0) + 1;
    return next === 1 ? sourceCode : `${sourceCode}#${next}`;
}
/** instance_id → 显示名 */
function instanceLabel(instanceId) {
    const base = sourceCode(instanceId);
    const col = props.allColumns.find((item) => item.code === base);
    const baseLabel = col ? cleanFieldLabel(col) : base;
    if (instanceId === base)
        return baseLabel;
    const n = instanceId.split('#').pop();
    return `${baseLabel} (${n})`;
}
const selectedCols = computed(() => props.selectedCodes
    .map((id) => {
    const col = props.allColumns.find((item) => item.code === sourceCode(id));
    return col ? { ...col, _instance_id: id, key: id } : null;
})
    .filter((item) => !!item));
const availableCols = computed(() => {
    const kw = fieldSearch.value.trim().toLowerCase();
    // Track B: 不排除已选字段，允许重复选择
    return props.allColumns.filter((item) => {
        if (!kw)
            return true;
        return cleanFieldLabel(item).toLowerCase().includes(kw) || item.code.toLowerCase().includes(kw);
    });
});
const availableColumnGroups = computed(() => groupColumns(availableCols.value));
const selectedDimensions = computed(() => selectedCols.value.filter((item) => !isMeasureLike(item)));
const selectedMeasures = computed(() => selectedCols.value.filter((item) => isMeasureLike(item)));
const selectedFieldGroups = computed(() => [
    {
        key: 'dimension',
        title: '维度',
        count: selectedDimensions.value.length,
        columns: selectedDimensions.value,
        empty: '单击左侧维度字段后会加入这里',
    },
    {
        key: 'measure',
        title: '指标',
        count: selectedMeasures.value.length,
        columns: selectedMeasures.value,
        empty: '单击左侧指标字段后会加入这里',
    },
]);
const numericSelectedCols = computed(() => selectedCols.value.filter((item) => item.agg_role === 'measure' || item.data_type === 'number'));
const draggingCode = ref('');
const fieldSearch = ref('');
const collapsedSourceKeys = ref(new Set());
const advancedOpen = ref(false);
const advancedTab = ref('rules');
const metricFilterOpen = ref(false);
const metricFilterCol = ref(null);
const metricFilterDraft = ref([]);
const metricFilterLogicDraft = ref(null);
const displayFormatOpen = ref(false);
const displayFormatCol = ref(null);
const displayFormatDraft = ref({ type: 'default' });
const DISPLAY_UNIT_OPTIONS = Object.entries(DISPLAY_UNIT_LABELS).map(([value, label]) => ({ value: value, label }));
const ROUNDING_OPTIONS = [
    { value: 'half_up', label: '四舍五入' },
    { value: 'ceil', label: '向上取整' },
    { value: 'floor', label: '向下取整' },
];
const advancedMeta = computed(() => {
    const map = {
        rules: {
            title: '统计规则',
            desc: '控制明细/汇总口径、默认统计方式、拆分规则和余差收口。',
        },
        reshape: {
            title: '数据重塑',
            desc: '把字段结构转换为更适合分析的形态，例如重映射、列转行、行转列。',
        },
        lookup: {
            title: '名单回查',
            desc: '先从字段值或筛选结果生成名单，再用集合运算回查完整记录。',
        },
        push: {
            title: '推送配置',
            desc: '为当前报表配置一个或多个对外推送配置，保存后可在报表列表手动推送。',
        },
    };
    return map[advancedTab.value];
});
function sourceKey(code) {
    if (code.startsWith('calc.'))
        return 'calc';
    return props.isDataset && code.includes('.') ? code.slice(0, code.indexOf('.')) : 'current';
}
function sourceLabel(code) {
    const key = sourceKey(code);
    if (key === 'calc')
        return '计算字段';
    if (!props.isDataset)
        return '当前报表';
    return props.sourceGroups?.find((item) => item.key === key)?.label || key;
}
function cleanFieldLabel(col) {
    const prefix = `${sourceKey(col.code)}.`;
    if (!props.isDataset)
        return col.label;
    if (col.label.startsWith(prefix))
        return col.label.slice(prefix.length);
    const dot = col.label.lastIndexOf('.');
    return dot >= 0 ? col.label.slice(dot + 1) : col.label;
}
function cleanFieldCode(col) {
    if (!props.isDataset)
        return col.code;
    const prefix = `${sourceKey(col.code)}.`;
    return col.code.startsWith(prefix) ? col.code.slice(prefix.length) : col.code;
}
function groupColumns(cols) {
    const grouped = new Map();
    for (const col of cols) {
        const key = sourceKey(col.code);
        if (!grouped.has(key)) {
            grouped.set(key, { key, label: sourceLabel(col.code), columns: [] });
        }
        grouped.get(key).columns.push(col);
    }
    return [...grouped.values()];
}
function colSetting(code) {
    return props.columnSettings[code] || {};
}
function isCountAggregation(value) {
    return value === 'count' || value === 'count_distinct';
}
function isCountMetric(col) {
    return col.agg_role !== 'measure' && isCountAggregation(colSetting((col.key || col.code)).aggregation);
}
function isMeasureLike(col) {
    return col.agg_role === 'measure' || isCountMetric(col);
}
function countAggOptions() {
    return AGG_FUNCS.filter((item) => isCountAggregation(item.value));
}
function updateSetting(code, patch) {
    emit('update:columnSettings', {
        ...props.columnSettings,
        [code]: { ...colSetting(code), ...patch },
    });
}
function clearSettingKey(code, key) {
    const current = { ...colSetting(code) };
    delete current[key];
    emit('update:columnSettings', {
        ...props.columnSettings,
        [code]: current,
    });
}
function displayLabel(col) {
    return colSetting((col.key || col.code)).display_name || instanceLabel(col.key || col.code);
}
function aggRoleOf(code) {
    return props.allColumns.find((item) => item.code === code)?.agg_role;
}
function addColumn(code) {
    const instanceId = nextInstanceId(code);
    const next = [...props.selectedCodes];
    if (aggRoleOf(code) === 'measure') {
        next.push(instanceId);
    }
    else {
        const firstMeasureIndex = next.findIndex((item) => aggRoleOf(sourceCode(item)) === 'measure');
        next.splice(firstMeasureIndex >= 0 ? firstMeasureIndex : next.length, 0, instanceId);
    }
    emit('update:selectedCodes', next);
}
function removeColumn(instanceId) {
    emit('removeColumn', instanceId);
}
function reorderColumn(code, targetCode) {
    if (!code || !targetCode || code === targetCode)
        return;
    const next = [...props.selectedCodes];
    const from = next.indexOf(code);
    const to = next.indexOf(targetCode);
    if (from < 0 || to < 0)
        return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    emit('update:selectedCodes', next);
}
function sourceTableLabel(code) {
    const label = sourceLabel(code);
    const alias = sourceKey(code);
    if (alias === 'calc')
        return label;
    return label;
}
function fieldSource(col) {
    return `${sourceTableLabel(col.code)}.${cleanFieldLabel(col)}`;
}
function defaultAggregationValue() {
    return (props.defaultAggregation || 'sum');
}
function effectiveAggregation(col) {
    return (colSetting((col.key || col.code)).aggregation || defaultAggregationValue());
}
function fieldAggregationLabel(col) {
    if (isCountMetric(col))
        return reportAggLabel(colSetting((col.key || col.code)).aggregation);
    if (col.agg_role !== 'measure')
        return '分组';
    return reportAggLabel(effectiveAggregation(col));
}
function setDefaultAggregation(value) {
    emit('update:defaultAggregation', value);
}
function setAggregate(value) {
    emit('update:aggregate', value);
    if (!value && props.roundingGroupBy.length) {
        emit('update:roundingGroupBy', []);
    }
}
function setOutputMode(value) {
    setAggregate(value === true || value === 'true' || value === 1 || value === '1');
}
function setAggregation(code, value) {
    updateSetting(code, { aggregation: value });
}
function resetAggregation(code) {
    clearSettingKey(code, 'aggregation');
}
function metricFilters(col) {
    return colSetting((col.key || col.code)).metric_filters || [];
}
function metricFilterLogic(col) {
    return colSetting((col.key || col.code)).metric_filter_logic || null;
}
function metricFilterSummary(col) {
    const count = metricFilters(col).filter((item) => item.column).length;
    return count ? `指标筛选 ${count} 条` : '';
}
function metricFilterCount(col) {
    return metricFilters(col).filter((item) => item.column).length;
}
function cloneMetricFilters(filters = []) {
    return filters.map((item) => ({ ...item }));
}
function openMetricFilterDialog(col) {
    metricFilterCol.value = col;
    metricFilterDraft.value = cloneMetricFilters(metricFilters(col));
    metricFilterLogicDraft.value = metricFilterLogic(col)
        ? { ...metricFilterLogic(col) }
        : null;
    metricFilterOpen.value = true;
}
function clearMetricFilterDraft() {
    metricFilterDraft.value = [];
    metricFilterLogicDraft.value = null;
}
function setMetricFilterDraft(filters) {
    metricFilterDraft.value = filters;
}
function setMetricFilterLogicDraft(logic) {
    metricFilterLogicDraft.value = logic;
}
function confirmMetricFilterDialog() {
    if (!metricFilterCol.value)
        return;
    updateSetting(metricFilterCol.value.code, {
        metric_filters: cloneMetricFilters(metricFilterDraft.value),
        metric_filter_logic: metricFilterLogicDraft.value,
    });
    metricFilterOpen.value = false;
}
function resetDisplayName(code) {
    updateSetting(code, { display_name: '' });
}
function defaultFormatDraft(type) {
    if (type === 'default')
        return { type };
    if (type === 'percent')
        return { type, precision: 2, rounding_rule: 'half_up' };
    return { type, precision: 2, unit: 'none', thousands_separator: true, rounding_rule: 'half_up' };
}
function openDisplayFormatDialog(col) {
    displayFormatCol.value = col;
    const saved = colSetting(col.key || col.code).display_format;
    displayFormatDraft.value = saved ? { ...saved } : defaultFormatDraft('default');
    displayFormatOpen.value = true;
}
function setDisplayFormatType(type) {
    displayFormatDraft.value = defaultFormatDraft(type);
}
const displayFormatPreview = computed(() => formatReportValue('1234567.891234', displayFormatDraft.value));
const displayFormatSummary = computed(() => {
    const value = resolveDisplayFormat(displayFormatDraft.value);
    if (value.type === 'default')
        return '四舍五入，保留 2 位小数，使用千分位分隔符';
    return value.type === 'percent' ? `保留 ${value.precision} 位小数，${ROUNDING_OPTIONS.find((item) => item.value === value.rounding_rule)?.label}` : `保留 ${value.precision} 位小数，${DISPLAY_UNIT_LABELS[value.unit]}，${value.thousands_separator ? '千分位' : '不使用千分位'}`;
});
function confirmDisplayFormatDialog() {
    if (!displayFormatCol.value)
        return;
    updateSetting(displayFormatCol.value.key || displayFormatCol.value.code, { display_format: { ...displayFormatDraft.value } });
    displayFormatOpen.value = false;
}
function toggleHidden(code) {
    updateSetting(code, { hidden: !colSetting(code).hidden });
}
function setSplitMode(code, value) {
    const patch = { split_mode: value };
    if (value !== 'custom')
        patch.split_factors = [];
    updateSetting(code, patch);
}
function splitFactors(code) {
    const s = colSetting(code);
    return s.split_factors ?? (s.split_factor ? [s.split_factor] : []);
}
function setSplitFactor(code, i, value) {
    const next = [...splitFactors(code)];
    next[i] = value;
    updateSetting(code, { split_mode: 'custom', split_factors: next, split_factor: undefined });
}
function addSplitFactor(code) {
    updateSetting(code, { split_mode: 'custom', split_factors: [...splitFactors(code), ''], split_factor: undefined });
}
function removeSplitFactor(code, i) {
    const next = [...splitFactors(code)];
    next.splice(i, 1);
    updateSetting(code, { split_mode: 'custom', split_factors: next, split_factor: undefined });
}
function defaultFactors() {
    return props.defaultSplitRule.factors ?? (props.defaultSplitRule.factor ? [props.defaultSplitRule.factor] : []);
}
function setDefaultFactor(i, value) {
    const next = [...defaultFactors()];
    next[i] = value;
    emit('update:defaultSplitRule', { ...props.defaultSplitRule, factors: next, factor: undefined });
}
function addDefaultFactor() {
    emit('update:defaultSplitRule', { ...props.defaultSplitRule, factors: [...defaultFactors(), ''], factor: undefined });
}
function removeDefaultFactor(i) {
    const next = [...defaultFactors()];
    next.splice(i, 1);
    emit('update:defaultSplitRule', { ...props.defaultSplitRule, factors: next, factor: undefined });
}
function sourceCollapsed(key) {
    return collapsedSourceKeys.value.has(key);
}
function toggleSourceGroup(key) {
    const next = new Set(collapsedSourceKeys.value);
    if (next.has(key))
        next.delete(key);
    else
        next.add(key);
    collapsedSourceKeys.value = next;
}
function fieldSort(code) {
    return props.sorts?.find((item) => item.column === code);
}
function fieldSortIndex(code) {
    return props.sorts?.findIndex((item) => item.column === code) ?? -1;
}
function fieldSortLabel(code) {
    const sort = fieldSort(code);
    if (!sort)
        return '';
    const order = sort.order === 'asc' ? '升序' : '降序';
    const index = fieldSortIndex(code);
    return index >= 0 ? `${order} ${index + 1}` : order;
}
function setFieldSort(code, order) {
    const next = [...(props.sorts || [])];
    const index = next.findIndex((item) => item.column === code);
    if (index >= 0)
        next[index] = { ...next[index], order };
    else
        next.push({ column: code, order });
    emit('update:sorts', next);
}
function clearFieldSort(code) {
    emit('update:sorts', (props.sorts || []).filter((item) => item.column !== code));
}
function openAdvanced(tab) {
    advancedTab.value = tab;
    advancedOpen.value = true;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['source-head']} */ ;
/** @type {__VLS_StyleScopedClasses['available-field']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-row']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-row']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-meta-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-meta-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['is-dimension']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['is-measure']} */ ;
/** @type {__VLS_StyleScopedClasses['field-agg-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['is-dimension']} */ ;
/** @type {__VLS_StyleScopedClasses['field-filter-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-filter-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-config-button']} */ ;
/** @type {__VLS_StyleScopedClasses['display-format-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['display-format-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-filter-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-filter-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['is-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['is-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['is-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['field-config-button']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['is-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['field-agg-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-main']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-option']} */ ;
/** @type {__VLS_StyleScopedClasses['field-workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['available-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['source-groups']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-meta-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-meta-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-row']} */ ;
/** @type {__VLS_StyleScopedClasses['row-label']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-workbench" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "available-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "panel-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "available-head-actions" },
});
if (__VLS_ctx.canCreateField) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
        plain: true,
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.canCreateField))
                return;
            __VLS_ctx.emit('createField');
        }
    };
    __VLS_3.slots.default;
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
    const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.availableCols.length);
const __VLS_16 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.fieldSearch),
    size: "small",
    clearable: true,
    prefixIcon: (__VLS_ctx.Search),
    placeholder: "搜索字段名称/编码",
    ...{ style: {} },
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.fieldSearch),
    size: "small",
    clearable: true,
    prefixIcon: (__VLS_ctx.Search),
    placeholder: "搜索字段名称/编码",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
if (__VLS_ctx.availableColumnGroups.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "source-groups" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.availableColumnGroups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            key: (group.key),
            ...{ class: "source-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.availableColumnGroups.length))
                        return;
                    __VLS_ctx.toggleSourceGroup(group.key);
                } },
            ...{ class: "source-head" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "source-title" },
        });
        const __VLS_20 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
        const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        const __VLS_24 = ((__VLS_ctx.sourceCollapsed(group.key) ? __VLS_ctx.ArrowRight : __VLS_ctx.ArrowDown));
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
        const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
        var __VLS_23;
        (group.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (group.columns.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "available-list" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (!__VLS_ctx.sourceCollapsed(group.key) || !!__VLS_ctx.fieldSearch.trim()) }, null, null);
        for (const [col] of __VLS_getVForSourceType((group.columns))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.availableColumnGroups.length))
                            return;
                        __VLS_ctx.addColumn(col.code);
                    } },
                key: (col.code),
                ...{ class: "available-field" },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "field-main" },
            });
            const __VLS_28 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
            const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
            __VLS_31.slots.default;
            const __VLS_32 = {}.Plus;
            /** @type {[typeof __VLS_components.Plus, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
            const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
            var __VLS_31;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "field-name" },
            });
            (__VLS_ctx.cleanFieldLabel(col));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "field-meta" },
            });
            if (col.agg_role === 'measure') {
                const __VLS_36 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                    size: "small",
                    type: "success",
                    effect: "plain",
                }));
                const __VLS_38 = __VLS_37({
                    size: "small",
                    type: "success",
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_37));
                __VLS_39.slots.default;
                var __VLS_39;
            }
            else {
                const __VLS_40 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
                    size: "small",
                    effect: "plain",
                }));
                const __VLS_42 = __VLS_41({
                    size: "small",
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_41));
                __VLS_43.slots.default;
                var __VLS_43;
            }
            if (col.is_sensitive) {
                const __VLS_44 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                }));
                const __VLS_46 = __VLS_45({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_45));
                __VLS_47.slots.default;
                var __VLS_47;
            }
            if (col.is_pk_part) {
                const __VLS_48 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                    size: "small",
                    type: "primary",
                    effect: "plain",
                }));
                const __VLS_50 = __VLS_49({
                    size: "small",
                    type: "primary",
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_49));
                __VLS_51.slots.default;
                var __VLS_51;
            }
            if (col.code.startsWith('calc.') && __VLS_ctx.canCreateField) {
                const __VLS_52 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    link: true,
                }));
                const __VLS_54 = __VLS_53({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    link: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_53));
                let __VLS_56;
                let __VLS_57;
                let __VLS_58;
                const __VLS_59 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.availableColumnGroups.length))
                            return;
                        if (!(col.code.startsWith('calc.') && __VLS_ctx.canCreateField))
                            return;
                        __VLS_ctx.emit('editField', col);
                    }
                };
                __VLS_55.slots.default;
                const __VLS_60 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
                const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
                __VLS_63.slots.default;
                const __VLS_64 = {}.Edit;
                /** @type {[typeof __VLS_components.Edit, ]} */ ;
                // @ts-ignore
                const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
                const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
                var __VLS_63;
                var __VLS_55;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "field-code" },
            });
            (__VLS_ctx.cleanFieldCode(col));
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-grid" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "config-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "config-section selected-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "section-subtitle" },
});
(__VLS_ctx.selectedCols.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "section-actions" },
});
const __VLS_68 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    size: "small",
    effect: "plain",
}));
const __VLS_70 = __VLS_69({
    size: "small",
    effect: "plain",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
(__VLS_ctx.aggregate ? '汇总表' : '明细表');
var __VLS_71;
const __VLS_72 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onClick': {} },
    size: "small",
    plain: true,
}));
const __VLS_74 = __VLS_73({
    ...{ 'onClick': {} },
    size: "small",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onClick: (...[$event]) => {
        __VLS_ctx.openAdvanced('rules');
    }
};
__VLS_75.slots.default;
var __VLS_75;
if (__VLS_ctx.$slots.reshape) {
    const __VLS_80 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ 'onClick': {} },
        size: "small",
        plain: true,
    }));
    const __VLS_82 = __VLS_81({
        ...{ 'onClick': {} },
        size: "small",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    let __VLS_84;
    let __VLS_85;
    let __VLS_86;
    const __VLS_87 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.$slots.reshape))
                return;
            __VLS_ctx.openAdvanced('reshape');
        }
    };
    __VLS_83.slots.default;
    var __VLS_83;
}
if (__VLS_ctx.$slots.lookup) {
    const __VLS_88 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onClick': {} },
        size: "small",
        type: (__VLS_ctx.lookupEnabled ? 'primary' : 'default'),
        plain: (!__VLS_ctx.lookupEnabled),
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onClick': {} },
        size: "small",
        type: (__VLS_ctx.lookupEnabled ? 'primary' : 'default'),
        plain: (!__VLS_ctx.lookupEnabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.$slots.lookup))
                return;
            __VLS_ctx.openAdvanced('lookup');
        }
    };
    __VLS_91.slots.default;
    var __VLS_91;
}
if (__VLS_ctx.$slots.push) {
    const __VLS_96 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        ...{ 'onClick': {} },
        size: "small",
        type: (__VLS_ctx.pushEnabled ? 'primary' : 'default'),
        plain: (!__VLS_ctx.pushEnabled),
    }));
    const __VLS_98 = __VLS_97({
        ...{ 'onClick': {} },
        size: "small",
        type: (__VLS_ctx.pushEnabled ? 'primary' : 'default'),
        plain: (!__VLS_ctx.pushEnabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    let __VLS_100;
    let __VLS_101;
    let __VLS_102;
    const __VLS_103 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.$slots.push))
                return;
            __VLS_ctx.openAdvanced('push');
        }
    };
    __VLS_99.slots.default;
    if (__VLS_ctx.pushTargetCount) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "menu-command-badge" },
        });
        (__VLS_ctx.pushTargetCount);
    }
    var __VLS_99;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-rows" },
});
for (const [group] of __VLS_getVForSourceType((__VLS_ctx.selectedFieldGroups))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        key: (group.key),
        ...{ class: "selected-row" },
        ...{ class: (`is-${group.key}`) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "row-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (group.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (group.count);
    if (group.columns.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "selected-grid" },
        });
        for (const [col, i] of __VLS_getVForSourceType((group.columns))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onDragstart: (...[$event]) => {
                        if (!(group.columns.length))
                            return;
                        __VLS_ctx.draggingCode = col.key;
                    } },
                ...{ onDragend: (...[$event]) => {
                        if (!(group.columns.length))
                            return;
                        __VLS_ctx.draggingCode = '';
                    } },
                ...{ onDragover: () => { } },
                ...{ onDrop: (...[$event]) => {
                        if (!(group.columns.length))
                            return;
                        __VLS_ctx.reorderColumn(__VLS_ctx.draggingCode, col.key);
                        __VLS_ctx.draggingCode = '';
                    } },
                key: (col._instance_id || col.code),
                ...{ class: "selected-shell" },
                ...{ class: ({ 'is-dragging': __VLS_ctx.draggingCode === col.key, 'is-hidden': __VLS_ctx.colSetting((col.key || col.code)).hidden }) },
                draggable: "true",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "selected-field" },
                ...{ class: ({
                        'is-hidden': __VLS_ctx.colSetting((col.key || col.code)).hidden,
                        'is-dimension': !__VLS_ctx.isMeasureLike(col),
                        'is-measure': __VLS_ctx.isMeasureLike(col),
                    }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "drag-handle" },
                title: "拖动字段调整顺序",
            });
            const __VLS_104 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
            const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
            __VLS_107.slots.default;
            const __VLS_108 = {}.Rank;
            /** @type {[typeof __VLS_components.Rank, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
            const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
            var __VLS_107;
            const __VLS_112 = {}.ElTooltip;
            /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                content: (__VLS_ctx.fieldSource(col)),
                placement: "top",
                showAfter: (350),
            }));
            const __VLS_114 = __VLS_113({
                content: (__VLS_ctx.fieldSource(col)),
                placement: "top",
                showAfter: (350),
            }, ...__VLS_functionalComponentArgsRest(__VLS_113));
            __VLS_115.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ class: "field-label-button" },
                type: "button",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "field-name" },
            });
            (__VLS_ctx.displayLabel(col));
            var __VLS_115;
            if (__VLS_ctx.aggregate) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "field-agg-badge" },
                    ...{ class: ({ 'is-dimension': !__VLS_ctx.isMeasureLike(col) }) },
                });
                (__VLS_ctx.fieldAggregationLabel(col));
            }
            if (__VLS_ctx.aggregate && __VLS_ctx.metricFilterCount(col)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(group.columns.length))
                                return;
                            if (!(__VLS_ctx.aggregate && __VLS_ctx.metricFilterCount(col)))
                                return;
                            __VLS_ctx.openMetricFilterDialog(col);
                        } },
                    ...{ onMousedown: () => { } },
                    ...{ class: "field-filter-badge" },
                    type: "button",
                    title: "编辑指标筛选",
                    draggable: "false",
                });
                const __VLS_116 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
                const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
                __VLS_119.slots.default;
                const __VLS_120 = {}.Filter;
                /** @type {[typeof __VLS_components.Filter, ]} */ ;
                // @ts-ignore
                const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
                const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
                var __VLS_119;
                (__VLS_ctx.metricFilterCount(col));
            }
            if (__VLS_ctx.fieldSortLabel(col.key)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "field-sort-badge" },
                });
                (__VLS_ctx.fieldSortLabel(col.key));
            }
            const __VLS_124 = {}.ElPopover;
            /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                trigger: "click",
                placement: "bottom-start",
                width: (280),
                popperClass: "field-config-popper",
            }));
            const __VLS_126 = __VLS_125({
                trigger: "click",
                placement: "bottom-start",
                width: (280),
                popperClass: "field-config-popper",
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
            __VLS_127.slots.default;
            {
                const { reference: __VLS_thisSlot } = __VLS_127.slots;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onDragstart: () => { } },
                    ...{ onMousedown: () => { } },
                    ...{ class: "field-config-button" },
                    type: "button",
                    title: "字段设置",
                    draggable: "false",
                });
                const __VLS_128 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
                const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
                __VLS_131.slots.default;
                const __VLS_132 = {}.ArrowDown;
                /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
                // @ts-ignore
                const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
                const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
                var __VLS_131;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "field-menu" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-row" },
            });
            if (col.code.startsWith('calc.') && __VLS_ctx.canCreateField) {
                const __VLS_136 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    plain: true,
                }));
                const __VLS_138 = __VLS_137({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    plain: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_137));
                let __VLS_140;
                let __VLS_141;
                let __VLS_142;
                const __VLS_143 = {
                    onClick: (...[$event]) => {
                        if (!(group.columns.length))
                            return;
                        if (!(col.code.startsWith('calc.') && __VLS_ctx.canCreateField))
                            return;
                        __VLS_ctx.emit('editField', col);
                    }
                };
                __VLS_139.slots.default;
                const __VLS_144 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
                const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
                __VLS_147.slots.default;
                const __VLS_148 = {}.Edit;
                /** @type {[typeof __VLS_components.Edit, ]} */ ;
                // @ts-ignore
                const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
                const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
                var __VLS_147;
                var __VLS_139;
            }
            const __VLS_152 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
                plain: true,
            }));
            const __VLS_154 = __VLS_153({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_153));
            let __VLS_156;
            let __VLS_157;
            let __VLS_158;
            const __VLS_159 = {
                onClick: (...[$event]) => {
                    if (!(group.columns.length))
                        return;
                    __VLS_ctx.removeColumn(col.key);
                }
            };
            __VLS_155.slots.default;
            const __VLS_160 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({}));
            const __VLS_162 = __VLS_161({}, ...__VLS_functionalComponentArgsRest(__VLS_161));
            __VLS_163.slots.default;
            const __VLS_164 = {}.Close;
            /** @type {[typeof __VLS_components.Close, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({}));
            const __VLS_166 = __VLS_165({}, ...__VLS_functionalComponentArgsRest(__VLS_165));
            var __VLS_163;
            var __VLS_155;
            if (__VLS_ctx.sorts) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-title" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sort-actions" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(group.columns.length))
                                return;
                            if (!(__VLS_ctx.sorts))
                                return;
                            __VLS_ctx.setFieldSort(col.key, 'asc');
                        } },
                    ...{ class: "agg-option" },
                    ...{ class: ({ 'is-active': __VLS_ctx.fieldSort(col.key)?.order === 'asc' }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(group.columns.length))
                                return;
                            if (!(__VLS_ctx.sorts))
                                return;
                            __VLS_ctx.setFieldSort(col.key, 'desc');
                        } },
                    ...{ class: "agg-option" },
                    ...{ class: ({ 'is-active': __VLS_ctx.fieldSort(col.key)?.order === 'desc' }) },
                });
                if (__VLS_ctx.fieldSort(col.key)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(group.columns.length))
                                    return;
                                if (!(__VLS_ctx.sorts))
                                    return;
                                if (!(__VLS_ctx.fieldSort(col.key)))
                                    return;
                                __VLS_ctx.clearFieldSort(col.key);
                            } },
                        ...{ class: "menu-link-command" },
                    });
                }
            }
            if (__VLS_ctx.aggregate) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-title" },
                });
                if (col.agg_role === 'measure') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "agg-options" },
                    });
                    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.AGG_FUNCS))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(group.columns.length))
                                        return;
                                    if (!(__VLS_ctx.aggregate))
                                        return;
                                    if (!(col.agg_role === 'measure'))
                                        return;
                                    __VLS_ctx.setAggregation(col.key, item.value);
                                } },
                            key: (item.value),
                            ...{ class: "agg-option" },
                            ...{ class: ({ 'is-active': __VLS_ctx.effectiveAggregation(col) === item.value }) },
                        });
                        (item.label);
                    }
                    if (__VLS_ctx.colSetting((col.key || col.code)).aggregation) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(group.columns.length))
                                        return;
                                    if (!(__VLS_ctx.aggregate))
                                        return;
                                    if (!(col.agg_role === 'measure'))
                                        return;
                                    if (!(__VLS_ctx.colSetting((col.key || col.code)).aggregation))
                                        return;
                                    __VLS_ctx.resetAggregation(col.key);
                                } },
                            ...{ class: "menu-link-command" },
                        });
                        (__VLS_ctx.reportAggLabel(__VLS_ctx.defaultAggregationValue()));
                    }
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "agg-options" },
                    });
                    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.countAggOptions()))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(group.columns.length))
                                        return;
                                    if (!(__VLS_ctx.aggregate))
                                        return;
                                    if (!!(col.agg_role === 'measure'))
                                        return;
                                    __VLS_ctx.setAggregation(col.key, item.value);
                                } },
                            key: (item.value),
                            ...{ class: "agg-option" },
                            ...{ class: ({ 'is-active': __VLS_ctx.colSetting((col.key || col.code)).aggregation === item.value }) },
                        });
                        (item.label);
                    }
                    if (__VLS_ctx.colSetting((col.key || col.code)).aggregation) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(group.columns.length))
                                        return;
                                    if (!(__VLS_ctx.aggregate))
                                        return;
                                    if (!!(col.agg_role === 'measure'))
                                        return;
                                    if (!(__VLS_ctx.colSetting((col.key || col.code)).aggregation))
                                        return;
                                    __VLS_ctx.resetAggregation(col.key);
                                } },
                            ...{ class: "menu-link-command" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "menu-note" },
                    });
                }
            }
            if (__VLS_ctx.aggregate && __VLS_ctx.isMeasureLike(col)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(group.columns.length))
                                return;
                            if (!(__VLS_ctx.aggregate && __VLS_ctx.isMeasureLike(col)))
                                return;
                            __VLS_ctx.openMetricFilterDialog(col);
                        } },
                    ...{ class: "menu-command" },
                });
                if (__VLS_ctx.metricFilterSummary(col)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "menu-command-badge" },
                    });
                    (__VLS_ctx.metricFilterCount(col));
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-note" },
                });
            }
            if (__VLS_ctx.isMeasureLike(col)) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(group.columns.length))
                                return;
                            if (!(__VLS_ctx.isMeasureLike(col)))
                                return;
                            __VLS_ctx.openDisplayFormatDialog(col);
                        } },
                    ...{ class: "menu-command" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-row" },
            });
            const __VLS_168 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.colSetting((col.key || col.code)).display_name || ''),
                placeholder: (__VLS_ctx.cleanFieldLabel(col)),
                size: "small",
                ...{ style: {} },
            }));
            const __VLS_170 = __VLS_169({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.colSetting((col.key || col.code)).display_name || ''),
                placeholder: (__VLS_ctx.cleanFieldLabel(col)),
                size: "small",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_169));
            let __VLS_172;
            let __VLS_173;
            let __VLS_174;
            const __VLS_175 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.updateSetting(col.key, { display_name: v }))
            };
            var __VLS_171;
            const __VLS_176 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                ...{ 'onClick': {} },
                size: "small",
                link: true,
            }));
            const __VLS_178 = __VLS_177({
                ...{ 'onClick': {} },
                size: "small",
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_177));
            let __VLS_180;
            let __VLS_181;
            let __VLS_182;
            const __VLS_183 = {
                onClick: (...[$event]) => {
                    if (!(group.columns.length))
                        return;
                    __VLS_ctx.resetDisplayName(col.key);
                }
            };
            __VLS_179.slots.default;
            var __VLS_179;
            if (__VLS_ctx.isDataset && col.agg_role === 'measure') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-block" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "menu-title" },
                });
                const __VLS_184 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.colSetting((col.key || col.code)).split_mode || 'default'),
                    size: "small",
                    ...{ style: {} },
                }));
                const __VLS_186 = __VLS_185({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.colSetting((col.key || col.code)).split_mode || 'default'),
                    size: "small",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_185));
                let __VLS_188;
                let __VLS_189;
                let __VLS_190;
                const __VLS_191 = {
                    'onUpdate:modelValue': ((v) => __VLS_ctx.setSplitMode(col.key, v))
                };
                __VLS_187.slots.default;
                const __VLS_192 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                    label: "使用默认规则",
                    value: "default",
                }));
                const __VLS_194 = __VLS_193({
                    label: "使用默认规则",
                    value: "default",
                }, ...__VLS_functionalComponentArgsRest(__VLS_193));
                const __VLS_196 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                    label: "不拆分",
                    value: "none",
                }));
                const __VLS_198 = __VLS_197({
                    label: "不拆分",
                    value: "none",
                }, ...__VLS_functionalComponentArgsRest(__VLS_197));
                const __VLS_200 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                    label: "自定义系数",
                    value: "custom",
                }));
                const __VLS_202 = __VLS_201({
                    label: "自定义系数",
                    value: "custom",
                }, ...__VLS_functionalComponentArgsRest(__VLS_201));
                var __VLS_187;
                if (__VLS_ctx.colSetting((col.key || col.code)).split_mode === 'custom') {
                    for (const [fac, i] of __VLS_getVForSourceType((__VLS_ctx.splitFactors(col.key)))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (i),
                            ...{ style: {} },
                        });
                        if (i > 0) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                                ...{ style: {} },
                            });
                        }
                        const __VLS_204 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (fac),
                            size: "small",
                            filterable: true,
                            clearable: true,
                            placeholder: "选择系数字段",
                            ...{ style: {} },
                        }));
                        const __VLS_206 = __VLS_205({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (fac),
                            size: "small",
                            filterable: true,
                            clearable: true,
                            placeholder: "选择系数字段",
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
                        let __VLS_208;
                        let __VLS_209;
                        let __VLS_210;
                        const __VLS_211 = {
                            'onUpdate:modelValue': ((v) => __VLS_ctx.setSplitFactor(col.key, i, v))
                        };
                        __VLS_207.slots.default;
                        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.numericSelectedCols))) {
                            const __VLS_212 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
                                key: (item.key),
                                label: (__VLS_ctx.displayLabel(item)),
                                value: (item.key),
                            }));
                            const __VLS_214 = __VLS_213({
                                key: (item.key),
                                label: (__VLS_ctx.displayLabel(item)),
                                value: (item.key),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_213));
                        }
                        var __VLS_207;
                        const __VLS_216 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
                            ...{ 'onClick': {} },
                            link: true,
                            type: "danger",
                            size: "small",
                        }));
                        const __VLS_218 = __VLS_217({
                            ...{ 'onClick': {} },
                            link: true,
                            type: "danger",
                            size: "small",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
                        let __VLS_220;
                        let __VLS_221;
                        let __VLS_222;
                        const __VLS_223 = {
                            onClick: (...[$event]) => {
                                if (!(group.columns.length))
                                    return;
                                if (!(__VLS_ctx.isDataset && col.agg_role === 'measure'))
                                    return;
                                if (!(__VLS_ctx.colSetting((col.key || col.code)).split_mode === 'custom'))
                                    return;
                                __VLS_ctx.removeSplitFactor(col.key, i);
                            }
                        };
                        __VLS_219.slots.default;
                        const __VLS_224 = {}.ElIcon;
                        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                        // @ts-ignore
                        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({}));
                        const __VLS_226 = __VLS_225({}, ...__VLS_functionalComponentArgsRest(__VLS_225));
                        __VLS_227.slots.default;
                        const __VLS_228 = {}.Delete;
                        /** @type {[typeof __VLS_components.Delete, ]} */ ;
                        // @ts-ignore
                        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({}));
                        const __VLS_230 = __VLS_229({}, ...__VLS_functionalComponentArgsRest(__VLS_229));
                        var __VLS_227;
                        var __VLS_219;
                    }
                    const __VLS_232 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                        size: "small",
                        ...{ style: {} },
                    }));
                    const __VLS_234 = __VLS_233({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "primary",
                        size: "small",
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
                    let __VLS_236;
                    let __VLS_237;
                    let __VLS_238;
                    const __VLS_239 = {
                        onClick: (...[$event]) => {
                            if (!(group.columns.length))
                                return;
                            if (!(__VLS_ctx.isDataset && col.agg_role === 'measure'))
                                return;
                            if (!(__VLS_ctx.colSetting((col.key || col.code)).split_mode === 'custom'))
                                return;
                            __VLS_ctx.addSplitFactor(col.key);
                        }
                    };
                    __VLS_235.slots.default;
                    const __VLS_240 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                        ...{ style: {} },
                    }));
                    const __VLS_242 = __VLS_241({
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
                    __VLS_243.slots.default;
                    const __VLS_244 = {}.Plus;
                    /** @type {[typeof __VLS_components.Plus, ]} */ ;
                    // @ts-ignore
                    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({}));
                    const __VLS_246 = __VLS_245({}, ...__VLS_functionalComponentArgsRest(__VLS_245));
                    var __VLS_243;
                    var __VLS_235;
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "menu-block" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(group.columns.length))
                            return;
                        __VLS_ctx.toggleHidden(col.key);
                    } },
                ...{ class: "menu-command" },
            });
            const __VLS_248 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({}));
            const __VLS_250 = __VLS_249({}, ...__VLS_functionalComponentArgsRest(__VLS_249));
            __VLS_251.slots.default;
            const __VLS_252 = ((__VLS_ctx.colSetting((col.key || col.code)).hidden ? __VLS_ctx.View : __VLS_ctx.Hide));
            // @ts-ignore
            const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({}));
            const __VLS_254 = __VLS_253({}, ...__VLS_functionalComponentArgsRest(__VLS_253));
            var __VLS_251;
            (__VLS_ctx.colSetting((col.key || col.code)).hidden ? '取消隐藏' : '隐藏');
            var __VLS_127;
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "row-empty" },
        });
        (group.empty);
    }
}
if (__VLS_ctx.$slots.filters) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "config-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "section-title" },
    });
    var __VLS_256 = {};
}
const __VLS_258 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
    modelValue: (__VLS_ctx.displayFormatOpen),
    title: (`${__VLS_ctx.displayFormatCol ? __VLS_ctx.displayLabel(__VLS_ctx.displayFormatCol) : '指标'} · 显示格式`),
    width: "560px",
    destroyOnClose: true,
}));
const __VLS_260 = __VLS_259({
    modelValue: (__VLS_ctx.displayFormatOpen),
    title: (`${__VLS_ctx.displayFormatCol ? __VLS_ctx.displayLabel(__VLS_ctx.displayFormatCol) : '指标'} · 显示格式`),
    width: "560px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_259));
__VLS_261.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "display-format-dialog" },
});
const __VLS_262 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.displayFormatDraft.type),
}));
const __VLS_264 = __VLS_263({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.displayFormatDraft.type),
}, ...__VLS_functionalComponentArgsRest(__VLS_263));
let __VLS_266;
let __VLS_267;
let __VLS_268;
const __VLS_269 = {
    'onUpdate:modelValue': (__VLS_ctx.setDisplayFormatType)
};
__VLS_265.slots.default;
const __VLS_270 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
    value: "default",
}));
const __VLS_272 = __VLS_271({
    value: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_271));
__VLS_273.slots.default;
var __VLS_273;
const __VLS_274 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({
    value: "number",
}));
const __VLS_276 = __VLS_275({
    value: "number",
}, ...__VLS_functionalComponentArgsRest(__VLS_275));
__VLS_277.slots.default;
var __VLS_277;
const __VLS_278 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
    value: "percent",
}));
const __VLS_280 = __VLS_279({
    value: "percent",
}, ...__VLS_functionalComponentArgsRest(__VLS_279));
__VLS_281.slots.default;
var __VLS_281;
var __VLS_265;
if (__VLS_ctx.displayFormatDraft.type === 'default') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "display-format-default" },
    });
}
else {
    const __VLS_282 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
        labelWidth: "92px",
        ...{ class: "display-format-form" },
    }));
    const __VLS_284 = __VLS_283({
        labelWidth: "92px",
        ...{ class: "display-format-form" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_283));
    __VLS_285.slots.default;
    const __VLS_286 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
        label: "取整规则",
    }));
    const __VLS_288 = __VLS_287({
        label: "取整规则",
    }, ...__VLS_functionalComponentArgsRest(__VLS_287));
    __VLS_289.slots.default;
    const __VLS_290 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
        modelValue: (__VLS_ctx.displayFormatDraft.rounding_rule),
        ...{ style: {} },
    }));
    const __VLS_292 = __VLS_291({
        modelValue: (__VLS_ctx.displayFormatDraft.rounding_rule),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_291));
    __VLS_293.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.ROUNDING_OPTIONS))) {
        const __VLS_294 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_296 = __VLS_295({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_295));
    }
    var __VLS_293;
    var __VLS_289;
    const __VLS_298 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
        label: "保留小数",
    }));
    const __VLS_300 = __VLS_299({
        label: "保留小数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_299));
    __VLS_301.slots.default;
    const __VLS_302 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
        modelValue: (__VLS_ctx.displayFormatDraft.precision),
        min: (0),
        max: (6),
        step: (1),
        controlsPosition: "right",
    }));
    const __VLS_304 = __VLS_303({
        modelValue: (__VLS_ctx.displayFormatDraft.precision),
        min: (0),
        max: (6),
        step: (1),
        controlsPosition: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_303));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "format-unit-text" },
    });
    var __VLS_301;
    if (__VLS_ctx.displayFormatDraft.type === 'number') {
        const __VLS_306 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
            label: "数据单位",
        }));
        const __VLS_308 = __VLS_307({
            label: "数据单位",
        }, ...__VLS_functionalComponentArgsRest(__VLS_307));
        __VLS_309.slots.default;
        const __VLS_310 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
            modelValue: (__VLS_ctx.displayFormatDraft.unit),
            ...{ style: {} },
        }));
        const __VLS_312 = __VLS_311({
            modelValue: (__VLS_ctx.displayFormatDraft.unit),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_311));
        __VLS_313.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.DISPLAY_UNIT_OPTIONS))) {
            const __VLS_314 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
                key: (item.value),
                label: (item.label),
                value: (item.value),
            }));
            const __VLS_316 = __VLS_315({
                key: (item.value),
                label: (item.label),
                value: (item.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_315));
        }
        var __VLS_313;
        var __VLS_309;
        const __VLS_318 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
            label: "显示方式",
        }));
        const __VLS_320 = __VLS_319({
            label: "显示方式",
        }, ...__VLS_functionalComponentArgsRest(__VLS_319));
        __VLS_321.slots.default;
        const __VLS_322 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
            modelValue: (__VLS_ctx.displayFormatDraft.thousands_separator),
        }));
        const __VLS_324 = __VLS_323({
            modelValue: (__VLS_ctx.displayFormatDraft.thousands_separator),
        }, ...__VLS_functionalComponentArgsRest(__VLS_323));
        __VLS_325.slots.default;
        var __VLS_325;
        var __VLS_321;
    }
    var __VLS_285;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "display-format-preview" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.displayFormatPreview);
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
(__VLS_ctx.displayFormatSummary);
{
    const { footer: __VLS_thisSlot } = __VLS_261.slots;
    const __VLS_326 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
        ...{ 'onClick': {} },
    }));
    const __VLS_328 = __VLS_327({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    let __VLS_330;
    let __VLS_331;
    let __VLS_332;
    const __VLS_333 = {
        onClick: (...[$event]) => {
            __VLS_ctx.displayFormatOpen = false;
        }
    };
    __VLS_329.slots.default;
    var __VLS_329;
    const __VLS_334 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_336 = __VLS_335({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_335));
    let __VLS_338;
    let __VLS_339;
    let __VLS_340;
    const __VLS_341 = {
        onClick: (__VLS_ctx.confirmDisplayFormatDialog)
    };
    __VLS_337.slots.default;
    var __VLS_337;
}
var __VLS_261;
const __VLS_342 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
    modelValue: (__VLS_ctx.metricFilterOpen),
    title: (`${__VLS_ctx.metricFilterCol ? __VLS_ctx.displayLabel(__VLS_ctx.metricFilterCol) : '指标'} · 指标筛选`),
    width: "760px",
    ...{ class: "metric-filter-dialog" },
    destroyOnClose: true,
}));
const __VLS_344 = __VLS_343({
    modelValue: (__VLS_ctx.metricFilterOpen),
    title: (`${__VLS_ctx.metricFilterCol ? __VLS_ctx.displayLabel(__VLS_ctx.metricFilterCol) : '指标'} · 指标筛选`),
    width: "760px",
    ...{ class: "metric-filter-dialog" },
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_343));
__VLS_345.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-filter-dialog-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "metric-filter-explain" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
/** @type {[typeof ReportFilterList, ]} */ ;
// @ts-ignore
const __VLS_346 = __VLS_asFunctionalComponent(ReportFilterList, new ReportFilterList({
    ...{ 'onUpdate:filters': {} },
    ...{ 'onUpdate:filterLogic': {} },
    filters: (__VLS_ctx.metricFilterDraft),
    filterLogic: (__VLS_ctx.metricFilterLogicDraft),
    allColumns: (__VLS_ctx.allColumns),
    currentDatasetTables: (__VLS_ctx.currentDatasetTables),
    showViewControls: (false),
    compact: true,
}));
const __VLS_347 = __VLS_346({
    ...{ 'onUpdate:filters': {} },
    ...{ 'onUpdate:filterLogic': {} },
    filters: (__VLS_ctx.metricFilterDraft),
    filterLogic: (__VLS_ctx.metricFilterLogicDraft),
    allColumns: (__VLS_ctx.allColumns),
    currentDatasetTables: (__VLS_ctx.currentDatasetTables),
    showViewControls: (false),
    compact: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_346));
let __VLS_349;
let __VLS_350;
let __VLS_351;
const __VLS_352 = {
    'onUpdate:filters': (__VLS_ctx.setMetricFilterDraft)
};
const __VLS_353 = {
    'onUpdate:filterLogic': (__VLS_ctx.setMetricFilterLogicDraft)
};
var __VLS_348;
{
    const { footer: __VLS_thisSlot } = __VLS_345.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "metric-filter-footer" },
    });
    const __VLS_354 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
        ...{ 'onClick': {} },
        text: true,
        type: "danger",
    }));
    const __VLS_356 = __VLS_355({
        ...{ 'onClick': {} },
        text: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_355));
    let __VLS_358;
    let __VLS_359;
    let __VLS_360;
    const __VLS_361 = {
        onClick: (__VLS_ctx.clearMetricFilterDraft)
    };
    __VLS_357.slots.default;
    var __VLS_357;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "footer-spacer" },
    });
    const __VLS_362 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
        ...{ 'onClick': {} },
    }));
    const __VLS_364 = __VLS_363({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_363));
    let __VLS_366;
    let __VLS_367;
    let __VLS_368;
    const __VLS_369 = {
        onClick: (...[$event]) => {
            __VLS_ctx.metricFilterOpen = false;
        }
    };
    __VLS_365.slots.default;
    var __VLS_365;
    const __VLS_370 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_371 = __VLS_asFunctionalComponent(__VLS_370, new __VLS_370({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_372 = __VLS_371({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_371));
    let __VLS_374;
    let __VLS_375;
    let __VLS_376;
    const __VLS_377 = {
        onClick: (__VLS_ctx.confirmMetricFilterDialog)
    };
    __VLS_373.slots.default;
    var __VLS_373;
}
var __VLS_345;
const __VLS_378 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_379 = __VLS_asFunctionalComponent(__VLS_378, new __VLS_378({
    modelValue: (__VLS_ctx.advancedOpen),
    withHeader: (false),
    size: "min(1120px, 92vw)",
    appendToBody: true,
    ...{ class: "workbench-drawer advanced-config-drawer" },
}));
const __VLS_380 = __VLS_379({
    modelValue: (__VLS_ctx.advancedOpen),
    withHeader: (false),
    size: "min(1120px, 92vw)",
    appendToBody: true,
    ...{ class: "workbench-drawer advanced-config-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_379));
__VLS_381.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "advanced-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "advanced-topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "advanced-tab-buttons" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.advancedTab = 'rules';
        } },
    ...{ class: "advanced-tab-btn" },
    ...{ class: ({ active: __VLS_ctx.advancedTab === 'rules' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.advancedTab = 'reshape';
        } },
    ...{ class: "advanced-tab-btn" },
    ...{ class: ({ active: __VLS_ctx.advancedTab === 'reshape' }) },
});
if (__VLS_ctx.$slots.lookup) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.$slots.lookup))
                    return;
                __VLS_ctx.advancedTab = 'lookup';
            } },
        ...{ class: "advanced-tab-btn" },
        ...{ class: ({ active: __VLS_ctx.advancedTab === 'lookup' }) },
    });
}
if (__VLS_ctx.$slots.push) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.$slots.push))
                    return;
                __VLS_ctx.advancedTab = 'push';
            } },
        ...{ class: "advanced-tab-btn" },
        ...{ class: ({ active: __VLS_ctx.advancedTab === 'push' }) },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "advanced-meta-inline" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.advancedMeta.title);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.advancedMeta.desc);
const __VLS_382 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_383 = __VLS_asFunctionalComponent(__VLS_382, new __VLS_382({
    ...{ 'onClick': {} },
    ...{ class: "advanced-close" },
    text: true,
    circle: true,
    icon: (__VLS_ctx.Close),
}));
const __VLS_384 = __VLS_383({
    ...{ 'onClick': {} },
    ...{ class: "advanced-close" },
    text: true,
    circle: true,
    icon: (__VLS_ctx.Close),
}, ...__VLS_functionalComponentArgsRest(__VLS_383));
let __VLS_386;
let __VLS_387;
let __VLS_388;
const __VLS_389 = {
    onClick: (...[$event]) => {
        __VLS_ctx.advancedOpen = false;
    }
};
var __VLS_385;
const __VLS_390 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_391 = __VLS_asFunctionalComponent(__VLS_390, new __VLS_390({
    modelValue: (__VLS_ctx.advancedTab),
    ...{ class: "advanced-tabs advanced-tabs-content-only" },
}));
const __VLS_392 = __VLS_391({
    modelValue: (__VLS_ctx.advancedTab),
    ...{ class: "advanced-tabs advanced-tabs-content-only" },
}, ...__VLS_functionalComponentArgsRest(__VLS_391));
__VLS_393.slots.default;
const __VLS_394 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_395 = __VLS_asFunctionalComponent(__VLS_394, new __VLS_394({
    label: "统计规则",
    name: "rules",
}));
const __VLS_396 = __VLS_395({
    label: "统计规则",
    name: "rules",
}, ...__VLS_functionalComponentArgsRest(__VLS_395));
__VLS_397.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rules-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rules-banner" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-item" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "option-label" },
});
const __VLS_398 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_399 = __VLS_asFunctionalComponent(__VLS_398, new __VLS_398({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.aggregate),
    size: "small",
}));
const __VLS_400 = __VLS_399({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.aggregate),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_399));
let __VLS_402;
let __VLS_403;
let __VLS_404;
const __VLS_405 = {
    onChange: (__VLS_ctx.setOutputMode)
};
__VLS_401.slots.default;
const __VLS_406 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_407 = __VLS_asFunctionalComponent(__VLS_406, new __VLS_406({
    value: (false),
}));
const __VLS_408 = __VLS_407({
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_407));
__VLS_409.slots.default;
var __VLS_409;
const __VLS_410 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_411 = __VLS_asFunctionalComponent(__VLS_410, new __VLS_410({
    value: (true),
}));
const __VLS_412 = __VLS_411({
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_411));
__VLS_413.slots.default;
var __VLS_413;
var __VLS_401;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-item" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "option-label" },
});
const __VLS_414 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_415 = __VLS_asFunctionalComponent(__VLS_414, new __VLS_414({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.defaultAggregationValue()),
    disabled: (!__VLS_ctx.aggregate),
    size: "small",
    ...{ style: {} },
}));
const __VLS_416 = __VLS_415({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.defaultAggregationValue()),
    disabled: (!__VLS_ctx.aggregate),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_415));
let __VLS_418;
let __VLS_419;
let __VLS_420;
const __VLS_421 = {
    'onUpdate:modelValue': (__VLS_ctx.setDefaultAggregation)
};
__VLS_417.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.AGG_FUNCS))) {
    const __VLS_422 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_423 = __VLS_asFunctionalComponent(__VLS_422, new __VLS_422({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_424 = __VLS_423({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_423));
}
var __VLS_417;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
if (__VLS_ctx.isDataset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-item rule-item-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "option-label" },
    });
    const __VLS_426 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_427 = __VLS_asFunctionalComponent(__VLS_426, new __VLS_426({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.defaultSplitRule.enabled),
        activeText: "启用",
        inactiveText: "关闭",
    }));
    const __VLS_428 = __VLS_427({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.defaultSplitRule.enabled),
        activeText: "启用",
        inactiveText: "关闭",
    }, ...__VLS_functionalComponentArgsRest(__VLS_427));
    let __VLS_430;
    let __VLS_431;
    let __VLS_432;
    const __VLS_433 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.emit('update:defaultSplitRule', { ...__VLS_ctx.defaultSplitRule, enabled: v }))
    };
    var __VLS_429;
    for (const [fac, i] of __VLS_getVForSourceType((__VLS_ctx.defaultFactors()))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (i),
            ...{ style: {} },
        });
        if (i > 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        const __VLS_434 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_435 = __VLS_asFunctionalComponent(__VLS_434, new __VLS_434({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (fac),
            disabled: (!__VLS_ctx.defaultSplitRule.enabled),
            filterable: true,
            clearable: true,
            placeholder: "选择系数字段",
            ...{ style: {} },
        }));
        const __VLS_436 = __VLS_435({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (fac),
            disabled: (!__VLS_ctx.defaultSplitRule.enabled),
            filterable: true,
            clearable: true,
            placeholder: "选择系数字段",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_435));
        let __VLS_438;
        let __VLS_439;
        let __VLS_440;
        const __VLS_441 = {
            'onUpdate:modelValue': ((v) => __VLS_ctx.setDefaultFactor(i, v))
        };
        __VLS_437.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.numericSelectedCols))) {
            const __VLS_442 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_443 = __VLS_asFunctionalComponent(__VLS_442, new __VLS_442({
                key: (item.key),
                label: (__VLS_ctx.displayLabel(item)),
                value: (item.key),
            }));
            const __VLS_444 = __VLS_443({
                key: (item.key),
                label: (__VLS_ctx.displayLabel(item)),
                value: (item.key),
            }, ...__VLS_functionalComponentArgsRest(__VLS_443));
        }
        var __VLS_437;
        const __VLS_446 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_447 = __VLS_asFunctionalComponent(__VLS_446, new __VLS_446({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            disabled: (!__VLS_ctx.defaultSplitRule.enabled),
        }));
        const __VLS_448 = __VLS_447({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            disabled: (!__VLS_ctx.defaultSplitRule.enabled),
        }, ...__VLS_functionalComponentArgsRest(__VLS_447));
        let __VLS_450;
        let __VLS_451;
        let __VLS_452;
        const __VLS_453 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.isDataset))
                    return;
                __VLS_ctx.removeDefaultFactor(i);
            }
        };
        __VLS_449.slots.default;
        const __VLS_454 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_455 = __VLS_asFunctionalComponent(__VLS_454, new __VLS_454({}));
        const __VLS_456 = __VLS_455({}, ...__VLS_functionalComponentArgsRest(__VLS_455));
        __VLS_457.slots.default;
        const __VLS_458 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_459 = __VLS_asFunctionalComponent(__VLS_458, new __VLS_458({}));
        const __VLS_460 = __VLS_459({}, ...__VLS_functionalComponentArgsRest(__VLS_459));
        var __VLS_457;
        var __VLS_449;
    }
    const __VLS_462 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_463 = __VLS_asFunctionalComponent(__VLS_462, new __VLS_462({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        disabled: (!__VLS_ctx.defaultSplitRule.enabled),
        ...{ style: {} },
    }));
    const __VLS_464 = __VLS_463({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        disabled: (!__VLS_ctx.defaultSplitRule.enabled),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_463));
    let __VLS_466;
    let __VLS_467;
    let __VLS_468;
    const __VLS_469 = {
        onClick: (__VLS_ctx.addDefaultFactor)
    };
    __VLS_465.slots.default;
    const __VLS_470 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_471 = __VLS_asFunctionalComponent(__VLS_470, new __VLS_470({
        ...{ style: {} },
    }));
    const __VLS_472 = __VLS_471({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_471));
    __VLS_473.slots.default;
    const __VLS_474 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_475 = __VLS_asFunctionalComponent(__VLS_474, new __VLS_474({}));
    const __VLS_476 = __VLS_475({}, ...__VLS_functionalComponentArgsRest(__VLS_475));
    var __VLS_473;
    var __VLS_465;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
if (__VLS_ctx.isDataset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-item rule-item-wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "option-label" },
    });
    const __VLS_478 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_479 = __VLS_asFunctionalComponent(__VLS_478, new __VLS_478({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.roundingGroupBy),
        disabled: (!__VLS_ctx.aggregate),
        multiple: true,
        filterable: true,
        clearable: true,
        placeholder: (__VLS_ctx.aggregate ? '选择一个或多个分组维度' : '汇总表可选'),
        ...{ style: {} },
    }));
    const __VLS_480 = __VLS_479({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.roundingGroupBy),
        disabled: (!__VLS_ctx.aggregate),
        multiple: true,
        filterable: true,
        clearable: true,
        placeholder: (__VLS_ctx.aggregate ? '选择一个或多个分组维度' : '汇总表可选'),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_479));
    let __VLS_482;
    let __VLS_483;
    let __VLS_484;
    const __VLS_485 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.emit('update:roundingGroupBy', v))
    };
    __VLS_481.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.selectedDimensions))) {
        const __VLS_486 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_487 = __VLS_asFunctionalComponent(__VLS_486, new __VLS_486({
            key: (item.key),
            label: (__VLS_ctx.displayLabel(item)),
            value: (item.key),
        }));
        const __VLS_488 = __VLS_487({
            key: (item.key),
            label: (__VLS_ctx.displayLabel(item)),
            value: (item.key),
        }, ...__VLS_functionalComponentArgsRest(__VLS_487));
    }
    var __VLS_481;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
var __VLS_397;
if (__VLS_ctx.$slots.reshape) {
    const __VLS_490 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_491 = __VLS_asFunctionalComponent(__VLS_490, new __VLS_490({
        label: "数据重塑",
        name: "reshape",
    }));
    const __VLS_492 = __VLS_491({
        label: "数据重塑",
        name: "reshape",
    }, ...__VLS_functionalComponentArgsRest(__VLS_491));
    __VLS_493.slots.default;
    var __VLS_494 = {};
    var __VLS_493;
}
if (__VLS_ctx.$slots.lookup) {
    const __VLS_496 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
        label: "名单回查",
        name: "lookup",
    }));
    const __VLS_498 = __VLS_497({
        label: "名单回查",
        name: "lookup",
    }, ...__VLS_functionalComponentArgsRest(__VLS_497));
    __VLS_499.slots.default;
    var __VLS_500 = {};
    var __VLS_499;
}
if (__VLS_ctx.$slots.push) {
    const __VLS_502 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_503 = __VLS_asFunctionalComponent(__VLS_502, new __VLS_502({
        label: "推送配置",
        name: "push",
    }));
    const __VLS_504 = __VLS_503({
        label: "推送配置",
        name: "push",
    }, ...__VLS_functionalComponentArgsRest(__VLS_503));
    __VLS_505.slots.default;
    var __VLS_506 = {};
    var __VLS_505;
}
var __VLS_393;
var __VLS_381;
/** @type {__VLS_StyleScopedClasses['field-workbench']} */ ;
/** @type {__VLS_StyleScopedClasses['available-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['available-head-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['source-groups']} */ ;
/** @type {__VLS_StyleScopedClasses['source-group']} */ ;
/** @type {__VLS_StyleScopedClasses['source-head']} */ ;
/** @type {__VLS_StyleScopedClasses['source-title']} */ ;
/** @type {__VLS_StyleScopedClasses['available-list']} */ ;
/** @type {__VLS_StyleScopedClasses['available-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-main']} */ ;
/** @type {__VLS_StyleScopedClasses['field-name']} */ ;
/** @type {__VLS_StyleScopedClasses['field-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['field-code']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['section-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-command-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-rows']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-row']} */ ;
/** @type {__VLS_StyleScopedClasses['row-label']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['selected-field']} */ ;
/** @type {__VLS_StyleScopedClasses['drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label-button']} */ ;
/** @type {__VLS_StyleScopedClasses['field-name']} */ ;
/** @type {__VLS_StyleScopedClasses['field-agg-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-filter-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-sort-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-config-button']} */ ;
/** @type {__VLS_StyleScopedClasses['field-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-title']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-row']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-title']} */ ;
/** @type {__VLS_StyleScopedClasses['sort-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-option']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-option']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-link-command']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-title']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-options']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-option']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-link-command']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-options']} */ ;
/** @type {__VLS_StyleScopedClasses['agg-option']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-link-command']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-note']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-command']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-command-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-note']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-command']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-title']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-row']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-title']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-block']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-command']} */ ;
/** @type {__VLS_StyleScopedClasses['row-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['display-format-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['display-format-default']} */ ;
/** @type {__VLS_StyleScopedClasses['display-format-form']} */ ;
/** @type {__VLS_StyleScopedClasses['format-unit-text']} */ ;
/** @type {__VLS_StyleScopedClasses['display-format-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-filter-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-filter-dialog-body']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-filter-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-filter-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['footer-spacer']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-config-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-buttons']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tab-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-meta-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-close']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-tabs-content-only']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['rules-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['option-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['option-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['option-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-item-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['option-label']} */ ;
// @ts-ignore
var __VLS_257 = __VLS_256, __VLS_495 = __VLS_494, __VLS_501 = __VLS_500, __VLS_507 = __VLS_506;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            ArrowRight: ArrowRight,
            Close: Close,
            Delete: Delete,
            Edit: Edit,
            Filter: Filter,
            Hide: Hide,
            Plus: Plus,
            Rank: Rank,
            Search: Search,
            View: View,
            reportAggLabel: reportAggLabel,
            ReportFilterList: ReportFilterList,
            emit: emit,
            AGG_FUNCS: AGG_FUNCS,
            selectedCols: selectedCols,
            availableCols: availableCols,
            availableColumnGroups: availableColumnGroups,
            selectedDimensions: selectedDimensions,
            selectedFieldGroups: selectedFieldGroups,
            numericSelectedCols: numericSelectedCols,
            draggingCode: draggingCode,
            fieldSearch: fieldSearch,
            advancedOpen: advancedOpen,
            advancedTab: advancedTab,
            metricFilterOpen: metricFilterOpen,
            metricFilterCol: metricFilterCol,
            metricFilterDraft: metricFilterDraft,
            metricFilterLogicDraft: metricFilterLogicDraft,
            displayFormatOpen: displayFormatOpen,
            displayFormatCol: displayFormatCol,
            displayFormatDraft: displayFormatDraft,
            DISPLAY_UNIT_OPTIONS: DISPLAY_UNIT_OPTIONS,
            ROUNDING_OPTIONS: ROUNDING_OPTIONS,
            advancedMeta: advancedMeta,
            cleanFieldLabel: cleanFieldLabel,
            cleanFieldCode: cleanFieldCode,
            colSetting: colSetting,
            isMeasureLike: isMeasureLike,
            countAggOptions: countAggOptions,
            updateSetting: updateSetting,
            displayLabel: displayLabel,
            addColumn: addColumn,
            removeColumn: removeColumn,
            reorderColumn: reorderColumn,
            fieldSource: fieldSource,
            defaultAggregationValue: defaultAggregationValue,
            effectiveAggregation: effectiveAggregation,
            fieldAggregationLabel: fieldAggregationLabel,
            setDefaultAggregation: setDefaultAggregation,
            setOutputMode: setOutputMode,
            setAggregation: setAggregation,
            resetAggregation: resetAggregation,
            metricFilterSummary: metricFilterSummary,
            metricFilterCount: metricFilterCount,
            openMetricFilterDialog: openMetricFilterDialog,
            clearMetricFilterDraft: clearMetricFilterDraft,
            setMetricFilterDraft: setMetricFilterDraft,
            setMetricFilterLogicDraft: setMetricFilterLogicDraft,
            confirmMetricFilterDialog: confirmMetricFilterDialog,
            resetDisplayName: resetDisplayName,
            openDisplayFormatDialog: openDisplayFormatDialog,
            setDisplayFormatType: setDisplayFormatType,
            displayFormatPreview: displayFormatPreview,
            displayFormatSummary: displayFormatSummary,
            confirmDisplayFormatDialog: confirmDisplayFormatDialog,
            toggleHidden: toggleHidden,
            setSplitMode: setSplitMode,
            splitFactors: splitFactors,
            setSplitFactor: setSplitFactor,
            addSplitFactor: addSplitFactor,
            removeSplitFactor: removeSplitFactor,
            defaultFactors: defaultFactors,
            setDefaultFactor: setDefaultFactor,
            addDefaultFactor: addDefaultFactor,
            removeDefaultFactor: removeDefaultFactor,
            sourceCollapsed: sourceCollapsed,
            toggleSourceGroup: toggleSourceGroup,
            fieldSort: fieldSort,
            fieldSortLabel: fieldSortLabel,
            setFieldSort: setFieldSort,
            clearFieldSort: clearFieldSort,
            openAdvanced: openAdvanced,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
