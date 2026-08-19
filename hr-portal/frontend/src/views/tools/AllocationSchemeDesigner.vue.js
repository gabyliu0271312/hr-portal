/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check } from '@element-plus/icons-vue';
import AllocationBasicInfo from '@/components/allocation/AllocationBasicInfo.vue';
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue';
import ReportFieldWorkbench from '@/components/report/ReportFieldWorkbench.vue';
import ReportFilterList from '@/components/report/ReportFilterList.vue';
import ReportTransposeConfig from '@/components/report/ReportTransposeConfig.vue';
import { allocationApi } from '@/api/allocation';
import { datasetsApi } from '@/api/datasets';
import { deriveValueRules } from '@/api/reports';
import { useTableOptions } from '@/composables/useTableOptions';
const { tables: TABLES } = useTableOptions();
const route = useRoute();
const router = useRouter();
const schemeId = computed(() => {
    const id = route.params.id;
    return id === 'new' ? null : Number(id);
});
const isNew = computed(() => schemeId.value === null);
const form = reactive({
    name: '',
    description: '',
    dataset_id: null,
    result_table: 'emp_monthly_cost_result',
    selected_codes: [],
    column_settings: {},
    default_split_rule: { enabled: false, factors: [] },
    rounding_group_by: [],
    filters: [],
    filter_logic: null,
    sorts: [],
    value_rules: [],
    aggregate: false,
    default_aggregation: 'sum',
    aggregations: {},
    transpose: {
        enabled: false,
        drop_zero_measures: true,
        rules: [],
        column_to_row: {
            enabled: false,
            source_cols: [],
            group_by: [],
            item_label: '项目',
            value_label: '金额',
            conflict_strategy: 'keep_all',
        },
        row_to_column: {
            enabled: false,
            group_by: [],
            pivot_col: '',
            value_col: '',
            pivot_values: [],
            fill_value: '--',
            conflict_strategy: 'first',
        },
    },
    rounding_corrections: [],
});
const allColumns = ref([]);
const datasets = ref([]);
const currentDataset = ref(null);
const resultTables = ref([]);
const saving = ref(false);
const previewing = ref(false);
const previewColumns = ref([]);
const previewItems = ref([]);
const previewTotal = ref(0);
const previewPage = ref(1);
const previewPageSize = ref(20);
const transposeRef = ref(null);
const filterRef = ref(null);
const selectedColsDetail = computed(() => form.selected_codes.map((c) => allColumns.value.find((x) => x.code === c)).filter(Boolean));
function isCountAggregation(value) {
    return value === 'count' || value === 'count_distinct';
}
function isCountMetric(col) {
    return col.agg_role !== 'measure' && isCountAggregation(form.column_settings[col.code]?.aggregation);
}
function isMeasureLike(col) {
    return col.agg_role === 'measure' || isCountMetric(col);
}
const selectedDimensions = computed(() => selectedColsDetail.value.filter((c) => !isMeasureLike(c)));
const selectedMeasures = computed(() => selectedColsDetail.value.filter((c) => isMeasureLike(c)));
const isDataset = computed(() => true);
async function loadDatasets() {
    try {
        datasets.value = await datasetsApi.list();
        if (isNew.value && !form.dataset_id) {
            form.dataset_id = datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null;
        }
    }
    catch {
        datasets.value = [];
    }
}
async function loadResultTables() {
    try {
        resultTables.value = await allocationApi.listResultTables();
    }
    catch {
        resultTables.value = [];
    }
}
async function loadScheme() {
    if (isNew.value)
        return;
    try {
        const s = await allocationApi.getScheme(schemeId.value);
        form.name = s.name;
        form.description = s.description ?? '';
        form.dataset_id = s.dataset_id;
        form.result_table = s.result_table;
        const cfg = s.config;
        form.selected_codes = [...(cfg.columns ?? [])];
        form.column_settings = { ...(cfg.column_settings ?? {}) };
        form.default_split_rule = {
            enabled: !!cfg.default_split_rule?.enabled,
            factors: cfg.default_split_rule?.factors ?? (cfg.default_split_rule?.factor ? [cfg.default_split_rule.factor] : []),
        };
        form.filters = (cfg.filters ?? []).map((f) => ({ ...f }));
        form.filter_logic = cfg.filter_logic ?? null;
        form.sorts = (cfg.sorts ?? []).map((s) => ({ ...s }));
        // 拆分规则只由 column_settings + default_split_rule 派生(见 buildPayload 的
        // deriveValueRules),不回写旧 value_rules,否则历史脏规则会反复复活。
        form.value_rules = [];
        form.aggregate = cfg.aggregate ?? false;
        form.default_aggregation = (cfg.default_aggregation || 'sum');
        form.aggregations = { ...(cfg.aggregations ?? {}) };
        for (const [code, aggregation] of Object.entries(form.aggregations)) {
            if (aggregation && !form.column_settings[code]?.aggregation) {
                form.column_settings[code] = {
                    ...(form.column_settings[code] || {}),
                    aggregation: aggregation,
                };
            }
        }
        const tp = cfg.transpose;
        form.transpose = {
            enabled: tp?.enabled ?? false,
            drop_zero_measures: tp?.drop_zero_measures ?? true,
            rules: (tp?.rules ?? []).map((r) => ({
                source_col: r.source_col,
                target_cols: [...(r.target_cols ?? [])],
                dims: Object.entries(r.dim_updates ?? {}).map(([dim, value]) => ({ dim, value })),
            })),
            column_to_row: {
                enabled: !!tp?.column_to_row?.enabled,
                source_cols: [...(tp?.column_to_row?.source_cols ?? [])],
                group_by: [...(tp?.column_to_row?.group_by ?? [])],
                item_label: tp?.column_to_row?.item_label || '项目',
                value_label: tp?.column_to_row?.value_label || '金额',
                conflict_strategy: tp?.column_to_row?.conflict_strategy || 'keep_all',
            },
            row_to_column: {
                enabled: !!tp?.row_to_column?.enabled,
                group_by: [...(tp?.row_to_column?.group_by ?? [])],
                pivot_col: tp?.row_to_column?.pivot_col || '',
                value_col: tp?.row_to_column?.value_col || '',
                pivot_values: (tp?.row_to_column?.pivot_values ?? []).map((item) => ({
                    value: item.value,
                    label: item.label || '',
                })),
                fill_value: tp?.row_to_column?.fill_value ?? '--',
                conflict_strategy: tp?.row_to_column?.conflict_strategy || 'first',
            },
        };
        form.rounding_corrections = (cfg.rounding_corrections ?? []).map((rc) => ({
            group_by: Array.isArray(rc.group_by) ? rc.group_by[0] ?? '' : rc.group_by ?? '',
            target_cols: [...(rc.target_cols ?? [])],
        }));
        const firstRounding = cfg.rounding_corrections?.[0];
        form.rounding_group_by = Array.isArray(firstRounding?.group_by)
            ? [...firstRounding.group_by]
            : firstRounding?.group_by
                ? [firstRounding.group_by]
                : [];
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载方案失败');
    }
}
function resetForm() {
    form.selected_codes = [];
    form.column_settings = {};
    form.default_split_rule = { enabled: false, factors: [] };
    form.rounding_group_by = [];
    form.filters = [];
    form.filter_logic = null;
    form.sorts = [];
    form.value_rules = [];
    form.aggregate = false;
    form.default_aggregation = 'sum';
    form.aggregations = {};
    form.transpose = {
        enabled: false,
        drop_zero_measures: true,
        rules: [],
        column_to_row: {
            enabled: false,
            source_cols: [],
            group_by: [],
            item_label: '项目',
            value_label: '金额',
            conflict_strategy: 'keep_all',
        },
        row_to_column: {
            enabled: false,
            group_by: [],
            pivot_col: '',
            value_col: '',
            pivot_values: [],
            fill_value: '--',
            conflict_strategy: 'first',
        },
    };
    form.rounding_corrections = [];
    filterRef.value?.clearCache();
    previewColumns.value = [];
    previewItems.value = [];
    previewTotal.value = 0;
}
function onDatasetChange() {
    resetForm();
}
function onCalculatedFieldSaved(field) {
    const code = `calc.${field.code}`;
    if (!form.selected_codes.includes(code)) {
        form.selected_codes = [...form.selected_codes, code];
    }
}
function normalizeFilters(filters, withViewControls = false) {
    return (filters || [])
        .filter((f) => f.column)
        .map((f) => {
        const op = f.op;
        let value = f.value;
        if (op === 'is_null' || op === 'is_not_null')
            value = null;
        else if ((op === 'between' || op === 'in') && typeof value === 'string')
            value = value.split(',').map((s) => s.trim()).filter(Boolean);
        const out = { column: f.column, op, value };
        if (withViewControls) {
            out.visible = f.visible ?? true;
            out.locked = f.locked ?? false;
        }
        return out;
    });
}
function normalizeColumnSettings() {
    return Object.fromEntries(Object.entries(form.column_settings).map(([code, setting]) => {
        const next = { ...setting };
        next.metric_filters = normalizeFilters(next.metric_filters || []);
        next.metric_filter_logic =
            next.metric_filter_logic?.mode === 'custom' && next.metric_filter_logic.expression?.trim()
                ? { mode: 'custom', expression: next.metric_filter_logic.expression.trim() }
                : null;
        if (!next.metric_filters.length) {
            delete next.metric_filters;
            delete next.metric_filter_logic;
        }
        return [code, next];
    }));
}
function buildPayload() {
    const selectedMeasureCodes = selectedMeasures.value.map((c) => c.code);
    const selectedPhysicalMeasureCodes = selectedMeasures.value.filter((c) => c.agg_role === 'measure').map((c) => c.code);
    const c2r = form.transpose.column_to_row || {};
    const r2c = form.transpose.row_to_column || {};
    const filterLogic = form.filter_logic?.mode === 'custom' && form.filter_logic.expression?.trim()
        ? { mode: 'custom', expression: form.filter_logic.expression.trim() }
        : null;
    const valueRules = deriveValueRules(form.column_settings, form.default_split_rule, selectedPhysicalMeasureCodes);
    return {
        name: form.name.trim(),
        description: form.description.trim() || null,
        dataset_id: form.dataset_id,
        result_table: form.result_table,
        is_active: true,
        config: {
            columns: form.selected_codes,
            column_settings: normalizeColumnSettings(),
            default_split_rule: form.default_split_rule,
            filters: normalizeFilters(form.filters, true),
            filter_logic: filterLogic,
            sorts: form.sorts.filter((s) => s.column),
            value_rules: valueRules,
            aggregate: form.aggregate,
            default_aggregation: form.default_aggregation || 'sum',
            aggregations: form.aggregate
                ? Object.fromEntries(selectedMeasures.value.map((c) => [
                    c.code,
                    form.column_settings[c.code]?.aggregation || form.default_aggregation || 'sum',
                ]))
                : {},
            transpose: {
                enabled: form.transpose.enabled,
                drop_zero_measures: form.transpose.drop_zero_measures,
                rules: form.transpose.rules
                    .filter((r) => r.source_col && r.target_cols.length)
                    .map((r) => {
                    const du = {};
                    for (const d of r.dims)
                        if (d.dim && d.value !== '')
                            du[d.dim] = d.value;
                    return { source_col: r.source_col, target_cols: r.target_cols, dim_updates: du };
                }),
                column_to_row: {
                    enabled: !!c2r.enabled,
                    source_cols: [...(c2r.source_cols || [])].filter((code) => form.selected_codes.includes(code)),
                    group_by: [...(c2r.group_by || [])].filter((code) => form.selected_codes.includes(code)),
                    item_label: c2r.item_label || '项目',
                    value_label: c2r.value_label || '金额',
                    conflict_strategy: (c2r.conflict_strategy || 'keep_all'),
                },
                row_to_column: {
                    enabled: !!r2c.enabled,
                    group_by: [...(r2c.group_by || [])].filter((code) => form.selected_codes.includes(code)),
                    pivot_col: form.selected_codes.includes(r2c.pivot_col || '') ? r2c.pivot_col : '',
                    value_col: form.selected_codes.includes(r2c.value_col || '') ? r2c.value_col : '',
                    pivot_values: (r2c.pivot_values || [])
                        .filter((item) => item.value !== '')
                        .map((item) => ({ value: item.value, label: item.label || '' })),
                    fill_value: r2c.fill_value ?? '--',
                    conflict_strategy: (r2c.conflict_strategy || 'first'),
                },
            },
            rounding_corrections: form.aggregate && form.rounding_group_by.length && selectedPhysicalMeasureCodes.length
                ? [{ group_by: [...form.rounding_group_by], target_cols: selectedPhysicalMeasureCodes }]
                : form.aggregate
                    ? form.rounding_corrections
                        .filter((rc) => rc.group_by && rc.target_cols.length)
                        .map((rc) => ({ group_by: rc.group_by, target_cols: [...rc.target_cols] }))
                    : [],
        },
    };
}
async function save() {
    if (!form.name.trim()) {
        ElMessage.warning('请填写方案名');
        return;
    }
    if (!form.selected_codes.length) {
        ElMessage.warning('至少选择一个字段');
        return;
    }
    if (!form.dataset_id) {
        ElMessage.warning('请选择数据集');
        return;
    }
    saving.value = true;
    try {
        if (form.transpose.enabled && form.transpose.rules?.length)
            await transposeRef.value?.ensureCcMaster();
        const payload = buildPayload();
        if (isNew.value) {
            const s = await allocationApi.createScheme(payload);
            ElMessage.success('已创建');
            router.replace(`/tools/allocation-designer/${s.id}`);
        }
        else {
            await allocationApi.updateScheme(schemeId.value, payload);
            ElMessage.success('已保存');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function preview() {
    if (!form.selected_codes.length) {
        ElMessage.warning('至少选择一个字段才能预览');
        return;
    }
    if (isNew.value) {
        ElMessage.info('请先保存后再预览');
        return;
    }
    previewing.value = true;
    try {
        if (form.transpose.enabled && form.transpose.rules?.length)
            await transposeRef.value?.ensureCcMaster();
        await allocationApi.updateScheme(schemeId.value, buildPayload());
        // 复用 report run 接口预览——创建一个临时 report 或直接调 scheme run preview
        // 此处简化：通过 scheme 的 dataset_id 直接查询（待后续优化）
        ElMessage.info('预览功能需绑定报表，请先保存后在列表点击"计算"验证数据');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览失败');
    }
    finally {
        previewing.value = false;
    }
}
onMounted(async () => {
    await Promise.all([loadDatasets(), loadResultTables()]);
    if (!isNew.value)
        await loadScheme();
});
watch(() => route.params.id, async (v) => {
    if (!v)
        return;
    if (v === 'new') {
        Object.assign(form, {
            name: '', description: '', dataset_id: datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null,
            result_table: 'emp_monthly_cost_result',
            selected_codes: [], filters: [], sorts: [], value_rules: [],
            aggregate: false, default_aggregation: 'sum', aggregations: {},
            column_settings: {}, default_split_rule: { enabled: false, factors: [] }, rounding_group_by: [], filter_logic: null,
            transpose: {
                enabled: false,
                drop_zero_measures: true,
                rules: [],
                column_to_row: {
                    enabled: false,
                    source_cols: [],
                    group_by: [],
                    item_label: '项目',
                    value_label: '金额',
                    conflict_strategy: 'keep_all',
                },
                row_to_column: {
                    enabled: false,
                    group_by: [],
                    pivot_col: '',
                    value_col: '',
                    pivot_values: [],
                    fill_value: '--',
                    conflict_strategy: 'first',
                },
            },
            rounding_corrections: [],
        });
        previewItems.value = [];
        previewColumns.value = [];
    }
    else {
        await loadScheme();
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "designer-page" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        link: true,
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (...[$event]) => {
            __VLS_ctx.router.push('/tools/cost-allocation');
        }
    };
    __VLS_7.slots.default;
    const __VLS_12 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_15;
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.isNew ? '新建分摊方案' : `编辑方案 · ${__VLS_ctx.form.name || '(未命名)'}`);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_23.slots.default;
    const __VLS_28 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ style: {} },
    }));
    const __VLS_30 = __VLS_29({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.Check;
    /** @type {[typeof __VLS_components.Check, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
    var __VLS_31;
    var __VLS_23;
}
const __VLS_36 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    labelPosition: "top",
}));
const __VLS_38 = __VLS_37({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
/** @type {[typeof AllocationBasicInfo, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(AllocationBasicInfo, new AllocationBasicInfo({
    ...{ 'onDatasetChange': {} },
    name: (__VLS_ctx.form.name),
    description: (__VLS_ctx.form.description),
    datasetId: (__VLS_ctx.form.dataset_id),
    resultTable: (__VLS_ctx.form.result_table),
    datasets: (__VLS_ctx.datasets),
    currentDataset: (__VLS_ctx.currentDataset),
    resultTables: (__VLS_ctx.resultTables),
}));
const __VLS_41 = __VLS_40({
    ...{ 'onDatasetChange': {} },
    name: (__VLS_ctx.form.name),
    description: (__VLS_ctx.form.description),
    datasetId: (__VLS_ctx.form.dataset_id),
    resultTable: (__VLS_ctx.form.result_table),
    datasets: (__VLS_ctx.datasets),
    currentDataset: (__VLS_ctx.currentDataset),
    resultTables: (__VLS_ctx.resultTables),
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
let __VLS_43;
let __VLS_44;
let __VLS_45;
const __VLS_46 = {
    onDatasetChange: (__VLS_ctx.onDatasetChange)
};
var __VLS_42;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
(__VLS_ctx.form.selected_codes.length);
/** @type {[typeof CalculatedFieldBridge, typeof CalculatedFieldBridge, ]} */ ;
// @ts-ignore
const __VLS_47 = __VLS_asFunctionalComponent(CalculatedFieldBridge, new CalculatedFieldBridge({
    ...{ 'onColumnsChange': {} },
    ...{ 'onDatasetChange': {} },
    ...{ 'onSaved': {} },
    datasetId: (__VLS_ctx.form.dataset_id),
    datasets: (__VLS_ctx.datasets),
    tables: (__VLS_ctx.TABLES),
}));
const __VLS_48 = __VLS_47({
    ...{ 'onColumnsChange': {} },
    ...{ 'onDatasetChange': {} },
    ...{ 'onSaved': {} },
    datasetId: (__VLS_ctx.form.dataset_id),
    datasets: (__VLS_ctx.datasets),
    tables: (__VLS_ctx.TABLES),
}, ...__VLS_functionalComponentArgsRest(__VLS_47));
let __VLS_50;
let __VLS_51;
let __VLS_52;
const __VLS_53 = {
    onColumnsChange: (...[$event]) => {
        __VLS_ctx.allColumns = $event;
    }
};
const __VLS_54 = {
    onDatasetChange: (...[$event]) => {
        __VLS_ctx.currentDataset = $event;
    }
};
const __VLS_55 = {
    onSaved: (__VLS_ctx.onCalculatedFieldSaved)
};
__VLS_49.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_49.slots;
    const [{ columns, loading, sourceGroups, canCreateField, createField, editField }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof ReportFieldWorkbench, typeof ReportFieldWorkbench, ]} */ ;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent(ReportFieldWorkbench, new ReportFieldWorkbench({
        ...{ 'onCreateField': {} },
        ...{ 'onEditField': {} },
        selectedCodes: (__VLS_ctx.form.selected_codes),
        columnSettings: (__VLS_ctx.form.column_settings),
        defaultSplitRule: (__VLS_ctx.form.default_split_rule),
        defaultAggregation: (__VLS_ctx.form.default_aggregation),
        aggregate: (__VLS_ctx.form.aggregate),
        roundingGroupBy: (__VLS_ctx.form.rounding_group_by),
        sorts: (__VLS_ctx.form.sorts),
        allColumns: (columns),
        sourceGroups: (sourceGroups),
        currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        loading: (loading),
        isDataset: (__VLS_ctx.isDataset),
        canCreateField: (canCreateField),
    }));
    const __VLS_57 = __VLS_56({
        ...{ 'onCreateField': {} },
        ...{ 'onEditField': {} },
        selectedCodes: (__VLS_ctx.form.selected_codes),
        columnSettings: (__VLS_ctx.form.column_settings),
        defaultSplitRule: (__VLS_ctx.form.default_split_rule),
        defaultAggregation: (__VLS_ctx.form.default_aggregation),
        aggregate: (__VLS_ctx.form.aggregate),
        roundingGroupBy: (__VLS_ctx.form.rounding_group_by),
        sorts: (__VLS_ctx.form.sorts),
        allColumns: (columns),
        sourceGroups: (sourceGroups),
        currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        loading: (loading),
        isDataset: (__VLS_ctx.isDataset),
        canCreateField: (canCreateField),
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    let __VLS_59;
    let __VLS_60;
    let __VLS_61;
    const __VLS_62 = {
        onCreateField: (createField)
    };
    const __VLS_63 = {
        onEditField: (editField)
    };
    __VLS_58.slots.default;
    {
        const { filters: __VLS_thisSlot } = __VLS_58.slots;
        /** @type {[typeof ReportFilterList, ]} */ ;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent(ReportFilterList, new ReportFilterList({
            ref: "filterRef",
            filters: (__VLS_ctx.form.filters),
            filterLogic: (__VLS_ctx.form.filter_logic),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }));
        const __VLS_65 = __VLS_64({
            ref: "filterRef",
            filters: (__VLS_ctx.form.filters),
            filterLogic: (__VLS_ctx.form.filter_logic),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
        /** @type {typeof __VLS_ctx.filterRef} */ ;
        var __VLS_67 = {};
        var __VLS_66;
    }
    {
        const { reshape: __VLS_thisSlot } = __VLS_58.slots;
        /** @type {[typeof ReportTransposeConfig, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(ReportTransposeConfig, new ReportTransposeConfig({
            ref: "transposeRef",
            transpose: (__VLS_ctx.form.transpose),
            selectedDimensions: (__VLS_ctx.selectedDimensions),
            selectedMeasures: (__VLS_ctx.selectedMeasures),
            selectedColumns: (__VLS_ctx.selectedColsDetail),
        }));
        const __VLS_70 = __VLS_69({
            ref: "transposeRef",
            transpose: (__VLS_ctx.form.transpose),
            selectedDimensions: (__VLS_ctx.selectedDimensions),
            selectedMeasures: (__VLS_ctx.selectedMeasures),
            selectedColumns: (__VLS_ctx.selectedColsDetail),
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        /** @type {typeof __VLS_ctx.transposeRef} */ ;
        var __VLS_72 = {};
        var __VLS_71;
    }
    var __VLS_58;
}
var __VLS_49;
var __VLS_39;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['designer-page']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
// @ts-ignore
var __VLS_68 = __VLS_67, __VLS_73 = __VLS_72;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Check: Check,
            AllocationBasicInfo: AllocationBasicInfo,
            CalculatedFieldBridge: CalculatedFieldBridge,
            ReportFieldWorkbench: ReportFieldWorkbench,
            ReportFilterList: ReportFilterList,
            ReportTransposeConfig: ReportTransposeConfig,
            TABLES: TABLES,
            router: router,
            isNew: isNew,
            form: form,
            allColumns: allColumns,
            datasets: datasets,
            currentDataset: currentDataset,
            resultTables: resultTables,
            saving: saving,
            transposeRef: transposeRef,
            filterRef: filterRef,
            selectedColsDetail: selectedColsDetail,
            selectedDimensions: selectedDimensions,
            selectedMeasures: selectedMeasures,
            isDataset: isDataset,
            onDatasetChange: onDatasetChange,
            onCalculatedFieldSaved: onCalculatedFieldSaved,
            save: save,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
