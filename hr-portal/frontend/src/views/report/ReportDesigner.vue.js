/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, View, Check, MagicStick, Position } from '@element-plus/icons-vue';
import CalculatedFieldBridge from '@/components/formula/CalculatedFieldBridge.vue';
import ReportBasicInfo from '@/components/report/ReportBasicInfo.vue';
import ReportFieldWorkbench from '@/components/report/ReportFieldWorkbench.vue';
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
    saving.value = true;
    try {
        if (form.transpose.enabled && form.transpose.rules?.length)
            await transposeRef.value?.ensureCcMaster();
        const payload = buildPayload();
        if (saveCreatesReport.value) {
            const r = await reportsApi.create(payload);
            ElMessage.success(isCopyMode.value ? '已另存为你的报表' : '已创建');
            router.replace(`/report/designer/${r.id}`);
        }
        else {
            await reportsApi.update(reportId.value, payload);
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
        ElMessage.error(e?.response?.data?.detail || '预览失败');
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
/** @type {__VLS_StyleScopedClasses['designer-card']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-header']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-actions']} */ ;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "designer-page" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "designer-card" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "designer-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "designer-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "designer-title-wrap" },
    });
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "back-button" },
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "back-button" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (...[$event]) => {
            __VLS_ctx.router.push('/report/list');
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "designer-title-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "designer-title" },
    });
    (__VLS_ctx.pageTitle);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "designer-subtitle" },
    });
    (__VLS_ctx.currentDatasetName);
    (__VLS_ctx.publishStatusLabel);
    (__VLS_ctx.form.selected_codes.length);
    (__VLS_ctx.filterSummary);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "designer-actions" },
    });
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            __VLS_ctx.basicSettingsOpen = true;
        }
    };
    __VLS_23.slots.default;
    var __VLS_23;
    const __VLS_28 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.explaining),
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.explaining),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (__VLS_ctx.explainConfig)
    };
    __VLS_31.slots.default;
    const __VLS_36 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ style: {} },
    }));
    const __VLS_38 = __VLS_37({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    const __VLS_40 = {}.MagicStick;
    /** @type {[typeof __VLS_components.MagicStick, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
    var __VLS_39;
    var __VLS_31;
    const __VLS_44 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewing),
        disabled: (__VLS_ctx.saveCreatesReport),
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewing),
        disabled: (__VLS_ctx.saveCreatesReport),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (__VLS_ctx.preview)
    };
    __VLS_47.slots.default;
    const __VLS_52 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ style: {} },
    }));
    const __VLS_54 = __VLS_53({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.View;
    /** @type {[typeof __VLS_components.View, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    var __VLS_55;
    var __VLS_47;
    const __VLS_60 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_63.slots.default;
    const __VLS_68 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        ...{ style: {} },
    }));
    const __VLS_70 = __VLS_69({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    const __VLS_72 = {}.Check;
    /** @type {[typeof __VLS_components.Check, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
    const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
    var __VLS_71;
    var __VLS_63;
}
const __VLS_76 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    labelPosition: "top",
    ...{ class: "designer-form" },
}));
const __VLS_78 = __VLS_77({
    labelPosition: "top",
    ...{ class: "designer-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title compact-section-title" },
});
(__VLS_ctx.form.selected_codes.length);
/** @type {[typeof CalculatedFieldBridge, typeof CalculatedFieldBridge, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(CalculatedFieldBridge, new CalculatedFieldBridge({
    ...{ 'onColumnsChange': {} },
    ...{ 'onDatasetChange': {} },
    ...{ 'onSaved': {} },
    datasetId: (__VLS_ctx.form.dataset_id),
    datasets: (__VLS_ctx.datasets),
    tables: (__VLS_ctx.TABLES),
}));
const __VLS_81 = __VLS_80({
    ...{ 'onColumnsChange': {} },
    ...{ 'onDatasetChange': {} },
    ...{ 'onSaved': {} },
    datasetId: (__VLS_ctx.form.dataset_id),
    datasets: (__VLS_ctx.datasets),
    tables: (__VLS_ctx.TABLES),
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
let __VLS_83;
let __VLS_84;
let __VLS_85;
const __VLS_86 = {
    onColumnsChange: (...[$event]) => {
        __VLS_ctx.allColumns = $event;
    }
};
const __VLS_87 = {
    onDatasetChange: (...[$event]) => {
        __VLS_ctx.currentDataset = $event;
    }
};
const __VLS_88 = {
    onSaved: (__VLS_ctx.onCalculatedFieldSaved)
};
__VLS_82.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_82.slots;
    const [{ columns, loading, sourceGroups, canCreateField, createField, editField }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof ReportFieldWorkbench, typeof ReportFieldWorkbench, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(ReportFieldWorkbench, new ReportFieldWorkbench({
        ...{ 'onRemoveColumn': {} },
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
        lookupEnabled: (__VLS_ctx.form.list_lookup.enabled),
        pushEnabled: (__VLS_ctx.reportPushEnabled),
        pushTargetCount: (__VLS_ctx.reportPushTargets.length),
        isDataset: (__VLS_ctx.isDataset),
        canCreateField: (canCreateField),
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onRemoveColumn': {} },
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
        lookupEnabled: (__VLS_ctx.form.list_lookup.enabled),
        pushEnabled: (__VLS_ctx.reportPushEnabled),
        pushTargetCount: (__VLS_ctx.reportPushTargets.length),
        isDataset: (__VLS_ctx.isDataset),
        canCreateField: (canCreateField),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onRemoveColumn: (__VLS_ctx.removeSelectedColumn)
    };
    const __VLS_96 = {
        onCreateField: (createField)
    };
    const __VLS_97 = {
        onEditField: (editField)
    };
    __VLS_91.slots.default;
    {
        const { filters: __VLS_thisSlot } = __VLS_91.slots;
        /** @type {[typeof ReportFilterList, ]} */ ;
        // @ts-ignore
        const __VLS_98 = __VLS_asFunctionalComponent(ReportFilterList, new ReportFilterList({
            ref: "filterRef",
            filters: (__VLS_ctx.form.filters),
            filterLogic: (__VLS_ctx.form.filter_logic),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }));
        const __VLS_99 = __VLS_98({
            ref: "filterRef",
            filters: (__VLS_ctx.form.filters),
            filterLogic: (__VLS_ctx.form.filter_logic),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }, ...__VLS_functionalComponentArgsRest(__VLS_98));
        /** @type {typeof __VLS_ctx.filterRef} */ ;
        var __VLS_101 = {};
        var __VLS_100;
    }
    {
        const { reshape: __VLS_thisSlot } = __VLS_91.slots;
        /** @type {[typeof ReportTransposeConfig, ]} */ ;
        // @ts-ignore
        const __VLS_103 = __VLS_asFunctionalComponent(ReportTransposeConfig, new ReportTransposeConfig({
            ref: "transposeRef",
            transpose: (__VLS_ctx.form.transpose),
            selectedDimensions: (__VLS_ctx.selectedDimensions),
            selectedMeasures: (__VLS_ctx.selectedMeasures),
            selectedColumns: (__VLS_ctx.selectedColsDetail),
        }));
        const __VLS_104 = __VLS_103({
            ref: "transposeRef",
            transpose: (__VLS_ctx.form.transpose),
            selectedDimensions: (__VLS_ctx.selectedDimensions),
            selectedMeasures: (__VLS_ctx.selectedMeasures),
            selectedColumns: (__VLS_ctx.selectedColsDetail),
        }, ...__VLS_functionalComponentArgsRest(__VLS_103));
        /** @type {typeof __VLS_ctx.transposeRef} */ ;
        var __VLS_106 = {};
        var __VLS_105;
    }
    {
        const { lookup: __VLS_thisSlot } = __VLS_91.slots;
        /** @type {[typeof ReportListLookupConfig, ]} */ ;
        // @ts-ignore
        const __VLS_108 = __VLS_asFunctionalComponent(ReportListLookupConfig, new ReportListLookupConfig({
            listLookup: (__VLS_ctx.form.list_lookup),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }));
        const __VLS_109 = __VLS_108({
            listLookup: (__VLS_ctx.form.list_lookup),
            allColumns: (__VLS_ctx.allColumns),
            currentDatasetTables: (__VLS_ctx.currentDataset?.tables),
        }, ...__VLS_functionalComponentArgsRest(__VLS_108));
    }
    {
        const { push: __VLS_thisSlot } = __VLS_91.slots;
        if (__VLS_ctx.saveCreatesReport) {
            const __VLS_111 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
                type: "info",
                closable: (false),
                showIcon: true,
                title: "保存为你的报表后，可为该报表配置多个对外推送配置；从他人报表进入编辑时不会带入原报表推送配置。",
                ...{ style: {} },
            }));
            const __VLS_113 = __VLS_112({
                type: "info",
                closable: (false),
                showIcon: true,
                title: "保存为你的报表后，可为该报表配置多个对外推送配置；从他人报表进入编辑时不会带入原报表推送配置。",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_112));
        }
        else if (__VLS_ctx.reportPushSourceTable) {
            /** @type {[typeof PushTargetList, ]} */ ;
            // @ts-ignore
            const __VLS_115 = __VLS_asFunctionalComponent(PushTargetList, new PushTargetList({
                ...{ 'onTargetsChange': {} },
                sourceTable: (__VLS_ctx.reportPushSourceTable),
                sourceColumns: (__VLS_ctx.reportPushColumns),
                compact: true,
                hideHeader: true,
            }));
            const __VLS_116 = __VLS_115({
                ...{ 'onTargetsChange': {} },
                sourceTable: (__VLS_ctx.reportPushSourceTable),
                sourceColumns: (__VLS_ctx.reportPushColumns),
                compact: true,
                hideHeader: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_115));
            let __VLS_118;
            let __VLS_119;
            let __VLS_120;
            const __VLS_121 = {
                onTargetsChange: (...[$event]) => {
                    if (!!(__VLS_ctx.saveCreatesReport))
                        return;
                    if (!(__VLS_ctx.reportPushSourceTable))
                        return;
                    __VLS_ctx.reportPushTargets = $event;
                }
            };
            var __VLS_117;
        }
    }
    var __VLS_91;
}
var __VLS_82;
if (__VLS_ctx.previewItems.length || __VLS_ctx.previewTotal) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    (__VLS_ctx.previewTotal);
    /** @type {[typeof ReportPreviewTable, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(ReportPreviewTable, new ReportPreviewTable({
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
    const __VLS_123 = __VLS_122({
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
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
    let __VLS_125;
    let __VLS_126;
    let __VLS_127;
    const __VLS_128 = {
        'onUpdate:page': (...[$event]) => {
            if (!(__VLS_ctx.previewItems.length || __VLS_ctx.previewTotal))
                return;
            __VLS_ctx.previewPage = $event;
        }
    };
    const __VLS_129 = {
        'onUpdate:pageSize': (...[$event]) => {
            if (!(__VLS_ctx.previewItems.length || __VLS_ctx.previewTotal))
                return;
            __VLS_ctx.previewPageSize = $event;
        }
    };
    const __VLS_130 = {
        onPageChange: (__VLS_ctx.preview)
    };
    var __VLS_124;
}
var __VLS_79;
var __VLS_3;
const __VLS_131 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
    modelValue: (__VLS_ctx.basicSettingsOpen),
    title: "报表基础设置",
    size: "min(720px, 92vw)",
    appendToBody: true,
    ...{ class: "report-settings-drawer" },
}));
const __VLS_133 = __VLS_132({
    modelValue: (__VLS_ctx.basicSettingsOpen),
    title: "报表基础设置",
    size: "min(720px, 92vw)",
    appendToBody: true,
    ...{ class: "report-settings-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_132));
__VLS_134.slots.default;
const __VLS_135 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
    labelPosition: "top",
}));
const __VLS_137 = __VLS_136({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_136));
__VLS_138.slots.default;
/** @type {[typeof ReportBasicInfo, ]} */ ;
// @ts-ignore
const __VLS_139 = __VLS_asFunctionalComponent(ReportBasicInfo, new ReportBasicInfo({
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
const __VLS_140 = __VLS_139({
    ...{ 'onDatasetChange': {} },
    name: (__VLS_ctx.form.name),
    description: (__VLS_ctx.form.description),
    datasetId: (__VLS_ctx.form.dataset_id),
    visibility: (__VLS_ctx.form.visibility),
    scopeStrategy: (__VLS_ctx.form.scope_strategy),
    acl: (__VLS_ctx.form.acl),
    datasets: (__VLS_ctx.datasets),
    currentDataset: (__VLS_ctx.currentDataset),
}, ...__VLS_functionalComponentArgsRest(__VLS_139));
let __VLS_142;
let __VLS_143;
let __VLS_144;
const __VLS_145 = {
    onDatasetChange: (__VLS_ctx.onDatasetChange)
};
var __VLS_141;
const __VLS_146 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
    label: "质量检查期间字段",
}));
const __VLS_148 = __VLS_147({
    label: "质量检查期间字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_147));
__VLS_149.slots.default;
const __VLS_150 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
    modelValue: (__VLS_ctx.form.quality_period_field),
    clearable: true,
    filterable: true,
    placeholder: "仅受治理报表需要配置",
    ...{ style: {} },
}));
const __VLS_152 = __VLS_151({
    modelValue: (__VLS_ctx.form.quality_period_field),
    clearable: true,
    filterable: true,
    placeholder: "仅受治理报表需要配置",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_151));
__VLS_153.slots.default;
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.allColumns))) {
    const __VLS_154 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
        key: (column.code),
        label: (column.label || column.code),
        value: (column.code),
    }));
    const __VLS_156 = __VLS_155({
        key: (column.code),
        label: (column.label || column.code),
        value: (column.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_155));
}
var __VLS_153;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
var __VLS_149;
var __VLS_138;
var __VLS_134;
const __VLS_158 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    modelValue: (__VLS_ctx.explainOpen),
    title: "AI 报表助手",
    size: "min(640px, 92vw)",
    appendToBody: true,
    ...{ class: "report-ai-drawer" },
}));
const __VLS_160 = __VLS_159({
    modelValue: (__VLS_ctx.explainOpen),
    title: "AI 报表助手",
    size: "min(640px, 92vw)",
    appendToBody: true,
    ...{ class: "report-ai-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
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
const __VLS_162 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
    ...{ 'onKeydown': {} },
    modelValue: (__VLS_ctx.explainInput),
    ...{ class: "ai-send-input" },
    type: "textarea",
    autosize: ({ minRows: 1, maxRows: 3 }),
    resize: "none",
    placeholder: "继续追问，例如：这个报表的筛选条件是什么意思？",
}));
const __VLS_164 = __VLS_163({
    ...{ 'onKeydown': {} },
    modelValue: (__VLS_ctx.explainInput),
    ...{ class: "ai-send-input" },
    type: "textarea",
    autosize: ({ minRows: 1, maxRows: 3 }),
    resize: "none",
    placeholder: "继续追问，例如：这个报表的筛选条件是什么意思？",
}, ...__VLS_functionalComponentArgsRest(__VLS_163));
let __VLS_166;
let __VLS_167;
let __VLS_168;
const __VLS_169 = {
    onKeydown: (__VLS_ctx.handleExplainKeydown)
};
var __VLS_165;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ai-send-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "send-hint" },
});
const __VLS_170 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    ...{ 'onClick': {} },
    ...{ class: "send-icon-button" },
    type: "primary",
    circle: true,
    loading: (__VLS_ctx.explaining),
}));
const __VLS_172 = __VLS_171({
    ...{ 'onClick': {} },
    ...{ class: "send-icon-button" },
    type: "primary",
    circle: true,
    loading: (__VLS_ctx.explaining),
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
let __VLS_174;
let __VLS_175;
let __VLS_176;
const __VLS_177 = {
    onClick: (__VLS_ctx.sendExplainInput)
};
__VLS_173.slots.default;
const __VLS_178 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({}));
const __VLS_180 = __VLS_179({}, ...__VLS_functionalComponentArgsRest(__VLS_179));
__VLS_181.slots.default;
const __VLS_182 = {}.Position;
/** @type {[typeof __VLS_components.Position, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({}));
const __VLS_184 = __VLS_183({}, ...__VLS_functionalComponentArgsRest(__VLS_183));
var __VLS_181;
var __VLS_173;
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
    const __VLS_186 = {}.ElCollapse;
    /** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
    // @ts-ignore
    const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({}));
    const __VLS_188 = __VLS_187({}, ...__VLS_functionalComponentArgsRest(__VLS_187));
    __VLS_189.slots.default;
    const __VLS_190 = {}.ElCollapseItem;
    /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
    // @ts-ignore
    const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
        title: "配置上下文",
        name: "context",
    }));
    const __VLS_192 = __VLS_191({
        title: "配置上下文",
        name: "context",
    }, ...__VLS_functionalComponentArgsRest(__VLS_191));
    __VLS_193.slots.default;
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
        const __VLS_194 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
            key: (field),
            size: "small",
            effect: "plain",
        }));
        const __VLS_196 = __VLS_195({
            key: (field),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_195));
        __VLS_197.slots.default;
        (field);
        var __VLS_197;
    }
    if (__VLS_ctx.explainResult.warnings.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "explain-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "explain-title" },
        });
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.explainResult.warnings))) {
            const __VLS_198 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
                key: (item),
                title: (item),
                type: "warning",
                showIcon: true,
                closable: (false),
                ...{ class: "warning-item" },
            }));
            const __VLS_200 = __VLS_199({
                key: (item),
                title: (item),
                type: "warning",
                showIcon: true,
                closable: (false),
                ...{ class: "warning-item" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_199));
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
    var __VLS_193;
    var __VLS_189;
}
var __VLS_161;
/** @type {__VLS_StyleScopedClasses['designer-page']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-card']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-header']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-title-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['back-button']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-title-block']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-title']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-actions']} */ ;
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
var __VLS_102 = __VLS_101, __VLS_107 = __VLS_106;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            View: View,
            Check: Check,
            MagicStick: MagicStick,
            Position: Position,
            CalculatedFieldBridge: CalculatedFieldBridge,
            ReportBasicInfo: ReportBasicInfo,
            ReportFieldWorkbench: ReportFieldWorkbench,
            ReportFilterList: ReportFilterList,
            ReportListLookupConfig: ReportListLookupConfig,
            ReportTransposeConfig: ReportTransposeConfig,
            ReportPreviewTable: ReportPreviewTable,
            PushTargetList: PushTargetList,
            TABLES: TABLES,
            router: router,
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
            reportPushSourceTable: reportPushSourceTable,
            reportPushColumns: reportPushColumns,
            reportPushTargets: reportPushTargets,
            reportPushEnabled: reportPushEnabled,
            basicSettingsOpen: basicSettingsOpen,
            currentDatasetName: currentDatasetName,
            publishStatusLabel: publishStatusLabel,
            filterSummary: filterSummary,
            transposeRef: transposeRef,
            filterRef: filterRef,
            explainMessages: explainMessages,
            selectedColsDetail: selectedColsDetail,
            selectedDimensions: selectedDimensions,
            selectedMeasures: selectedMeasures,
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
