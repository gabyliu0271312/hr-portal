/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const statusClass = computed(() => {
    if (props.result.status === 'data_incomplete' || props.result.status === 'partial_success')
        return 'incomplete';
    if (props.result.status === 'significant_diff')
        return 'significant';
    if (props.result.status === 'partial_diff')
        return 'partial';
    return 'consistent';
});
const statusIcon = computed(() => {
    if (props.result.status === 'consistent' || props.result.status === 'success')
        return '✓';
    if (props.result.status === 'significant_diff')
        return '!';
    return '!';
});
const fallbackStatusTitle = computed(() => {
    if (props.result.status === 'data_incomplete' || props.result.status === 'partial_success')
        return '存在数据未完成月份';
    if (props.result.status === 'consistent' || props.result.status === 'success')
        return '对比一致';
    if (props.result.status === 'significant_diff')
        return '发现显著差异';
    return '发现差异';
});
const displayConfig = computed(() => props.result.display || null);
const effectiveTemplate = computed(() => {
    const template = displayConfig.value?.template;
    if (template && template !== 'auto')
        return template;
    return props.result.compare_type;
});
const panelTitle = computed(() => displayConfig.value?.title || fallbackStatusTitle.value);
const panelSubtitle = computed(() => displayConfig.value?.subtitle || '');
const showContext = computed(() => displayConfig.value?.show_context !== false);
const showExplanation = computed(() => displayConfig.value?.show_explanation !== false);
const compareTypeLabel = computed(() => {
    const map = {
        roster: '名单对比',
        field: '字段对比',
        amount: '金额对比',
    };
    return map[props.result.compare_type] || props.result.compare_type;
});
const periodText = computed(() => {
    if (props.result.period_resolution)
        return resolvedRangeText.value;
    const a = props.result.period_a;
    const b = props.result.period_b;
    if (a && b && a !== b)
        return `A：${a}；B：${b}`;
    return a || b || '未指定';
});
const resolvedRangeText = computed(() => {
    const resolution = props.result.period_resolution;
    if (!resolution)
        return '';
    const periods = resolution.resolved_periods;
    return periods.length ? `${periods[0]}–${periods[periods.length - 1]}` : '未解析';
});
function periodStatusLabel(status) {
    return { success: '无差异', partial_diff: '有差异', data_incomplete: '数据未完成', failed: '失败' }[status] || status;
}
function periodStatusClass(status) {
    return { success: 'tag-success', partial_diff: 'tag-diff', data_incomplete: 'tag-incomplete', failed: 'tag-failed' }[status] || 'tag-diff';
}
function periodMessage(item) {
    if (item.status === 'data_incomplete')
        return `无数据来源：${(item.missing_sources || []).map(s => s === 'source_a' ? 'A' : 'B').join('、')}`;
    return item.error_message || '-';
}
const emptyStateText = computed(() => {
    if (props.result.status === 'data_incomplete' || props.result.status === 'partial_success')
        return '存在数据未完成或执行失败月份，请查看按月执行汇总。';
    if (props.result.status === 'failed')
        return '对比执行失败，请查看错误信息或稍后重试。';
    return '未发现差异，A/B 两侧数据一致。';
});
const emptyStateIcon = computed(() => props.result.status === 'consistent' || props.result.status === 'success' ? '✅' : '⚠️');
const hasRosterDiff = computed(() => (props.result.summary.only_in_a_count > 0 || props.result.summary.only_in_b_count > 0));
const readableConclusion = computed(() => {
    if (props.result.conclusion)
        return props.result.conclusion;
    if (props.result.status === 'consistent') {
        return `${props.result.table_a} 与 ${props.result.table_b} 数据一致。`;
    }
    return `${props.result.table_a} 与 ${props.result.table_b} 存在 ${props.result.summary.diff_count} 条差异，请查看下方明细。`;
});
const detailRows = computed(() => props.result.details || []);
const templatePreferredColumns = computed(() => {
    const template = effectiveTemplate.value;
    if (template === 'amount')
        return ['employee_no', 'employee_name', 'amount_a', 'amount_b', 'diff', 'status'];
    if (template === 'field')
        return ['employee_no', 'employee_name', 'field', 'field_a', 'field_b', 'diff_type', 'status'];
    return ['employee_no', 'employee_name', 'diff_type', 'status'];
});
const detailColumns = computed(() => {
    if (detailRows.value.length === 0)
        return [];
    const keySet = new Set();
    detailRows.value.forEach((row) => Object.keys(row || {}).forEach((key) => keySet.add(key)));
    const keys = Array.from(keySet);
    const hidden = new Set(displayConfig.value?.hidden_columns || []);
    const configured = (displayConfig.value?.columns || []).filter((key) => keySet.has(key) && !hidden.has(key));
    const preferred = (configured.length > 0 ? configured : templatePreferredColumns.value)
        .filter((key) => keySet.has(key) && !hidden.has(key));
    return [
        ...preferred,
        ...keys.filter((key) => !preferred.includes(key) && !hidden.has(key)),
    ];
});
const sortedDetails = computed(() => {
    const rows = [...detailRows.value];
    const sortBy = displayConfig.value?.sort_by;
    if (!sortBy || rows.length === 0 || !Object.prototype.hasOwnProperty.call(rows[0], sortBy))
        return rows;
    const direction = displayConfig.value?.sort_order === 'asc' ? 1 : -1;
    return rows.sort((a, b) => compareValues(a[sortBy], b[sortBy]) * direction);
});
function compareValues(a, b) {
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn))
        return an === bn ? 0 : an > bn ? 1 : -1;
    return String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN');
}
function isHighlightedColumn(col) {
    return Boolean(displayConfig.value?.highlight_columns?.includes(col));
}
function isPrimaryMetric(metric) {
    return displayConfig.value?.primary_metric === metric;
}
function fmtNum(n) {
    if (n == null)
        return '0';
    return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function columnLabel(col) {
    const map = {
        employee_no: '员工编号',
        employee_name: '员工姓名',
        name: '姓名',
        diff_type: '差异类型',
        status: '状态',
        amount_a: 'A 金额',
        amount_b: 'B 金额',
        diff: '差额',
        field: '字段',
        field_a: 'A 字段值',
        field_b: 'B 字段值',
    };
    if (map[col])
        return map[col];
    if (col.endsWith('_a'))
        return `${col.slice(0, -2)}（A）`;
    if (col.endsWith('_b'))
        return `${col.slice(0, -2)}（B）`;
    return col;
}
function formatDiffType(value) {
    const text = String(value ?? '');
    if (!text)
        return '-';
    if (isOnlyA({ diff_type: text }))
        return `仅 A 有（B 缺失）`;
    if (isOnlyB({ diff_type: text }))
        return `仅 B 有（A 缺失）`;
    return text;
}
function diffSide(row) {
    const value = String(row.diff_type || row.status || '');
    if (value.includes('only_in_a'))
        return 'a';
    if (value.includes('only_in_b'))
        return 'b';
    if (!value.includes('仅存在于'))
        return null;
    const tableA = String(props.result.table_a || '');
    const tableB = String(props.result.table_b || '');
    if (tableA && value.includes(tableA))
        return 'a';
    if (tableB && value.includes(tableB))
        return 'b';
    if (value.includes('B表'))
        return 'b';
    if (value.includes('A表'))
        return 'a';
    return null;
}
function isOnlyA(row) {
    return diffSide(row) === 'a';
}
function isOnlyB(row) {
    return diffSide(row) === 'b';
}
function isDiff(row) {
    const v = row.diff_type || row.status || '';
    return v.includes('不一致') || v.includes('差异');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['consistent']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['partial']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['significant']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['incomplete']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['range-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['period-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['context-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['details-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['highlighted']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "compare-result-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "conclusion-banner" },
    ...{ class: (__VLS_ctx.statusClass) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "conclusion-icon" },
});
(__VLS_ctx.statusIcon);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "conclusion-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "conclusion-title" },
});
(__VLS_ctx.panelTitle);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "conclusion-text" },
});
(__VLS_ctx.panelSubtitle || __VLS_ctx.readableConclusion);
if (__VLS_ctx.showContext) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "context-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "context-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-value" },
    });
    (__VLS_ctx.compareTypeLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "context-item source-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-value" },
    });
    (__VLS_ctx.result.table_a);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "context-item source-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-value" },
    });
    (__VLS_ctx.result.table_b);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "context-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "context-value" },
    });
    (__VLS_ctx.periodText);
    if (__VLS_ctx.result.duration_ms != null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "context-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "context-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "context-value" },
        });
        (__VLS_ctx.result.duration_ms);
    }
}
if (__VLS_ctx.result.period_resolution) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "range-notice" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
    (__VLS_ctx.resolvedRangeText);
    (__VLS_ctx.result.period_resolution.timezone);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.result.period_resolution.resolved_at);
}
if (__VLS_ctx.result.period_results?.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "period-summary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-table-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "detail-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.result.period_results))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (item.period),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (item.period);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-tag" },
            ...{ class: (__VLS_ctx.periodStatusClass(item.status)) },
        });
        (__VLS_ctx.periodStatusLabel(item.status));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (item.diff_count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (__VLS_ctx.periodMessage(item));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
        (item.duration_ms == null ? '-' : `${item.duration_ms}ms`);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "summary-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-item total" },
    ...{ class: ({ primary: __VLS_ctx.isPrimaryMetric('total_compared') }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.result.summary.total_compared);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-help" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-item matched" },
    ...{ class: ({ primary: __VLS_ctx.isPrimaryMetric('matched_count') }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.result.summary.matched_count);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-help" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-item diff" },
    ...{ class: ({ primary: __VLS_ctx.isPrimaryMetric('diff_count') }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.result.summary.diff_count);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-help" },
});
if (__VLS_ctx.result.compare_type === 'roster') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-item only-a" },
        ...{ class: ({ primary: __VLS_ctx.isPrimaryMetric('only_in_a_count') }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.result.summary.only_in_a_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-help" },
    });
}
if (__VLS_ctx.result.compare_type === 'roster') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-item only-b" },
        ...{ class: ({ primary: __VLS_ctx.isPrimaryMetric('only_in_b_count') }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.result.summary.only_in_b_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-help" },
    });
}
if (__VLS_ctx.result.summary.total_amount_a != null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.fmtNum(__VLS_ctx.result.summary.total_amount_a));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-help" },
    });
    (__VLS_ctx.result.table_a);
}
if (__VLS_ctx.result.summary.total_amount_b != null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-value" },
    });
    (__VLS_ctx.fmtNum(__VLS_ctx.result.summary.total_amount_b));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-help" },
    });
    (__VLS_ctx.result.table_b);
}
if (__VLS_ctx.result.summary.amount_diff != null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "stat-item" },
        ...{ class: ({ 'amount-diff': Math.abs(__VLS_ctx.result.summary.amount_diff) > 0, primary: __VLS_ctx.isPrimaryMetric('amount_diff') }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-value" },
        ...{ style: ({ color: Math.abs(__VLS_ctx.result.summary.amount_diff) > 0 ? 'var(--color-danger)' : '' }) },
    });
    (__VLS_ctx.result.summary.amount_diff > 0 ? '+' : '');
    (__VLS_ctx.fmtNum(__VLS_ctx.result.summary.amount_diff));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "stat-help" },
    });
}
if (__VLS_ctx.showExplanation && __VLS_ctx.result.compare_type === 'roster' && __VLS_ctx.hasRosterDiff) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "diff-explain" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "explain-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "explain-list" },
    });
    if (__VLS_ctx.result.summary.only_in_a_count > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (__VLS_ctx.result.table_a);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (__VLS_ctx.result.table_b);
    }
    if (__VLS_ctx.result.summary.only_in_b_count > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (__VLS_ctx.result.table_b);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        (__VLS_ctx.result.table_a);
    }
}
if (__VLS_ctx.result.details && __VLS_ctx.result.details.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "details-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "details-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.sortedDetails.length);
    (__VLS_ctx.result.summary.diff_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-table-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
        ...{ class: "detail-table" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    for (const [col] of __VLS_getVForSourceType((__VLS_ctx.detailColumns))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            key: (col),
            ...{ class: ({ highlighted: __VLS_ctx.isHighlightedColumn(col) }) },
        });
        (__VLS_ctx.columnLabel(col));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
    for (const [row, idx] of __VLS_getVForSourceType((__VLS_ctx.sortedDetails))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
            key: (idx),
        });
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.detailColumns))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                key: (col),
                ...{ class: ({ highlighted: __VLS_ctx.isHighlightedColumn(col) }) },
            });
            if (col === 'diff_type' || col === 'status') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: ({ 'tag-only-a': __VLS_ctx.isOnlyA(row), 'tag-only-b': __VLS_ctx.isOnlyB(row), 'tag-diff': __VLS_ctx.isDiff(row) }) },
                    ...{ class: "status-tag" },
                });
                (__VLS_ctx.formatDiffType(row[col]));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (row[col]);
            }
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "no-detail" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "no-detail-icon" },
    });
    (__VLS_ctx.emptyStateIcon);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.emptyStateText);
}
/** @type {__VLS_StyleScopedClasses['compare-result-card']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-main']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-title']} */ ;
/** @type {__VLS_StyleScopedClasses['conclusion-text']} */ ;
/** @type {__VLS_StyleScopedClasses['context-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['context-item']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['context-value']} */ ;
/** @type {__VLS_StyleScopedClasses['context-item']} */ ;
/** @type {__VLS_StyleScopedClasses['source-item']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['context-value']} */ ;
/** @type {__VLS_StyleScopedClasses['context-item']} */ ;
/** @type {__VLS_StyleScopedClasses['source-item']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['context-value']} */ ;
/** @type {__VLS_StyleScopedClasses['context-item']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['context-value']} */ ;
/** @type {__VLS_StyleScopedClasses['context-item']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['context-value']} */ ;
/** @type {__VLS_StyleScopedClasses['range-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['period-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['total']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['matched']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['diff']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['only-a']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['only-b']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-help']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-explain']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-title']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-list']} */ ;
/** @type {__VLS_StyleScopedClasses['details-section']} */ ;
/** @type {__VLS_StyleScopedClasses['details-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-table']} */ ;
/** @type {__VLS_StyleScopedClasses['status-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['no-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['no-detail-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            statusClass: statusClass,
            statusIcon: statusIcon,
            panelTitle: panelTitle,
            panelSubtitle: panelSubtitle,
            showContext: showContext,
            showExplanation: showExplanation,
            compareTypeLabel: compareTypeLabel,
            periodText: periodText,
            resolvedRangeText: resolvedRangeText,
            periodStatusLabel: periodStatusLabel,
            periodStatusClass: periodStatusClass,
            periodMessage: periodMessage,
            emptyStateText: emptyStateText,
            emptyStateIcon: emptyStateIcon,
            hasRosterDiff: hasRosterDiff,
            readableConclusion: readableConclusion,
            detailColumns: detailColumns,
            sortedDetails: sortedDetails,
            isHighlightedColumn: isHighlightedColumn,
            isPrimaryMetric: isPrimaryMetric,
            fmtNum: fmtNum,
            columnLabel: columnLabel,
            formatDiffType: formatDiffType,
            isOnlyA: isOnlyA,
            isOnlyB: isOnlyB,
            isDiff: isDiff,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
