/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { View, Check, MagicStick, Position } from '@element-plus/icons-vue';
import FullscreenWorkspaceShell from '@/components/layout/FullscreenWorkspaceShell.vue';
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue';
import ReportBasicInfo from '@/components/report/ReportBasicInfo.vue';
import ReportFieldWorkbench from '@/components/report/ReportFieldWorkbench.vue';
import ReportDimensionMergeConfig from '@/components/report/ReportDimensionMergeConfig.vue';
import ReportFilterList from '@/components/report/ReportFilterList.vue';
import ReportListLookupConfig from '@/components/report/ReportListLookupConfig.vue';
import ReportTransposeConfig from '@/components/report/ReportTransposeConfig.vue';
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue';
import PushTargetList from '@/components/push/PushTargetList.vue';
import { reportsApi, deriveValueRules, REPORT_VISIBILITY_LABELS } from '@/api/reports';
import { datasetsApi } from '@/api/datasets';
import { useTableOptions } from '@/composables/useTableOptions';
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy';
import { dependencyCount, removeReportColumnInstance, } from '@/utils/reportColumnDependencies';
const { tables: TABLES } = useTableOptions();
const route = useRoute();
const router = useRouter();
const reportListTarget = computed(() => {
    const target = route.query.returnTo;
    return typeof target === 'string' && target.startsWith('/report/list') ? target : '/report/list';
});
const reportId = computed(() => {
    const id = route.params.id;
    return id === 'new' ? null : Number(id);
});
const isNew = computed(() => reportId.value === null);
const copySourceId = ref(null);
const isCopyMode = computed(() => copySourceId.value !== null);
const saveCreatesReport = computed(() => isNew.value || isCopyMode.value);
const pageTitle = computed(() => {
    if (isNew.value)
        return '新建报表';
    const name = form.name || '(未命名)';
    return isCopyMode.value
        ? `编辑报表 · ${name}（保存后生成我的副本）`
        : `编辑报表 · ${name}`;
});
const form = reactive({
    name: '',
    description: '',
    dataset_id: null,
    visibility: 'private',
    scope_strategy: null,
    selected_codes: [],
    column_settings: {},
    default_split_rule: { enabled: false, factors: [] },
    rounding_group_by: [],
    filters: [],
    quality_period_field: '',
    filter_logic: null,
    sorts: [],
    value_rules: [],
    aggregate: false,
    default_aggregation: 'sum',
    aggregations: {},
    dimension_merge_rules: [],
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
    list_lookup: {
        enabled: false,
        operator: 'union',
        lookup: { target_field: '' },
        sources: [],
    },
    rounding_corrections: [],
    acl: [],
});
async function removeSelectedColumn(instanceId) {
    const result = removeReportColumnInstance({
        selectedCodes: form.selected_codes,
        columnSettings: form.column_settings,
        defaultSplitRule: form.default_split_rule,
        sorts: form.sorts,
        aggregations: form.aggregations,
        roundingGroupBy: form.rounding_group_by,
    }, instanceId);
    const count = dependencyCount(result.dependencies);
    if (count) {
        try {
            await ElMessageBox.confirm(`该字段被 ${count} 项排序、聚合或分摊配置引用。移除会同步清理这些配置，可能改变报表口径。`, '确认移除字段', {
                confirmButtonText: '移除并清理依赖',
                cancelButtonText: '取消',
                type: 'warning',
            });
        }
        catch {
            return;
        }
    }
    form.selected_codes = result.state.selectedCodes;
    form.column_settings = result.state.columnSettings;
    form.default_split_rule = result.state.defaultSplitRule;
    form.sorts = result.state.sorts;
    form.aggregations = result.state.aggregations;
    form.rounding_group_by = result.state.roundingGroupBy;
}
const allColumns = ref([]);
const datasets = ref([]);
const currentDataset = ref(null);
const saving = ref(false);
const previewing = ref(false);
const explaining = ref(false);
const explainOpen = ref(false);
const explainResult = ref(null);
const explainInput = ref('');
const explainScrollRef = ref(null);
const previewColumns = ref([]);
const previewItems = ref([]);
const previewTotal = ref(0);
const previewPage = ref(1);
const previewPageSize = ref(20);
const dimensionMergeErrors = ref([]);
const reportPushSourceTable = computed(() => reportId.value ? `report:${reportId.value}` : '');
const reportPushColumns = computed(() => selectedColsDetail.value.map((c) => ({
    code: instanceIdOf(c),
    label: outputLabel(c),
    data_type: c.data_type || 'text',
    is_pk_part: false,
    is_sensitive: !!c.is_sensitive,
    is_visible: true,
    display_order: form.selected_codes.indexOf(instanceIdOf(c)),
    auto_discovered: false,
    agg_role: c.agg_role || '',
    is_computed: !!c.is_computed,
})));
const reportPushTargets = ref([]);
const reportPushEnabled = computed(() => reportPushTargets.value.length > 0);
const basicSettingsOpen = ref(false);
const currentDatasetName = computed(() => currentDataset.value?.name || datasets.value.find((d) => d.id === form.dataset_id)?.name || '未选择数据集');
const publishStatusLabel = computed(() => REPORT_VISIBILITY_LABELS[form.visibility]);
const scopeStrategyLabel = computed(() => SCOPE_STRATEGY_OPTIONS.find((item) => item.value === form.scope_strategy)?.label || '继承默认');
const filterSummary = computed(() => form.filters.length ? `${form.filters.length} 条筛选` : '未设置筛选');
const pushSummary = computed(() => reportPushTargets.value.length ? `${reportPushTargets.value.length} 个推送配置` : '未配置推送');
const fieldWorkbenchRef = ref(null);
const transposeRef = ref(null);
const filterRef = ref(null);
let explainChatId = 0;
const explainMessages = ref([]);
/** Track B: source_code lookup — strip #N suffix from instance_id */
function sourceCode(instanceId) {
    return instanceId.replace(/#\d+$/, '');
}
const selectedColsDetail = computed(() => form.selected_codes
    .map((id) => {
    const col = allColumns.value.find((c) => c.code === sourceCode(id));
    return col ? { ...col, _instance_id: id } : null;
})
    .filter(Boolean));
function isCountAggregation(value) {
    return value === 'count' || value === 'count_distinct';
}
function instanceIdOf(col) {
    return col._instance_id || col.code;
}
function outputLabel(col) {
    const instanceId = instanceIdOf(col);
    const label = form.column_settings[instanceId]?.display_name || col.label || col.code;
    return instanceId === col.code ? label : `${label} (${instanceId.split('#').pop()})`;
}
function isCountMetric(col) {
    return col.agg_role !== 'measure' && isCountAggregation(form.column_settings[instanceIdOf(col)]?.aggregation);
}
function isMeasureLike(col) {
    return col.agg_role === 'measure' || isCountMetric(col);
}
const selectedDimensions = computed(() => selectedColsDetail.value.filter((c) => !isMeasureLike(c)));
const selectedMeasures = computed(() => selectedColsDetail.value.filter((c) => isMeasureLike(c)));
const structuralReshapeEnabled = computed(() => !!form.transpose.column_to_row?.enabled || !!form.transpose.row_to_column?.enabled);
const currentDimensionSignature = computed(() => selectedDimensions.value.map(instanceIdOf));
const dimensionMergePending = computed(() => form.dimension_merge_rules.length > 0 && (!form.aggregate
    || structuralReshapeEnabled.value
    || form.dimension_merge_rules.some((rule) => rule.dimension_signature.join('|') !== currentDimensionSignature.value.join('|'))));
const dimensionMergeReportConfig = computed(() => buildPayload().config);
const isDataset = computed(() => true);
async function loadDatasets() {
    try {
        const all = await datasetsApi.list();
        // P3-01: 报表只能引用 DWD/DWS 数据集
        datasets.value = all.filter((d) => d.warehouse_layer === 'DWD' || d.warehouse_layer === 'DWS');
        if (isNew.value && !form.dataset_id) {
            form.dataset_id = datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null;
        }
    }
    catch {
        datasets.value = [];
    }
}
async function loadReport() {
    if (isNew.value)
        return;
    try {
        const r = await reportsApi.get(reportId.value);
        copySourceId.value = r.can_edit ? null : r.id;
        form.name = r.can_edit ? r.name : `${r.name} - 副本`;
        form.description = r.description ?? '';
        form.dataset_id = r.dataset_id;
        form.visibility = r.can_edit ? (r.visibility ?? 'private') : 'private';
        form.scope_strategy = r.scope_strategy;
        form.acl = r.can_edit
            ? (r.acl || []).map((a) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id }))
            : [];
        form.selected_codes = [...(r.config.columns ?? [])].map(c => typeof c === 'string' ? c : c.instance_id);
        form.column_settings = { ...(r.config.column_settings ?? {}) };
        form.default_split_rule = {
            enabled: !!r.config.default_split_rule?.enabled,
            factors: r.config.default_split_rule?.factors ?? (r.config.default_split_rule?.factor ? [r.config.default_split_rule.factor] : []),
        };
        form.filters = (r.config.filters ?? []).map((f) => ({ ...f }));
        form.quality_period_field = r.config.quality_period_field || '';
        form.filter_logic = r.config.filter_logic ?? null;
        form.sorts = (r.config.sorts ?? []).map((s) => ({ ...s }));
        // 拆分规则只由 column_settings + default_split_rule 派生（见 buildPayload），
        // 不再回写旧 value_rules，否则历史脏规则会反复复活。
        form.value_rules = [];
        form.aggregate = r.config.aggregate ?? false;
        form.default_aggregation = (r.config.default_aggregation || 'sum');
        form.aggregations = { ...(r.config.aggregations ?? {}) };
        form.dimension_merge_rules = (r.config.dimension_merge_rules ?? []).map((rule) => ({
            ...rule,
            dimension_signature: [...rule.dimension_signature],
            sources: rule.sources.map((source) => ({ values: { ...source.values } })),
            target: { values: { ...rule.target.values }, modes: { ...rule.target.modes } },
        }));
        for (const [code, aggregation] of Object.entries(form.aggregations)) {
            if (aggregation && !form.column_settings[code]?.aggregation) {
                form.column_settings[code] = {
                    ...(form.column_settings[code] || {}),
                    aggregation: aggregation,
                };
            }
        }
        const tp = r.config.transpose;
        form.transpose = {
            enabled: tp?.enabled ?? false,
            drop_zero_measures: tp?.drop_zero_measures ?? true,
            rules: (tp?.rules ?? []).map((rule) => ({
                source_col: rule.source_col,
                target_cols: [...(rule.target_cols ?? [])],
                dims: Object.entries(rule.dim_updates ?? {}).map(([dim, value]) => ({ dim, value })),
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
        form.list_lookup = {
            enabled: !!r.config.list_lookup?.enabled,
            operator: r.config.list_lookup?.operator || 'union',
            lookup: {
                target_field: r.config.list_lookup?.lookup?.target_field || '',
            },
            sources: (r.config.list_lookup?.sources || []).map((source) => ({
                ...source,
                filters: (source.filters || []).map((f) => ({ ...f })),
                filter_logic: source.filter_logic || null,
                resolver: source.resolver ? { ...source.resolver } : undefined,
            })),
        };
        form.rounding_corrections = (r.config.rounding_corrections ?? []).map((rc) => ({
            group_by: Array.isArray(rc.group_by) ? rc.group_by[0] ?? '' : rc.group_by ?? '',
            target_cols: [...(rc.target_cols ?? [])],
        }));
        const firstRounding = r.config.rounding_corrections?.[0];
        form.rounding_group_by = Array.isArray(firstRounding?.group_by)
            ? [...firstRounding.group_by]
            : firstRounding?.group_by
                ? [firstRounding.group_by]
                : [];
        if (!r.can_edit) {
            ElMessage.info('正在编辑副本，保存后会生成你的新报表');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载报表失败');
    }
}
function resetForm() {
    form.selected_codes = [];
    form.column_settings = {};
    form.default_split_rule = { enabled: false, factors: [] };
    form.rounding_group_by = [];
    form.filters = [];
    form.quality_period_field = '';
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
    form.list_lookup = {
        enabled: false,
        operator: 'union',
        lookup: { target_field: '' },
        sources: [],
    };
    form.rounding_corrections = [];
    filterRef.value?.clearCache();
    previewColumns.value = [];
    previewItems.value = [];
    previewTotal.value = 0;
}
async function onDatasetChange() {
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
        else if ((op === 'between' || op === 'in') && typeof value === 'string') {
            value = value.split(',').map((s) => s.trim()).filter(Boolean);
        }
        const out = { column: f.column, op, value };
        if (withViewControls) {
            out.visible = f.visible ?? true;
            out.locked = f.locked ?? false;
        }
        return out;
    });
}
function normalizeColumnSettings() {
    return Object.fromEntries(Object.entries(form.column_settings)
        .map(([code, setting]) => {
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
    const tailCode = (q) => {
        const source = sourceCode(q);
        return source.includes('.') ? source.slice(source.indexOf('.') + 1) : source;
    };
    // 剔除数据集里已不存在的字段引用（如已删除的计算字段），避免脏引用被持久化后在查看时反复告警。
    // 守卫 allColumns 非空：字段尚未加载完时保持原样，不误清空。
    // Track B: 转为 ColumnInstance[] 格式发送
    const validSelectedColumns = form.selected_codes.map((id) => ({
        source_code: sourceCode(id),
        instance_id: id,
    }));
    const selectedDimCodes = selectedDimensions.value.map(instanceIdOf);
    const selectedMeasureCodes = selectedMeasures.value.map(instanceIdOf);
    const selectedPhysicalMeasureCodes = selectedMeasures.value
        .filter((c) => c.agg_role === 'measure')
        .map(instanceIdOf);
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
        visibility: form.visibility,
        scope_strategy: form.scope_strategy || null,
        acl: form.visibility === 'scoped'
            ? form.acl
                .filter((a) => a.role_id != null || a.user_id != null)
                .map((a) => ({ role_id: a.role_id, user_id: a.user_id }))
            : [],
        config: {
            columns: validSelectedColumns,
            column_settings: normalizeColumnSettings(),
            default_split_rule: form.default_split_rule,
            filters: normalizeFilters(form.filters, true),
            quality_period_field: form.quality_period_field || null,
            filter_logic: filterLogic,
            sorts: form.sorts.filter((s) => s.column),
            value_rules: valueRules,
            aggregate: form.aggregate,
            default_aggregation: form.default_aggregation || 'sum',
            aggregations: form.aggregate
                ? Object.fromEntries(selectedMeasures.value.map((c) => {
                    const id = c._instance_id || c.code;
                    const key = id;
                    return [
                        key,
                        form.column_settings[id]?.aggregation
                            || form.default_aggregation
                            || 'sum',
                    ];
                }))
                : {},
            dimension_merge_rules: form.dimension_merge_rules.map((rule) => ({
                ...rule,
                dimension_signature: [...rule.dimension_signature],
                sources: rule.sources.map((source) => ({ values: { ...source.values } })),
                target: { values: { ...rule.target.values }, modes: { ...rule.target.modes } },
            })),
            transpose: {
                enabled: form.transpose.enabled,
                drop_zero_measures: form.transpose.drop_zero_measures,
                rules: form.transpose.rules
                    .filter((r) => r.source_col && r.target_cols.length)
                    .map((r) => {
                    const du = {};
                    for (const d of r.dims) {
                        if (d.dim && d.value !== '')
                            du[d.dim] = d.value;
                    }
                    const codeQuals = selectedDimCodes.filter((c) => tailCode(c) === '编码');
                    for (const [dim, val] of Object.entries({ ...du })) {
                        if (tailCode(dim) !== '维度值' && tailCode(dim) !== '名称')
                            continue;
                        const opt = transposeRef.value?.ccNameOptions?.find((o) => o.value === val);
                        if (!opt?.extra)
                            continue;
                        for (const cq of codeQuals) {
                            if (du[cq] === undefined)
                                du[cq] = opt.extra;
                        }
                    }
                    return { source_col: r.source_col, target_cols: r.target_cols, dim_updates: du };
                }),
                column_to_row: {
                    enabled: !!c2r.enabled,
                    source_cols: [...(c2r.source_cols || [])],
                    group_by: [...(c2r.group_by || [])],
                    item_label: c2r.item_label || '项目',
                    value_label: c2r.value_label || '金额',
                    conflict_strategy: (c2r.conflict_strategy || 'keep_all'),
                },
                row_to_column: {
                    enabled: !!r2c.enabled,
                    group_by: [...(r2c.group_by || [])],
                    pivot_col: r2c.pivot_col || '',
                    value_col: r2c.value_col || '',
                    pivot_values: (r2c.pivot_values || [])
                        .filter((item) => item.value !== '')
                        .map((item) => ({ value: item.value, label: item.label || '' })),
                    fill_value: r2c.fill_value ?? '--',
                    conflict_strategy: (r2c.conflict_strategy || 'first'),
                },
            },
            list_lookup: {
                enabled: !!form.list_lookup.enabled,
                operator: form.list_lookup.operator || 'union',
                lookup: {
                    target_field: form.list_lookup.lookup?.target_field || '',
                },
                sources: (form.list_lookup.sources || [])
                    .filter((source) => {
                    if (source.type === 'field_values')
                        return !!source.source_field;
                    return !!source.return_field;
                })
                    .map((source) => ({
                    ...source,
                    filters: (source.filters || [])
                        .filter((f) => f.column)
                        .map((f) => {
                        const op = f.op;
                        let value = f.value;
                        if (op === 'is_null' || op === 'is_not_null')
                            value = null;
                        else if ((op === 'between' || op === 'in') && typeof value === 'string') {
                            value = value.split(',').map((s) => s.trim()).filter(Boolean);
                        }
                        return { column: f.column, op, value };
                    }),
                    filter_logic: source.filter_logic?.mode === 'custom' && source.filter_logic.expression?.trim()
                        ? { mode: 'custom', expression: source.filter_logic.expression.trim() }
                        : null,
                    resolver: source.type === 'field_values'
                        ? {
                            enabled: source.resolver?.enabled === true,
                            match_field: source.resolver?.match_field || '',
                            return_field: source.resolver?.return_field || '',
                        }
                        : undefined,
                })),
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
function reportErrorDetail(error) {
    const detail = error?.response?.data?.detail;
    if (typeof detail !== 'string')
        return detail;
    try {
        return JSON.parse(detail);
    }
    catch {
        return detail;
    }
}
function reportErrorMessage(error, fallback) {
    if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        return '保存校验耗时较长，请稍后重试；如仍失败请缩小数据范围或联系管理员';
    }
    const detail = reportErrorDetail(error);
    if (typeof detail === 'string')
        return detail;
    const nestedError = Array.isArray(detail?.errors)
        ? detail.errors.find((item) => item?.message || item?.code)
        : null;
    return nestedError?.message || nestedError?.code || detail?.message || detail?.code || fallback;
}
async function save() {
    if (!form.name.trim()) {
        ElMessage.warning('请填写报表名');
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
    if (dimensionMergePending.value) {
        dimensionMergeErrors.value = [{ message: '归并规则与当前出数类型、维度结构或数据重塑配置冲突' }];
        fieldWorkbenchRef.value?.openAdvanced('merge');
        ElMessage.error('维度归并规则与当前出数类型、维度结构或数据重塑配置冲突，请先处理');
        return;
    }
    saving.value = true;
    dimensionMergeErrors.value = [];
    try {
        if (form.transpose.enabled && form.transpose.rules?.length)
            await transposeRef.value?.ensureCcMaster();
        const payload = buildPayload();
        if (saveCreatesReport.value) {
            const r = await reportsApi.create(payload);
            ElMessage.success(isCopyMode.value ? '已另存为你的报表' : '已创建');
            router.replace({ path: `/report/designer/${r.id}`, query: route.query });
        }
        else {
            await reportsApi.update(reportId.value, payload);
            ElMessage.success('已保存');
        }
    }
    catch (e) {
        const detail = reportErrorDetail(e);
        const message = reportErrorMessage(e, '保存失败');
        if (JSON.stringify(detail || '').includes('DIMENSION_MERGE')) {
            dimensionMergeErrors.value = Array.isArray(detail?.errors) ? detail.errors : [detail];
            fieldWorkbenchRef.value?.openAdvanced('merge');
        }
        ElMessage.error(message);
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
    if (saveCreatesReport.value) {
        ElMessage.info('请先保存为你的报表后再预览');
        return;
    }
    previewing.value = true;
    try {
        if (form.transpose.enabled && form.transpose.rules?.length)
            await transposeRef.value?.ensureCcMaster();
        await reportsApi.update(reportId.value, buildPayload());
        const res = await reportsApi.run(reportId.value, previewPage.value, previewPageSize.value);
        previewColumns.value = res.columns;
        previewItems.value = res.items;
        previewTotal.value = res.total;
    }
    catch (e) {
        const detail = reportErrorDetail(e);
        if (JSON.stringify(detail || '').includes('DIMENSION_MERGE')) {
            dimensionMergeErrors.value = Array.isArray(detail?.errors) ? detail.errors : [detail];
            fieldWorkbenchRef.value?.openAdvanced('merge');
        }
        ElMessage.error(reportErrorMessage(e, '预览失败'));
    }
    finally {
        previewing.value = false;
    }
}
function explainHistoryPayload() {
    return explainMessages.value.slice(-8).map((item) => ({
        role: item.role,
        content: item.content,
    }));
}
function scrollExplainToBottom() {
    nextTick(() => {
        const el = explainScrollRef.value;
        if (el)
            el.scrollTop = el.scrollHeight;
    });
}
function buildExplainPayload(question) {
    const payload = buildPayload();
    return {
        report_id: reportId.value,
        report_name: payload.name || '未命名报表',
        description: payload.description,
        columns: payload.config.columns,
        filters: payload.config.filters,
        sorts: payload.config.sorts,
        aggregate: payload.config.aggregate,
        aggregations: payload.config.aggregations,
        column_settings: payload.config.column_settings,
        question,
        history: explainHistoryPayload().filter((item) => item.content !== question),
    };
}
async function sendExplainQuestion(question, options = {}) {
    if (!form.selected_codes.length) {
        ElMessage.warning('至少选择一个字段才能解释');
        return;
    }
    const text = question.trim();
    if (!text) {
        ElMessage.warning('请先输入要追问的问题');
        return;
    }
    if (options.showUserMessage !== false) {
        explainMessages.value.push({
            id: ++explainChatId,
            role: 'user',
            content: text,
        });
    }
    explainOpen.value = true;
    explainInput.value = '';
    scrollExplainToBottom();
    explaining.value = true;
    try {
        const result = await reportsApi.explainConfig(buildExplainPayload(text));
        explainResult.value = result;
        explainMessages.value.push({
            id: ++explainChatId,
            role: 'assistant',
            content: result.answer || result.summary,
            traceId: result.trace_id,
        });
        scrollExplainToBottom();
    }
    catch (e) {
        const message = explainErrorMessage(e);
        ElMessage.error(message);
        explainMessages.value.push({
            id: ++explainChatId,
            role: 'assistant',
            content: message,
        });
        scrollExplainToBottom();
    }
    finally {
        explaining.value = false;
    }
}
async function explainConfig() {
    if (!explainMessages.value.length) {
        await sendExplainQuestion('请解释当前报表配置。', { showUserMessage: false });
        return;
    }
    explainOpen.value = true;
    scrollExplainToBottom();
}
function sendExplainInput() {
    sendExplainQuestion(explainInput.value);
}
function handleExplainKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendExplainInput();
    }
}
function explainErrorMessage(e) {
    if (e?.code === 'ECONNABORTED') {
        return '模型回答超时了，请稍后重试，或在 AI 基础配置里调大超时时间。';
    }
    return e?.response?.data?.detail || 'AI 解释失败';
}
onMounted(async () => {
    await loadDatasets();
    if (!isNew.value)
        await loadReport();
});
watch(() => route.params.id, async (v) => {
    if (!v)
        return;
    if (v === 'new') {
        copySourceId.value = null;
        Object.assign(form, {
            name: '', description: '', dataset_id: datasets.value.find((d) => d.is_active)?.id ?? datasets.value[0]?.id ?? null,
            visibility: 'private', scope_strategy: null, selected_codes: [], filters: [], sorts: [],
            value_rules: [], aggregate: false, default_aggregation: 'sum', aggregations: {},
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
            list_lookup: {
                enabled: false,
                operator: 'union',
                lookup: { target_field: '' },
                sources: [],
            },
            rounding_corrections: [],
        });
        previewItems.value = [];
        previewColumns.value = [];
    }
    else {
        copySourceId.value = null;
        await loadReport();
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['section-title-row']} */ ;
/** @type {__VLS_StyleScopedClasses['report-settings-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['report-settings-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['el-drawer__body']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-drawer-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-drawer-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['user']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['warning-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof FullscreenWorkspaceShell, typeof FullscreenWorkspaceShell, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(FullscreenWorkspaceShell, new FullscreenWorkspaceShell({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.pageTitle),
    subtitle: (`${__VLS_ctx.currentDatasetName} · ${__VLS_ctx.publishStatusLabel} · ${__VLS_ctx.form.selected_codes.length} 个字段 · ${__VLS_ctx.filterSummary}`),
    busy: (__VLS_ctx.saving),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.pageTitle),
    subtitle: (`${__VLS_ctx.currentDatasetName} · ${__VLS_ctx.publishStatusLabel} · ${__VLS_ctx.form.selected_codes.length} 个字段 · ${__VLS_ctx.filterSummary}`),
    busy: (__VLS_ctx.saving),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (...[$event]) => {
        __VLS_ctx.router.push(__VLS_ctx.reportListTarget);
    }
};
__VLS_2.slots.default;
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    const __VLS_7 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_11;
    let __VLS_12;
    let __VLS_13;
    const __VLS_14 = {
        onClick: (...[$event]) => {
            __VLS_ctx.basicSettingsOpen = true;
        }
    };
    __VLS_10.slots.default;
    var __VLS_10;
    const __VLS_15 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.explaining),
    }));
    const __VLS_17 = __VLS_16({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.explaining),
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    let __VLS_19;
    let __VLS_20;
    let __VLS_21;
    const __VLS_22 = {
        onClick: (__VLS_ctx.explainConfig)
    };
    __VLS_18.slots.default;
    const __VLS_23 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
        ...{ style: {} },
    }));
    const __VLS_25 = __VLS_24({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    __VLS_26.slots.default;
    const __VLS_27 = {}.MagicStick;
    /** @type {[typeof __VLS_components.MagicStick, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({}));
    const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
    var __VLS_26;
    var __VLS_18;
    const __VLS_31 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewing),
        disabled: (__VLS_ctx.saveCreatesReport),
    }));
    const __VLS_33 = __VLS_32({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewing),
        disabled: (__VLS_ctx.saveCreatesReport),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    let __VLS_35;
    let __VLS_36;
    let __VLS_37;
    const __VLS_38 = {
        onClick: (__VLS_ctx.preview)
    };
    __VLS_34.slots.default;
    const __VLS_39 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        ...{ style: {} },
    }));
    const __VLS_41 = __VLS_40({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    const __VLS_43 = {}.View;
    /** @type {[typeof __VLS_components.View, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({}));
    const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
    var __VLS_42;
    var __VLS_34;
    const __VLS_47 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_49 = __VLS_48({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    let __VLS_51;
    let __VLS_52;
    let __VLS_53;
    const __VLS_54 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_50.slots.default;
    const __VLS_55 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
        ...{ style: {} },
    }));
    const __VLS_57 = __VLS_56({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    __VLS_58.slots.default;
    const __VLS_59 = {}.Check;
    /** @type {[typeof __VLS_components.Check, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({}));
    const __VLS_61 = __VLS_60({}, ...__VLS_functionalComponentArgsRest(__VLS_60));
    var __VLS_58;
    var __VLS_50;
}
const __VLS_63 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    labelPosition: "top",
    ...{ class: "designer-form" },
}));
const __VLS_65 = __VLS_64({
    labelPosition: "top",
    ...{ class: "designer-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_66.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title compact-section-title" },
});
(__VLS_ctx.form.selected_codes.length);
/** @type {[typeof CalculatedFieldBridge, typeof CalculatedFieldBridge, ]} */ ;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent(CalculatedFieldBridge, new CalculatedFieldBridge({
    ...{ 'onColumnsChange': {} },
    ...{ 'onDatasetChange': {} },
    ...{ 'onSaved': {} },
    datasetId: (__VLS_ctx.form.dataset_id),
    datasets: (__VLS_ctx.datasets),
    tables: (__VLS_ctx.TABLES),
}));
const __VLS_68 = __VLS_67({
    ...{ 'onColumnsChange': {} },
    ...{ 'onDatasetChange': {} },
    ...{ 'onSaved': {} },
    datasetId: (__VLS_ctx.form.dataset_id),
    datasets: (__VLS_ctx.datasets),
    tables: (__VLS_ctx.TABLES),
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
let __VLS_70;
let __VLS_71;
let __VLS_72;
const __VLS_73 = {
    onColumnsChange: (...[$event]) => {
        __VLS_ctx.allColumns = $event;
    }
};
const __VLS_74 = {
    onDatasetChange: (...[$event]) => {
        __VLS_ctx.currentDataset = $event;
    }
};
const __VLS_75 = {
    onSaved: (__VLS_ctx.onCalculatedFieldSaved)
};
__VLS_69.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_69.slots;
    const [{ columns, loading, sourceGroups, canCreateField, createField, editField }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof ReportFieldWorkbench, typeof ReportFieldWorkbench, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(ReportFieldWorkbench, new ReportFieldWorkbench({
        ...{ 'onRemoveColumn': {} },
        ...{ 'onCreateField': {} },
        ...{ 'onEditField': {} },
        ref: "fieldWorkbenchRef",
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
        lookupEnabled: (__VLS_ctx.form.list_lookup.enabled),
        pushEnabled: (__VLS_ctx.reportPushEnabled),
        pushTargetCount: (__VLS_ctx.reportPushTargets.length),
        dimensionMergeRuleCount: (__VLS_ctx.form.dimension_merge_rules.length),
        dimensionMergePending: (__VLS_ctx.dimensionMergePending),
        isDataset: (__VLS_ctx.isDataset),
        canCreateField: (canCreateField),
    }));
    const __VLS_77 = __VLS_76({
        ...{ 'onRemoveColumn': {} },
        ...{ 'onCreateField': {} },
        ...{ 'onEditField': {} },
        ref: "fieldWorkbenchRef",
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
        lookupEnabled: (__VLS_ctx.form.list_lookup.enabled),
        pushEnabled: (__VLS_ctx.reportPushEnabled),
        pushTargetCount: (__VLS_ctx.reportPushTargets.length),
        dimensionMergeRuleCount: (__VLS_ctx.form.dimension_merge_rules.length),
        dimensionMergePending: (__VLS_ctx.dimensionMergePending),
        isDataset: (__VLS_ctx.isDataset),
        canCreateField: (canCreateField),
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    let __VLS_79;
    let __VLS_80;
    let __VLS_81;
    const __VLS_82 = {
        onRemoveColumn: (__VLS_ctx.removeSelectedColumn)
    };
    const __VLS_83 = {
        onCreateField: (createField)
    };
    const __VLS_84 = {
        onEditField: (editField)
    };
    /** @type {typeof __VLS_ctx.fieldWorkbenchRef} */ ;
    var __VLS_85 = {};
    __VLS_78.slots.default;
    {
        const { filters: __VLS_thisSlot } = __VLS_78.slots;
        /** @type {[typeof ReportFilterList, ]} */ ;
        // @ts-ignore
        const __VLS_87 = __VLS_asFunctionalComponent(ReportFilterList, new ReportFilterList({
            ref: "filterRef",
            filters: (__VLS_ctx.form.filters),
            filterLogic: (__VLS_ctx.form.filter_logic),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }));
        const __VLS_88 = __VLS_87({
            ref: "filterRef",
            filters: (__VLS_ctx.form.filters),
            filterLogic: (__VLS_ctx.form.filter_logic),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }, ...__VLS_functionalComponentArgsRest(__VLS_87));
        /** @type {typeof __VLS_ctx.filterRef} */ ;
        var __VLS_90 = {};
        var __VLS_89;
    }
    {
        const { merge: __VLS_thisSlot } = __VLS_78.slots;
        const [{ openTab }] = __VLS_getSlotParams(__VLS_thisSlot);
        /** @type {[typeof ReportDimensionMergeConfig, ]} */ ;
        // @ts-ignore
        const __VLS_92 = __VLS_asFunctionalComponent(ReportDimensionMergeConfig, new ReportDimensionMergeConfig({
            ...{ 'onOpenRules': {} },
            ...{ 'onOpenReshape': {} },
            modelValue: (__VLS_ctx.form.dimension_merge_rules),
            dimensions: (__VLS_ctx.selectedDimensions),
            datasetId: (__VLS_ctx.form.dataset_id || 0),
            scopeStrategy: (__VLS_ctx.form.scope_strategy),
            reportId: (__VLS_ctx.reportId),
            reportConfig: (__VLS_ctx.dimensionMergeReportConfig),
            aggregate: (__VLS_ctx.form.aggregate),
            structuralReshape: (__VLS_ctx.structuralReshapeEnabled),
            errors: (__VLS_ctx.dimensionMergeErrors),
        }));
        const __VLS_93 = __VLS_92({
            ...{ 'onOpenRules': {} },
            ...{ 'onOpenReshape': {} },
            modelValue: (__VLS_ctx.form.dimension_merge_rules),
            dimensions: (__VLS_ctx.selectedDimensions),
            datasetId: (__VLS_ctx.form.dataset_id || 0),
            scopeStrategy: (__VLS_ctx.form.scope_strategy),
            reportId: (__VLS_ctx.reportId),
            reportConfig: (__VLS_ctx.dimensionMergeReportConfig),
            aggregate: (__VLS_ctx.form.aggregate),
            structuralReshape: (__VLS_ctx.structuralReshapeEnabled),
            errors: (__VLS_ctx.dimensionMergeErrors),
        }, ...__VLS_functionalComponentArgsRest(__VLS_92));
        let __VLS_95;
        let __VLS_96;
        let __VLS_97;
        const __VLS_98 = {
            onOpenRules: (...[$event]) => {
                openTab('rules');
            }
        };
        const __VLS_99 = {
            onOpenReshape: (...[$event]) => {
                openTab('reshape');
            }
        };
        var __VLS_94;
    }
    {
        const { reshape: __VLS_thisSlot } = __VLS_78.slots;
        /** @type {[typeof ReportTransposeConfig, ]} */ ;
        // @ts-ignore
        const __VLS_100 = __VLS_asFunctionalComponent(ReportTransposeConfig, new ReportTransposeConfig({
            ref: "transposeRef",
            transpose: (__VLS_ctx.form.transpose),
            selectedDimensions: (__VLS_ctx.selectedDimensions),
            selectedMeasures: (__VLS_ctx.selectedMeasures),
            selectedColumns: (__VLS_ctx.selectedColsDetail),
        }));
        const __VLS_101 = __VLS_100({
            ref: "transposeRef",
            transpose: (__VLS_ctx.form.transpose),
            selectedDimensions: (__VLS_ctx.selectedDimensions),
            selectedMeasures: (__VLS_ctx.selectedMeasures),
            selectedColumns: (__VLS_ctx.selectedColsDetail),
        }, ...__VLS_functionalComponentArgsRest(__VLS_100));
        /** @type {typeof __VLS_ctx.transposeRef} */ ;
        var __VLS_103 = {};
        var __VLS_102;
    }
    {
        const { lookup: __VLS_thisSlot } = __VLS_78.slots;
        /** @type {[typeof ReportListLookupConfig, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(ReportListLookupConfig, new ReportListLookupConfig({
            listLookup: (__VLS_ctx.form.list_lookup),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }));
        const __VLS_106 = __VLS_105({
            listLookup: (__VLS_ctx.form.list_lookup),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    }
    {
        const { push: __VLS_thisSlot } = __VLS_78.slots;
        if (__VLS_ctx.saveCreatesReport) {
            const __VLS_108 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                type: "info",
                closable: (false),
                showIcon: true,
                title: "保存为你的报表后，可为该报表配置多个对外推送配置；从他人报表进入编辑时不会带入原报表推送配置。",
                ...{ style: {} },
            }));
            const __VLS_110 = __VLS_109({
                type: "info",
                closable: (false),
                showIcon: true,
                title: "保存为你的报表后，可为该报表配置多个对外推送配置；从他人报表进入编辑时不会带入原报表推送配置。",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        }
        else if (__VLS_ctx.reportPushSourceTable) {
            /** @type {[typeof PushTargetList, ]} */ ;
            // @ts-ignore
            const __VLS_112 = __VLS_asFunctionalComponent(PushTargetList, new PushTargetList({
                ...{ 'onTargetsChange': {} },
                sourceTable: (__VLS_ctx.reportPushSourceTable),
                sourceColumns: (__VLS_ctx.reportPushColumns),
                compact: true,
                hideHeader: true,
            }));
            const __VLS_113 = __VLS_112({
                ...{ 'onTargetsChange': {} },
                sourceTable: (__VLS_ctx.reportPushSourceTable),
                sourceColumns: (__VLS_ctx.reportPushColumns),
                compact: true,
                hideHeader: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_112));
            let __VLS_115;
            let __VLS_116;
            let __VLS_117;
            const __VLS_118 = {
                onTargetsChange: (...[$event]) => {
                    if (!!(__VLS_ctx.saveCreatesReport))
                        return;
                    if (!(__VLS_ctx.reportPushSourceTable))
                        return;
                    __VLS_ctx.reportPushTargets = $event;
                }
            };
            var __VLS_114;
        }
    }
    var __VLS_78;
}
var __VLS_69;
if (__VLS_ctx.previewItems.length || __VLS_ctx.previewTotal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    (__VLS_ctx.previewTotal);
    /** @type {[typeof ReportPreviewTable, ]} */ ;
    // @ts-ignore
    const __VLS_119 = __VLS_asFunctionalComponent(ReportPreviewTable, new ReportPreviewTable({
        ...{ 'onUpdate:page': {} },
        ...{ 'onUpdate:pageSize': {} },
        ...{ 'onPageChange': {} },
        columns: (__VLS_ctx.previewColumns),
        items: (__VLS_ctx.previewItems),
        total: (__VLS_ctx.previewTotal),
        page: (__VLS_ctx.previewPage),
        pageSize: (__VLS_ctx.previewPageSize),
        loading: (__VLS_ctx.previewing),
        columnSettings: (__VLS_ctx.form.column_settings),
    }));
    const __VLS_120 = __VLS_119({
        ...{ 'onUpdate:page': {} },
        ...{ 'onUpdate:pageSize': {} },
        ...{ 'onPageChange': {} },
        columns: (__VLS_ctx.previewColumns),
        items: (__VLS_ctx.previewItems),
        total: (__VLS_ctx.previewTotal),
        page: (__VLS_ctx.previewPage),
        pageSize: (__VLS_ctx.previewPageSize),
        loading: (__VLS_ctx.previewing),
        columnSettings: (__VLS_ctx.form.column_settings),
    }, ...__VLS_functionalComponentArgsRest(__VLS_119));
    let __VLS_122;
    let __VLS_123;
    let __VLS_124;
    const __VLS_125 = {
        'onUpdate:page': (...[$event]) => {
            if (!(__VLS_ctx.previewItems.length || __VLS_ctx.previewTotal))
                return;
            __VLS_ctx.previewPage = $event;
        }
    };
    const __VLS_126 = {
        'onUpdate:pageSize': (...[$event]) => {
            if (!(__VLS_ctx.previewItems.length || __VLS_ctx.previewTotal))
                return;
            __VLS_ctx.previewPageSize = $event;
        }
    };
    const __VLS_127 = {
        onPageChange: (__VLS_ctx.preview)
    };
    var __VLS_121;
}
var __VLS_66;
var __VLS_2;
const __VLS_128 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    modelValue: (__VLS_ctx.basicSettingsOpen),
    title: "报表基础设置",
    size: "min(720px, 92vw)",
    appendToBody: true,
    ...{ class: "report-settings-drawer" },
}));
const __VLS_130 = __VLS_129({
    modelValue: (__VLS_ctx.basicSettingsOpen),
    title: "报表基础设置",
    size: "min(720px, 92vw)",
    appendToBody: true,
    ...{ class: "report-settings-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    labelPosition: "top",
}));
const __VLS_134 = __VLS_133({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
/** @type {[typeof ReportBasicInfo, ]} */ ;
// @ts-ignore
const __VLS_136 = __VLS_asFunctionalComponent(ReportBasicInfo, new ReportBasicInfo({
    ...{ 'onDatasetChange': {} },
    name: (__VLS_ctx.form.name),
    description: (__VLS_ctx.form.description),
    datasetId: (__VLS_ctx.form.dataset_id),
    visibility: (__VLS_ctx.form.visibility),
    scopeStrategy: (__VLS_ctx.form.scope_strategy),
    acl: (__VLS_ctx.form.acl),
    datasets: (__VLS_ctx.datasets),
    currentDataset: (__VLS_ctx.currentDataset),
}));
const __VLS_137 = __VLS_136({
    ...{ 'onDatasetChange': {} },
    name: (__VLS_ctx.form.name),
    description: (__VLS_ctx.form.description),
    datasetId: (__VLS_ctx.form.dataset_id),
    visibility: (__VLS_ctx.form.visibility),
    scopeStrategy: (__VLS_ctx.form.scope_strategy),
    acl: (__VLS_ctx.form.acl),
    datasets: (__VLS_ctx.datasets),
    currentDataset: (__VLS_ctx.currentDataset),
}, ...__VLS_functionalComponentArgsRest(__VLS_136));
let __VLS_139;
let __VLS_140;
let __VLS_141;
const __VLS_142 = {
    onDatasetChange: (__VLS_ctx.onDatasetChange)
};
var __VLS_138;
const __VLS_143 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
    label: "质量检查期间字段",
}));
const __VLS_145 = __VLS_144({
    label: "质量检查期间字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_144));
__VLS_146.slots.default;
const __VLS_147 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
    modelValue: (__VLS_ctx.form.quality_period_field),
    clearable: true,
    filterable: true,
    placeholder: "仅受治理报表需要配置",
    ...{ style: {} },
}));
const __VLS_149 = __VLS_148({
    modelValue: (__VLS_ctx.form.quality_period_field),
    clearable: true,
    filterable: true,
    placeholder: "仅受治理报表需要配置",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_148));
__VLS_150.slots.default;
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.allColumns))) {
    const __VLS_151 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
        key: (column.code),
        label: (column.label || column.code),
        value: (column.code),
    }));
    const __VLS_153 = __VLS_152({
        key: (column.code),
        label: (column.label || column.code),
        value: (column.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_152));
}
var __VLS_150;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
var __VLS_146;
var __VLS_135;
var __VLS_131;
const __VLS_155 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
    modelValue: (__VLS_ctx.explainOpen),
    title: "AI 报表助手",
    size: "min(640px, 92vw)",
    appendToBody: true,
    ...{ class: "report-ai-drawer" },
}));
const __VLS_157 = __VLS_156({
    modelValue: (__VLS_ctx.explainOpen),
    title: "AI 报表助手",
    size: "min(640px, 92vw)",
    appendToBody: true,
    ...{ class: "report-ai-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_156));
__VLS_158.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "report-ai-chat" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "ai-drawer-intro" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "explainScrollRef",
    ...{ class: "report-chat-thread" },
});
/** @type {typeof __VLS_ctx.explainScrollRef} */ ;
if (!__VLS_ctx.explainMessages.length && !__VLS_ctx.explaining) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-empty" },
    });
}
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.explainMessages))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.id),
        ...{ class: "chat-message" },
        ...{ class: (item.role) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-bubble" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-content" },
    });
    (item.content);
    if (item.traceId) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "trace-line" },
        });
        (item.traceId);
    }
}
if (__VLS_ctx.explaining) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-message assistant" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-bubble" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ai-send-box" },
});
const __VLS_159 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
    ...{ 'onKeydown': {} },
    modelValue: (__VLS_ctx.explainInput),
    ...{ class: "ai-send-input" },
    type: "textarea",
    autosize: ({ minRows: 1, maxRows: 3 }),
    resize: "none",
    placeholder: "继续追问，例如：这个报表的筛选条件是什么意思？",
}));
const __VLS_161 = __VLS_160({
    ...{ 'onKeydown': {} },
    modelValue: (__VLS_ctx.explainInput),
    ...{ class: "ai-send-input" },
    type: "textarea",
    autosize: ({ minRows: 1, maxRows: 3 }),
    resize: "none",
    placeholder: "继续追问，例如：这个报表的筛选条件是什么意思？",
}, ...__VLS_functionalComponentArgsRest(__VLS_160));
let __VLS_163;
let __VLS_164;
let __VLS_165;
const __VLS_166 = {
    onKeydown: (__VLS_ctx.handleExplainKeydown)
};
var __VLS_162;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ai-send-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "send-hint" },
});
const __VLS_167 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({
    ...{ 'onClick': {} },
    ...{ class: "send-icon-button" },
    type: "primary",
    circle: true,
    loading: (__VLS_ctx.explaining),
}));
const __VLS_169 = __VLS_168({
    ...{ 'onClick': {} },
    ...{ class: "send-icon-button" },
    type: "primary",
    circle: true,
    loading: (__VLS_ctx.explaining),
}, ...__VLS_functionalComponentArgsRest(__VLS_168));
let __VLS_171;
let __VLS_172;
let __VLS_173;
const __VLS_174 = {
    onClick: (__VLS_ctx.sendExplainInput)
};
__VLS_170.slots.default;
const __VLS_175 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_176 = __VLS_asFunctionalComponent(__VLS_175, new __VLS_175({}));
const __VLS_177 = __VLS_176({}, ...__VLS_functionalComponentArgsRest(__VLS_176));
__VLS_178.slots.default;
const __VLS_179 = {}.Position;
/** @type {[typeof __VLS_components.Position, ]} */ ;
// @ts-ignore
const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({}));
const __VLS_181 = __VLS_180({}, ...__VLS_functionalComponentArgsRest(__VLS_180));
var __VLS_178;
var __VLS_170;
if (__VLS_ctx.explainResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "explain-metrics" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.explainResult.field_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.explainResult.filter_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.explainResult.sort_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.explainResult.aggregation_count);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_183 = {}.ElCollapse;
    /** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
    // @ts-ignore
    const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({}));
    const __VLS_185 = __VLS_184({}, ...__VLS_functionalComponentArgsRest(__VLS_184));
    __VLS_186.slots.default;
    const __VLS_187 = {}.ElCollapseItem;
    /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
    // @ts-ignore
    const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
        title: "配置上下文",
        name: "context",
    }));
    const __VLS_189 = __VLS_188({
        title: "配置上下文",
        name: "context",
    }, ...__VLS_functionalComponentArgsRest(__VLS_188));
    __VLS_190.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "explain-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "explain-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tag-list" },
    });
    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.explainResult.visible_fields))) {
        const __VLS_191 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
            key: (field),
            size: "small",
            effect: "plain",
        }));
        const __VLS_193 = __VLS_192({
            key: (field),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_192));
        __VLS_194.slots.default;
        (field);
        var __VLS_194;
    }
    if (__VLS_ctx.explainResult.warnings.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "explain-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "explain-title" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.explainResult.warnings))) {
            const __VLS_195 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                key: (item),
                title: (item),
                type: "warning",
                showIcon: true,
                closable: (false),
                ...{ class: "warning-item" },
            }));
            const __VLS_197 = __VLS_196({
                key: (item),
                title: (item),
                type: "warning",
                showIcon: true,
                closable: (false),
                ...{ class: "warning-item" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_196));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "explain-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "explain-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "context-json" },
    });
    (JSON.stringify(__VLS_ctx.explainResult.context_packet, null, 2));
    var __VLS_190;
    var __VLS_186;
}
var __VLS_158;
/** @type {__VLS_StyleScopedClasses['designer-form']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['report-settings-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['report-ai-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['report-ai-chat']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-drawer-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['report-chat-thread']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-content']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-line']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-box']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['send-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['send-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-section']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-section']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-title']} */ ;
/** @type {__VLS_StyleScopedClasses['warning-item']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-section']} */ ;
/** @type {__VLS_StyleScopedClasses['explain-title']} */ ;
/** @type {__VLS_StyleScopedClasses['context-json']} */ ;
// @ts-ignore
var __VLS_86 = __VLS_85, __VLS_91 = __VLS_90, __VLS_104 = __VLS_103;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            View: View,
            Check: Check,
            MagicStick: MagicStick,
            Position: Position,
            FullscreenWorkspaceShell: FullscreenWorkspaceShell,
            CalculatedFieldBridge: CalculatedFieldBridge,
            ReportBasicInfo: ReportBasicInfo,
            ReportFieldWorkbench: ReportFieldWorkbench,
            ReportDimensionMergeConfig: ReportDimensionMergeConfig,
            ReportFilterList: ReportFilterList,
            ReportListLookupConfig: ReportListLookupConfig,
            ReportTransposeConfig: ReportTransposeConfig,
            ReportPreviewTable: ReportPreviewTable,
            PushTargetList: PushTargetList,
            TABLES: TABLES,
            router: router,
            reportListTarget: reportListTarget,
            reportId: reportId,
            saveCreatesReport: saveCreatesReport,
            pageTitle: pageTitle,
            form: form,
            removeSelectedColumn: removeSelectedColumn,
            allColumns: allColumns,
            datasets: datasets,
            currentDataset: currentDataset,
            saving: saving,
            previewing: previewing,
            explaining: explaining,
            explainOpen: explainOpen,
            explainResult: explainResult,
            explainInput: explainInput,
            explainScrollRef: explainScrollRef,
            previewColumns: previewColumns,
            previewItems: previewItems,
            previewTotal: previewTotal,
            previewPage: previewPage,
            previewPageSize: previewPageSize,
            dimensionMergeErrors: dimensionMergeErrors,
            reportPushSourceTable: reportPushSourceTable,
            reportPushColumns: reportPushColumns,
            reportPushTargets: reportPushTargets,
            reportPushEnabled: reportPushEnabled,
            basicSettingsOpen: basicSettingsOpen,
            currentDatasetName: currentDatasetName,
            publishStatusLabel: publishStatusLabel,
            filterSummary: filterSummary,
            fieldWorkbenchRef: fieldWorkbenchRef,
            transposeRef: transposeRef,
            filterRef: filterRef,
            explainMessages: explainMessages,
            selectedColsDetail: selectedColsDetail,
            selectedDimensions: selectedDimensions,
            selectedMeasures: selectedMeasures,
            structuralReshapeEnabled: structuralReshapeEnabled,
            dimensionMergePending: dimensionMergePending,
            dimensionMergeReportConfig: dimensionMergeReportConfig,
            isDataset: isDataset,
            onDatasetChange: onDatasetChange,
            onCalculatedFieldSaved: onCalculatedFieldSaved,
            save: save,
            preview: preview,
            explainConfig: explainConfig,
            sendExplainInput: sendExplainInput,
            handleExplainKeydown: handleExplainKeydown,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
