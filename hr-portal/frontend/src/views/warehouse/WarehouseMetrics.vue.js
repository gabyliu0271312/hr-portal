/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useUserStore } from '@/stores/user';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search, Refresh, Edit, Finished, FolderDelete, TrendCharts, VideoPlay, Loading } from '@element-plus/icons-vue';
import { listMetrics, createMetric, updateMetric, getMetric, publishMetric, archiveMetric, computeMetric, recalcMetric, listMetricResults, listMetricRuns, listModels, listDwsAggregates, getMetricExplain, METRIC_RUN_STATUS_LABELS, } from '@/api/warehouse';
import { decomposeFormula, batchSaveMetricComponents, listMetricComponents, COMPONENT_ROLE_LABELS, } from '@/api/warehouse';
import { compileFormula } from '@/api/warehouse';
import { getMetricLineage, getMetricDownstreamRefs, getMetricResultDetail, exportMetricResult, recordExportAudit, recordAiExplainAudit, } from '@/api/warehouse';
import { dataApi } from '@/api/data';
import { datasetsApi } from '@/api/datasets';
import MetricAutomationPanel from '@/components/warehouse/MetricAutomationPanel.vue';
import FormulaFieldEditor from '@/components/formula/FormulaFieldEditor.vue';
const userStore = useUserStore();
const metrics = ref([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const keyword = ref('');
const statusFilter = ref('');
const TYPE_LABELS = { count: '计数', sum: '求和', ratio: '比率', derived: '派生', text: '文本' };
const TYPE_TAG = { count: '', sum: 'success', ratio: 'warning', derived: 'info', text: 'info' };
const metricTypeLabel = computed(() => TYPE_LABELS[form.value.metric_type || 'derived'] || '派生');
const metricTypeTagType = computed(() => TYPE_TAG[form.value.metric_type || 'derived'] || 'info');
const STATUS_LABELS = { draft: '草稿', published: '已发布', archived: '已归档' };
const STATUS_TAG = { draft: 'info', published: 'success', archived: 'info' };
// 详情面板（R0303）
const detailVisible = ref(false);
const detailMetricId = ref(null);
const detailMetric = ref(null);
const results = ref([]);
const runs = ref([]);
const resultsLoading = ref(false);
const runsLoading = ref(false);
const computePeriod = ref('');
const computing = ref(false);
// MR0301: 指标解释上下文
const explainContext = ref(null);
const explainLoading = ref(false);
// MR0303: 指标血缘图
const lineageGraph = ref(null);
const lineageLoading = ref(false);
// MR0304: 下游引用列表
const downstreamRefs = ref(null);
const downstreamRefsLoading = ref(false);
// MR0306: 结果明细权限态 + MR0101 分页
const resultDetail = ref(null);
const resultDetailLoading = ref(false);
const detailPage = ref(1);
const detailPageSize = ref(50);
const currentDetailResultId = ref(null);
const currentDetailPeriod = ref('');
const exporting = ref(false);
// MR0103/0104: 从 dimension_values / measure_values 动态解析列
const detailDimCols = computed(() => {
    const rd = resultDetail.value;
    if (!rd)
        return [];
    if (rd.dimensions?.length)
        return rd.dimensions;
    const first = rd.rows?.[0];
    return first ? Object.keys(first.dimension_values || {}) : [];
});
const detailMeasCols = computed(() => {
    const rd = resultDetail.value;
    if (!rd)
        return [];
    if (rd.measures?.length)
        return rd.measures;
    const first = rd.rows?.[0];
    return first ? Object.keys(first.measure_values || {}) : [];
});
async function load() {
    loading.value = true;
    try {
        const params = { page: page.value, page_size: pageSize.value };
        if (keyword.value)
            params.keyword = keyword.value;
        if (statusFilter.value)
            params.status = statusFilter.value;
        const res = await listMetrics(params);
        metrics.value = res.items;
        total.value = res.total;
    }
    catch {
        ElMessage.error('加载指标列表失败');
    }
    finally {
        loading.value = false;
    }
}
async function openDetail(id) {
    clearPollTimer();
    lastComputeStatus.value = null;
    lastComputeError.value = null;
    computedResult.value = null;
    lineageGraph.value = null;
    downstreamRefs.value = null;
    resultDetail.value = null;
    detailMetricId.value = id;
    detailVisible.value = true;
    try {
        detailMetric.value = await getMetric(id);
    }
    catch {
        ElMessage.error('加载指标详情失败');
        return;
    }
    loadResults();
    loadRuns();
    loadExplainContext(id);
    loadLineage(id);
    loadDownstreamRefs(id);
}
async function loadExplainContext(id, period) {
    explainLoading.value = true;
    try {
        explainContext.value = await getMetricExplain(id, period);
    }
    catch {
        explainContext.value = null;
    }
    finally {
        explainLoading.value = false;
    }
}
async function loadLineage(id) {
    lineageLoading.value = true;
    try {
        lineageGraph.value = await getMetricLineage(id);
    }
    catch {
        lineageGraph.value = null;
    }
    finally {
        lineageLoading.value = false;
    }
}
async function loadDownstreamRefs(id) {
    downstreamRefsLoading.value = true;
    try {
        downstreamRefs.value = await getMetricDownstreamRefs(id);
    }
    catch {
        downstreamRefs.value = null;
    }
    finally {
        downstreamRefsLoading.value = false;
    }
}
async function loadResultDetail(metricId, resultId, period) {
    currentDetailResultId.value = resultId;
    currentDetailPeriod.value = period;
    resultDetailLoading.value = true;
    try {
        resultDetail.value = await getMetricResultDetail(metricId, resultId, period, {
            page: detailPage.value,
            page_size: detailPageSize.value,
        });
        if (resultDetail.value?.permission_level === 'summary_only') {
            ElMessage.warning('您没有数据明细权限，仅可查看汇总值');
        }
    }
    catch {
        resultDetail.value = null;
    }
    finally {
        resultDetailLoading.value = false;
    }
}
async function changeDetailPage(next) {
    if (!detailMetricId.value || currentDetailResultId.value == null)
        return;
    detailPage.value = next;
    await loadResultDetail(detailMetricId.value, currentDetailResultId.value, currentDetailPeriod.value);
}
// MR0105/0106 + 结果行点击事件：点击计算结果列表的某一期，加载其明细
async function onResultRowClick(row) {
    if (row?.id == null)
        return;
    detailPage.value = 1;
    await loadResultDetail(detailMetricId.value, row.id, row.period);
}
// MR0102: 导出结果明细为 CSV 文件
async function handleExportDetail() {
    if (!detailMetricId.value || currentDetailResultId.value == null)
        return;
    exporting.value = true;
    try {
        const blob = await exportMetricResult(detailMetricId.value, currentDetailResultId.value, currentDetailPeriod.value);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metric_${detailMetricId.value}_${currentDetailPeriod.value}_result.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        await recordExportAudit(detailMetricId.value, currentDetailResultId.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '导出失败');
    }
    finally {
        exporting.value = false;
    }
}
async function handleExportAudit() {
    if (!detailMetricId.value || !computedResult.value)
        return;
    try {
        await recordExportAudit(detailMetricId.value, computedResult.value.id);
    }
    catch { /* 审计记录失败不阻塞用户 */ }
}
async function handleAiExplainAudit() {
    if (!detailMetricId.value || !computePeriod.value)
        return;
    try {
        await recordAiExplainAudit(detailMetricId.value, computePeriod.value);
    }
    catch { /* 审计记录失败不阻塞用户 */ }
}
async function loadResults() {
    if (!detailMetricId.value)
        return;
    resultsLoading.value = true;
    try {
        const res = await listMetricResults(detailMetricId.value);
        results.value = res.items;
    }
    catch {
        results.value = [];
    }
    finally {
        resultsLoading.value = false;
    }
}
async function loadRuns() {
    if (!detailMetricId.value)
        return;
    runsLoading.value = true;
    try {
        const res = await listMetricRuns(detailMetricId.value);
        runs.value = res.items;
    }
    catch {
        runs.value = [];
    }
    finally {
        runsLoading.value = false;
    }
}
// 计算状态增强
const lastComputeStatus = ref(null);
const lastComputeError = ref(null);
const computedResult = ref(null);
let pollTimer = null;
function clearPollTimer() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}
async function pollRunStatus(runId, period) {
    clearPollTimer();
    pollTimer = setInterval(async () => {
        try {
            const runRes = await listMetricRuns(detailMetricId.value);
            const run = (runRes.items || []).find((r) => r.period === period && r.status !== 'pending');
            if (run) {
                clearPollTimer();
                lastComputeStatus.value = run.status;
                computing.value = false;
                if (run.status === 'success') {
                    ElMessage.success('计算完成');
                    await loadResults();
                    computedResult.value = (await listMetricResults(detailMetricId.value)).items?.find((r) => r.period === period) || null;
                    if (computedResult.value) {
                        detailPage.value = 1;
                        await loadResultDetail(detailMetricId.value, computedResult.value.id, period);
                    }
                    loadExplainContext(detailMetricId.value, period);
                }
                else {
                    lastComputeError.value = run.error_message || '计算失败';
                    ElMessage.error(lastComputeError.value || '计算失败');
                }
                await loadRuns();
            }
        }
        catch { /* ignore poll errors */ }
    }, 2000);
    setTimeout(() => { if (pollTimer) {
        clearPollTimer();
        computing.value = false;
        ElMessage.warning('计算超时，请手动刷新查看结果');
    } }, 30000);
}
async function doCompute() {
    if (!computePeriod.value || !detailMetricId.value) {
        if (!computePeriod.value)
            ElMessage.warning('请输入计算期号');
        return;
    }
    computing.value = true;
    lastComputeStatus.value = 'pending';
    lastComputeError.value = null;
    computedResult.value = null;
    try {
        const res = await computeMetric(detailMetricId.value, computePeriod.value);
        if (res.run_id) {
            lastComputeStatus.value = 'running';
            await loadRuns();
            pollRunStatus(res.run_id, computePeriod.value);
        }
        else if (res.status === 'success') {
            lastComputeStatus.value = 'success';
            computing.value = false;
            ElMessage.success('计算完成');
            loadResults();
            loadRuns();
            if (detailMetricId.value) {
                loadExplainContext(detailMetricId.value, computePeriod.value);
                loadLineage(detailMetricId.value);
                loadDownstreamRefs(detailMetricId.value);
            }
            handleAiExplainAudit();
        }
        else {
            lastComputeStatus.value = 'failed';
            lastComputeError.value = res.error_message || '计算失败';
            computing.value = false;
            ElMessage.error(res.error_message || '计算失败');
        }
    }
    catch (e) {
        lastComputeStatus.value = 'failed';
        lastComputeError.value = e?.response?.data?.detail || '计算失败';
        computing.value = false;
        ElMessage.error(lastComputeError.value || '计算失败');
    }
}
async function doRecalc() {
    if (!computePeriod.value || !detailMetricId.value) {
        if (!computePeriod.value)
            ElMessage.warning('请输入计算期号');
        return;
    }
    try {
        await ElMessageBox.confirm('重算将覆盖同周期已有结果，确定？', '确认重算', { type: 'warning' });
        computing.value = true;
        lastComputeStatus.value = 'pending';
        lastComputeError.value = null;
        try {
            const res = await recalcMetric(detailMetricId.value, computePeriod.value);
            if (res.run_id) {
                lastComputeStatus.value = 'running';
                await loadRuns();
                pollRunStatus(res.run_id, computePeriod.value);
            }
            else if (res.status === 'success') {
                lastComputeStatus.value = 'success';
                computing.value = false;
                ElMessage.success('重算完成');
                loadResults();
                loadRuns();
            }
            else {
                lastComputeStatus.value = 'failed';
                lastComputeError.value = res.error_message || '重算失败';
                computing.value = false;
                ElMessage.error(res.error_message || '重算失败');
            }
        }
        catch (e) {
            lastComputeStatus.value = 'failed';
            lastComputeError.value = e?.response?.data?.detail || '重算失败';
            computing.value = false;
            ElMessage.error(lastComputeError.value || '计算失败');
        }
        finally {
            computing.value = false;
        }
    }
    catch { /* 取消 */ }
}
function metricResultDisplay(result) {
    const summary = result?.value?.summary_value ?? result?.value?.value;
    if (summary !== null && summary !== undefined)
        return String(summary);
    const rowCount = result?.value?.row_count ?? result?.rows?.length;
    return rowCount !== undefined ? `${rowCount} 行结果` : '-';
}
function metricResultNumber(result) {
    const summary = result?.value?.summary_value ?? result?.value?.value;
    return typeof summary === 'number' ? summary : 0;
}
// MR0303 辅助：从血缘图中获取节点标签
function getNodeLabel(nodeId) {
    if (!lineageGraph.value)
        return nodeId;
    const node = lineageGraph.value.nodes.find(n => n.id === nodeId);
    return node?.label ?? nodeId;
}
// MR0304 辅助：下游引用类型中文
function downstreamTypeLabel(type) {
    const map = {
        dataset: '数据集', report: '报表', metric: '指标', result: '结果集',
        dws: 'DWS聚合', datasource: '数据源', ucp_resource: 'UCP资源', table: '数据表',
        unknown: '其他',
    };
    return map[type] ?? type;
}
const trendData = computed(() => {
    return [...results.value].reverse().map(r => ({
        period: r.period,
        value: metricResultNumber(r),
        label: metricResultDisplay(r),
    }));
});
// 新建/编辑 — 使用 FormulaFieldEditor 作为统一编辑器
const dialogVisible = ref(false);
const dialogMode = ref('create');
const editId = ref(null);
// 两步向导：1 = 基本信息, 2 = 公式编辑
const createStep = ref(0);
const step1Visible = ref(false);
const step1Saving = ref(false);
const form = ref({
    metric_code: '', metric_name: '', metric_type: 'derived',
    subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '',
    formula_sql: '',
    stat_period: '', related_dataset_id: undefined, owner_name: '',
});
const saving = ref(false);
const datasetOptions = ref([]);
const loadingDatasets = ref(false);
// 公式编辑器字段
const formulaEditorFields = ref([]);
const formulaEditorKey = ref(0);
const editorTitle = computed(() => dialogMode.value === 'edit' ? '编辑指标' : '新建指标 - 编辑公式');
const editorSubtitle = computed(() => dialogMode.value === 'edit' ? '从左侧选择字段和函数编写公式' : '选择数据集，从左侧选择字段和函数编写公式');
// ========== MR0210-MR0212: 组件模式状态 ==========
/** 组件模式：'formula' = 公式模式, 'component' = 组件模式 */
const editMode = ref('formula');
/** 比率公式检测结果（自动弹出提示的前提条件） */
const ratioFormulaDetected = ref(false);
const decomposeResult = ref(null);
const decomposing = ref(false);
/** 组件配置数据 */
const componentRows = ref([]);
/** 自动创建的聚合定义数据 */
const newAggregates = ref([]);
/** 组合规则 */
const combinationRule = ref('numerator / denominator');
/** 维度推断结果 */
const inferredDimensions = ref([]);
/** 已发布聚合定义列表（用于引用已有聚合） */
const publishedAggregates = ref([]);
const loadingAggregates = ref(false);
// UI 自动滚动锚点
const ratioHintRef = ref(null);
const computeModeRef = ref(null);
const componentConfigRef = ref(null);
/** 已有组件列表（编辑模式下加载） */
const existingComponents = ref([]);
// 比率公式检测（MR0210）
function isRatioFormula(formula) {
    if (!formula)
        return false;
    const f = formula.toUpperCase();
    // 检测 / 运算符（含 SAFE_DIVIDE）+ 聚合函数 → 比率
    return (f.includes('/') || f.includes('SAFE_DIVIDE(')) && (f.includes('COUNT(') || f.includes('COUNTIF(') || f.includes('SUM(') || f.includes('AVG(') || f.includes('COUNT_DISTINCT('));
}
// 公式变化时检测比率公式 + 推导类型
watch(() => form.value.formula_expr, (val) => {
    if (val) {
        const derived = deriveMetricType(val);
        const isRatio = isRatioFormula(val);
        const isFormulaMode = editMode.value === 'formula';
        form.value.metric_type = derived;
        const wasDetected = ratioFormulaDetected.value;
        ratioFormulaDetected.value = isRatio && isFormulaMode;
        // 首次检测到比率公式时自动滚动到计算模式区
        if (!wasDetected && ratioFormulaDetected.value) {
            nextTick(() => {
                const card = document.querySelector('.config-card');
                const target = computeModeRef.value;
                if (card && target)
                    card.scrollTop = Math.max(0, target.offsetTop - 80);
            });
        }
    }
    else {
        ratioFormulaDetected.value = false;
        decomposeResult.value = null;
    }
});
// 切换到组件模式时清除比率提示
watch(editMode, (mode) => {
    if (mode === 'component') {
        ratioFormulaDetected.value = false;
        // 自动滚动到组件配置区
        nextTick(() => {
            const card = document.querySelector('.config-card');
            const target = componentConfigRef.value;
            if (card && target)
                card.scrollTop = target.offsetTop - 20;
        });
    }
    else {
        // 回退到公式模式时清除组件数据
        componentRows.value = [];
        newAggregates.value = [];
        decomposeResult.value = null;
    }
});
// 一键拆解公式 → 组件配置
async function switchToComponentMode() {
    const dsId = form.value.related_dataset_id;
    const formula = form.value.formula_expr;
    if (!formula || !dsId) {
        ElMessage.warning('请先填写公式并选择数据集');
        return;
    }
    decomposing.value = true;
    try {
        const result = await decomposeFormula(formula, dsId, form.value.metric_code || undefined);
        decomposeResult.value = result;
        if (!result.is_ratio || result.components.length === 0) {
            ElMessage.info('该公式未检测到比率结构，继续使用公式模式');
            return;
        }
        // 填入组件配置
        editMode.value = 'component';
        combinationRule.value = result.combination_rule || 'numerator / denominator';
        inferredDimensions.value = result.dimensions || [];
        // 生成自动聚合定义 + 组件行
        newAggregates.value = result.components.map((c, i) => ({
            source_dataset_id: dsId,
            name: `dws_${form.value.metric_code || 'new_metric'}_${c.role}`,
            label: `${form.value.metric_name || '新指标'}·${COMPONENT_ROLE_LABELS[c.role]}`,
            group_by: result.dimensions || [],
            aggregation: c.suggested_aggregation,
            measure_field: c.expression,
            is_auto_created: true,
        }));
        componentRows.value = result.components.map((c, i) => ({
            role: c.role,
            component_code: c.suggested_code || `${form.value.metric_code || 'new_metric'}_${c.role}`,
            component_name: c.suggested_name || `${form.value.metric_name || '新指标'}·${COMPONENT_ROLE_LABELS[c.role]}`,
            expression: c.expression,
            aggregate_id: null, // 新建的，暂无 ID
            new_aggregate_index: i, // 指向 newAggregates[i]
            is_auto_created: true,
            display_order: i,
        }));
        // 加载已发布聚合定义供引用
        await loadPublishedAggregates();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '公式拆解失败');
    }
    finally {
        decomposing.value = false;
    }
}
// 加载已发布聚合定义列表
async function loadPublishedAggregates() {
    loadingAggregates.value = true;
    try {
        const res = await listDwsAggregates({ status: 'published', page_size: 200 });
        publishedAggregates.value = res.items || [];
    }
    catch {
        publishedAggregates.value = [];
    }
    finally {
        loadingAggregates.value = false;
    }
}
// 判断已有聚合的维度是否与当前推断维度匹配
function isDimensionMatch(agg) {
    if (!inferredDimensions.value.length)
        return true;
    const aggDims = (agg.group_by || []).map(d => d.toLowerCase().replace(/\s/g, ''));
    const inferred = inferredDimensions.value.map(d => d.toLowerCase().replace(/\s/g, ''));
    return inferred.every(d => aggDims.includes(d));
}
// 组件行引用已有聚合 → 设置 aggregate_id, 清除 new_aggregate_index
function setExistingAggregate(rowIdx, aggId) {
    const row = componentRows.value[rowIdx];
    if (aggId) {
        row.aggregate_id = aggId;
        row.new_aggregate_index = null;
        row.is_auto_created = false;
        // 从聚合定义中获取名称
        const agg = publishedAggregates.value.find(a => a.id === aggId);
        if (agg) {
            row.component_name = `${form.value.metric_name || '新指标'}·${COMPONENT_ROLE_LABELS[row.role]}`;
        }
    }
    else {
        // 取消引用 → 回到自动创建模式
        row.aggregate_id = null;
        row.new_aggregate_index = rowIdx;
        row.is_auto_created = true;
    }
}
async function loadFormulaEditorFields() {
    const dsId = form.value.related_dataset_id;
    if (!dsId) {
        formulaEditorFields.value = [];
        return;
    }
    try {
        const ds = await datasetsApi.get(dsId);
        const allCols = [];
        for (const table of ds.tables) {
            try {
                const cols = await dataApi.columns(table.table_name);
                for (const col of cols) {
                    allCols.push({ ...col, code: `${table.alias}.${col.code}` });
                }
            }
            catch { /* skip */ }
        }
        formulaEditorFields.value = allCols;
    }
    catch {
        formulaEditorFields.value = [];
    }
}
async function loadDatasetOptions() {
    if (datasetOptions.value.length > 0)
        return;
    loadingDatasets.value = true;
    try {
        const res = await listModels({ page_size: 200, warehouse_layer: 'DWD' });
        datasetOptions.value = (res.items || []).map((m) => ({
            id: m.id, name: m.name, label: m.label || m.name, layer: m.warehouse_layer || '',
        }));
    }
    catch {
        datasetOptions.value = [];
    }
    finally {
        loadingDatasets.value = false;
    }
}
function openCreate() {
    dialogMode.value = 'create';
    editId.value = null;
    form.value = { metric_code: '', metric_name: '', metric_type: 'derived', subject_area: '', business_definition: '', calculation_desc: '', formula_expr: '', formula_sql: '', stat_period: '', related_dataset_id: undefined, owner_name: '' };
    formulaEditorFields.value = [];
    editMode.value = 'formula';
    ratioFormulaDetected.value = false;
    decomposeResult.value = null;
    componentRows.value = [];
    newAggregates.value = [];
    // 两步向导：先显示 Step 1 基本信息
    createStep.value = 1;
    step1Visible.value = true;
}
function goToStep2() {
    // 校验必填
    if (!form.value.metric_code.trim()) {
        ElMessage.warning('请输入指标编码');
        return;
    }
    if (!form.value.metric_name.trim()) {
        ElMessage.warning('请输入指标名称');
        return;
    }
    createStep.value = 2;
    dialogVisible.value = true; // 先打开 Step 2（覆盖在 Step 1 之上）
    setTimeout(() => { step1Visible.value = false; }, 150); // 延迟关闭 Step 1，避免弹窗闪动
}
function goToStep1() {
    dialogVisible.value = false;
    createStep.value = 1;
    step1Visible.value = true;
}
function closeStep1() {
    step1Visible.value = false;
    createStep.value = 0;
}
async function openEdit(id) {
    dialogMode.value = 'edit';
    editId.value = id;
    createStep.value = 0; // 编辑模式：直接进公式编辑器
    try {
        const m = await getMetric(id);
        form.value = {
            metric_code: m.metric_code, metric_name: m.metric_name, metric_type: m.metric_type,
            subject_area: m.subject_area || '', business_definition: m.business_definition || '',
            calculation_desc: m.calculation_desc || '', formula_expr: m.formula_expr || '',
            formula_sql: m.formula_sql || '',
            stat_period: m.stat_period || '', related_dataset_id: m.related_dataset_id || undefined,
            owner_name: m.owner_name || '',
        };
        if (m.related_dataset_id) {
            await loadFormulaEditorFields();
        }
        // 加载已有组件
        try {
            const comps = await listMetricComponents(id);
            existingComponents.value = comps;
            if (comps.length > 0) {
                editMode.value = 'component';
                componentRows.value = comps.map(c => ({
                    role: c.role,
                    component_code: c.component_code,
                    component_name: c.component_name,
                    expression: c.expression || '',
                    aggregate_id: c.aggregate_id,
                    new_aggregate_index: null,
                    is_auto_created: c.is_auto_created,
                    display_order: c.display_order,
                }));
                inferredDimensions.value = comps[0].aggregate_group_by || [];
                await loadPublishedAggregates();
            }
            else {
                editMode.value = 'formula';
                ratioFormulaDetected.value = isRatioFormula(form.value.formula_expr || '');
            }
        }
        catch { /* 组件加载失败不影响编辑 */ }
        formulaEditorKey.value++;
        dialogVisible.value = true;
    }
    catch {
        ElMessage.error('加载指标详情失败');
    }
}
// 保存指标 + 组件
async function save() {
    saving.value = true;
    try {
        const { formula_sql, ...payload } = form.value;
        // 组件模式需要先保存/更新指标获取 ID，再批量保存组件
        let savedMetricId;
        if (dialogMode.value === 'create') {
            const created = await createMetric(payload);
            savedMetricId = created.id;
            ElMessage.success('指标已创建');
        }
        else {
            const { metric_code, ...updatePayload } = payload;
            await updateMetric(editId.value, updatePayload);
            savedMetricId = editId.value;
            ElMessage.success('指标已更新');
        }
        // 如果是组件模式 → 批量保存组件（MR0213）
        if (editMode.value === 'component' && componentRows.value.length > 0) {
            try {
                const batchPayload = {
                    new_aggregates: newAggregates.value.map(a => ({
                        ...a,
                        // 用实际 metric_code 替换占位符
                        name: a.name.replace('new_metric', form.value.metric_code || 'metric'),
                        label: a.label.replace('新指标', form.value.metric_name || '指标'),
                    })),
                    components: componentRows.value.map(c => ({
                        component_code: c.component_code.replace('new_metric', form.value.metric_code || 'metric'),
                        component_name: c.component_name.replace('新指标', form.value.metric_name || '指标'),
                        aggregate_id: c.aggregate_id,
                        new_aggregate_index: c.new_aggregate_index,
                        role: c.role,
                        expression: c.expression || null,
                        display_order: c.display_order,
                        is_auto_created: c.is_auto_created,
                    })),
                };
                await batchSaveMetricComponents(savedMetricId, batchPayload);
                ElMessage.success('组件配置已保存');
            }
            catch (e) {
                ElMessage.warning(`组件保存失败: ${e?.response?.data?.detail || e.message || '未知错误'}`);
            }
        }
        dialogVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
function onDatasetChange(dsId) {
    form.value.related_dataset_id = dsId;
    if (dsId) {
        loadFormulaEditorFields();
        formulaEditorKey.value++;
    }
    else {
        formulaEditorFields.value = [];
    }
}
// 从公式自动推导指标类型
function deriveMetricType(formula) {
    const f = (formula || '').toUpperCase();
    if (f.includes('SUM('))
        return 'sum';
    if (f.includes('COUNT(') || f.includes('COUNTIF(') || f.includes('COUNT_DISTINCT('))
        return 'count';
    if ((f.includes('/') || f.includes('SAFE_DIVIDE(')) && (f.includes('SUM(') || f.includes('COUNT(') || f.includes('COUNTIF(') || f.includes('AVG(')))
        return 'ratio';
    if (!f.match(/SUM|COUNT|AVG|MAX|MIN|ROUND|IF/))
        return 'text';
    return 'derived';
}
// 公式/数据集变化时实时调用 AST 编译器，预览编译结果（AST0017）
let translateTimer = null;
const translating = ref(false);
const compileResult = ref(null);
const compiling = ref(false);
const showSql = ref(false);
// 公式是否应该禁用保存按钮：编译中、编译未就绪、或已有结果但无效时禁用
const formulaHasError = computed(() => {
    if (!form.value.formula_expr)
        return false;
    if (compiling.value)
        return true;
    if (!compileResult.value)
        return true;
    return !compileResult.value.valid;
});
watch([() => form.value.formula_expr, () => form.value.related_dataset_id], ([expr, dsId]) => {
    if (translateTimer)
        clearTimeout(translateTimer);
    if (!expr || !dsId) {
        form.value.formula_sql = '';
        compileResult.value = null;
        return;
    }
    translateTimer = setTimeout(async () => {
        translating.value = true;
        compiling.value = true;
        try {
            const res = await compileFormula({ dataset_id: dsId, formula_expr: expr, mode: 'metric', include_ast: false, preview: true });
            compileResult.value = res;
            // 仅当有效时回填用于保存的 SQL；无效时保留错误提示由面板展示
            if (res.valid) {
                form.value.formula_sql = res.sql;
            }
            else {
                form.value.formula_sql = (res.errors || []).map(e => e.message).join('；');
            }
        }
        catch {
            compileResult.value = null;
            form.value.formula_sql = '';
        }
        finally {
            translating.value = false;
            compiling.value = false;
        }
    }, 500);
});
async function doPublish(id) {
    try {
        await ElMessageBox.confirm('确定发布该指标？', '确认', { type: 'info' });
        await publishMetric(id);
        ElMessage.success('已发布');
        load();
    }
    catch { /* 取消 */ }
}
async function doArchive(id) {
    try {
        await ElMessageBox.confirm('归档后指标将不可用，确定？', '确认归档', { type: 'warning' });
        await archiveMetric(id);
        ElMessage.success('已归档');
        load();
    }
    catch { /* 取消 */ }
}
watch([page, pageSize], () => load());
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
if (__VLS_ctx.userStore.hasOp('warehouse.metrics', 'C')) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    shadow: "never",
    ...{ style: {} },
}));
const __VLS_10 = __VLS_9({
    shadow: "never",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    inline: (true),
    size: "small",
}));
const __VLS_14 = __VLS_13({
    inline: (true),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "搜索",
}));
const __VLS_18 = __VLS_17({
    label: "搜索",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "编码/名称",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "编码/名称",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onKeyup: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
var __VLS_23;
var __VLS_19;
const __VLS_28 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "状态",
}));
const __VLS_30 = __VLS_29({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.statusFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_34 = __VLS_33({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.statusFilter),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onChange: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
__VLS_35.slots.default;
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "草稿",
    value: "draft",
}));
const __VLS_42 = __VLS_41({
    label: "草稿",
    value: "draft",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "已发布",
    value: "published",
}));
const __VLS_46 = __VLS_45({
    label: "已发布",
    value: "published",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
const __VLS_48 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "已归档",
    value: "archived",
}));
const __VLS_50 = __VLS_49({
    label: "已归档",
    value: "archived",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
var __VLS_35;
var __VLS_31;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
}));
const __VLS_58 = __VLS_57({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onClick: (...[$event]) => {
        (__VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
__VLS_59.slots.default;
var __VLS_59;
const __VLS_64 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_66 = __VLS_65({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onClick: (...[$event]) => {
        (__VLS_ctx.keyword = '', __VLS_ctx.statusFilter = '', __VLS_ctx.page = 1, __VLS_ctx.load());
    }
};
__VLS_67.slots.default;
var __VLS_67;
var __VLS_55;
var __VLS_15;
var __VLS_11;
const __VLS_72 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    shadow: "never",
}));
const __VLS_74 = __VLS_73({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    ...{ 'onRowClick': {} },
    data: (__VLS_ctx.metrics),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无指标",
    highlightCurrentRow: true,
    ...{ style: {} },
}));
const __VLS_78 = __VLS_77({
    ...{ 'onRowClick': {} },
    data: (__VLS_ctx.metrics),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无指标",
    highlightCurrentRow: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
let __VLS_80;
let __VLS_81;
let __VLS_82;
const __VLS_83 = {
    onRowClick: ((row) => __VLS_ctx.openDetail(row.id))
};
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_79.slots.default;
const __VLS_84 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    prop: "metric_code",
    label: "编码",
    width: "120",
}));
const __VLS_86 = __VLS_85({
    prop: "metric_code",
    label: "编码",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
const __VLS_88 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    prop: "metric_name",
    label: "名称",
    minWidth: "120",
}));
const __VLS_90 = __VLS_89({
    prop: "metric_name",
    label: "名称",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
const __VLS_92 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    prop: "metric_type",
    label: "类型",
    width: "70",
}));
const __VLS_94 = __VLS_93({
    prop: "metric_type",
    label: "类型",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_95.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.TYPE_LABELS[row.metric_type] || row.metric_type);
}
var __VLS_95;
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    prop: "business_definition",
    label: "定义",
    minWidth: "140",
    showOverflowTooltip: true,
}));
const __VLS_98 = __VLS_97({
    prop: "business_definition",
    label: "定义",
    minWidth: "140",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    prop: "subject_area",
    label: "主题域",
    width: "80",
}));
const __VLS_102 = __VLS_101({
    prop: "subject_area",
    label: "主题域",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    prop: "related_dataset_id",
    label: "依赖数据集",
    width: "90",
}));
const __VLS_106 = __VLS_105({
    prop: "related_dataset_id",
    label: "依赖数据集",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
const __VLS_108 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    prop: "owner_name",
    label: "负责人",
    width: "80",
}));
const __VLS_110 = __VLS_109({
    prop: "owner_name",
    label: "负责人",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
const __VLS_112 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_114 = __VLS_113({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_115.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_116 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        size: "small",
        type: (__VLS_ctx.STATUS_TAG[row.status] || 'info'),
    }));
    const __VLS_118 = __VLS_117({
        size: "small",
        type: (__VLS_ctx.STATUS_TAG[row.status] || 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    (__VLS_ctx.STATUS_LABELS[row.status] || row.status);
    var __VLS_119;
}
var __VLS_115;
const __VLS_120 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    prop: "version",
    label: "版本",
    width: "60",
    align: "center",
}));
const __VLS_122 = __VLS_121({
    prop: "version",
    label: "版本",
    width: "60",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
const __VLS_124 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "操作",
    width: "220",
    fixed: "right",
}));
const __VLS_126 = __VLS_125({
    label: "操作",
    width: "220",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_127.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_128 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.TrendCharts),
        type: "primary",
    }));
    const __VLS_130 = __VLS_129({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.TrendCharts),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    let __VLS_132;
    let __VLS_133;
    let __VLS_134;
    const __VLS_135 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openDetail(row.id);
        }
    };
    __VLS_131.slots.default;
    var __VLS_131;
    if (__VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')) {
        const __VLS_136 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Edit),
        }));
        const __VLS_138 = __VLS_137({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.Edit),
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        let __VLS_140;
        let __VLS_141;
        let __VLS_142;
        const __VLS_143 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')))
                    return;
                __VLS_ctx.openEdit(row.id);
            }
        };
        __VLS_139.slots.default;
        var __VLS_139;
    }
    if (row.status === 'draft' && __VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')) {
        const __VLS_144 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "success",
            icon: (__VLS_ctx.Finished),
        }));
        const __VLS_146 = __VLS_145({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "success",
            icon: (__VLS_ctx.Finished),
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        let __VLS_148;
        let __VLS_149;
        let __VLS_150;
        const __VLS_151 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'draft' && __VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')))
                    return;
                __VLS_ctx.doPublish(row.id);
            }
        };
        __VLS_147.slots.default;
        var __VLS_147;
    }
    if (row.status === 'published' && __VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')) {
        const __VLS_152 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.FolderDelete),
        }));
        const __VLS_154 = __VLS_153({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.FolderDelete),
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        let __VLS_156;
        let __VLS_157;
        let __VLS_158;
        const __VLS_159 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'published' && __VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')))
                    return;
                __VLS_ctx.doArchive(row.id);
            }
        };
        __VLS_155.slots.default;
        var __VLS_155;
    }
}
var __VLS_127;
var __VLS_79;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_160 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total,sizes,prev,pager,next",
}));
const __VLS_162 = __VLS_161({
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total,sizes,prev,pager,next",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
var __VLS_75;
const __VLS_164 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    modelValue: (__VLS_ctx.detailVisible),
    title: "指标计算结果",
    size: "650px",
    closeOnClickModal: (false),
}));
const __VLS_166 = __VLS_165({
    modelValue: (__VLS_ctx.detailVisible),
    title: "指标计算结果",
    size: "650px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
if (__VLS_ctx.detailMetric) {
    const __VLS_168 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        column: (2),
        size: "small",
        border: true,
        ...{ style: {} },
    }));
    const __VLS_170 = __VLS_169({
        column: (2),
        size: "small",
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    __VLS_171.slots.default;
    const __VLS_172 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "编码",
    }));
    const __VLS_174 = __VLS_173({
        label: "编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    (__VLS_ctx.detailMetric.metric_code);
    var __VLS_175;
    const __VLS_176 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        label: "名称",
    }));
    const __VLS_178 = __VLS_177({
        label: "名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    (__VLS_ctx.detailMetric.metric_name);
    var __VLS_179;
    const __VLS_180 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        label: "类型",
    }));
    const __VLS_182 = __VLS_181({
        label: "类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
    __VLS_183.slots.default;
    (__VLS_ctx.TYPE_LABELS[__VLS_ctx.detailMetric.metric_type] || __VLS_ctx.detailMetric.metric_type);
    var __VLS_183;
    const __VLS_184 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        label: "状态",
    }));
    const __VLS_186 = __VLS_185({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    const __VLS_188 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        size: "small",
        type: (__VLS_ctx.STATUS_TAG[__VLS_ctx.detailMetric.status] || 'info'),
    }));
    const __VLS_190 = __VLS_189({
        size: "small",
        type: (__VLS_ctx.STATUS_TAG[__VLS_ctx.detailMetric.status] || 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    (__VLS_ctx.STATUS_LABELS[__VLS_ctx.detailMetric.status] || __VLS_ctx.detailMetric.status);
    var __VLS_191;
    var __VLS_187;
    if (__VLS_ctx.detailMetric.formula_expr) {
        const __VLS_192 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            label: "公式",
            span: (2),
        }));
        const __VLS_194 = __VLS_193({
            label: "公式",
            span: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        __VLS_195.slots.default;
        (__VLS_ctx.detailMetric.formula_expr);
        var __VLS_195;
    }
    var __VLS_171;
    if (__VLS_ctx.explainContext && __VLS_ctx.explainContext.components.length > 0) {
        const __VLS_196 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_198 = __VLS_197({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        __VLS_199.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_199.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            if (__VLS_ctx.explainContext.metric_version) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (__VLS_ctx.explainContext.metric_version);
            }
        }
        if (__VLS_ctx.explainContext.combination_rule) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.explainContext.combination_rule);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.explainContext.metric_name);
        }
        const __VLS_200 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            data: (__VLS_ctx.explainContext.components),
            size: "small",
            border: true,
            ...{ style: {} },
        }));
        const __VLS_202 = __VLS_201({
            data: (__VLS_ctx.explainContext.components),
            size: "small",
            border: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        __VLS_203.slots.default;
        const __VLS_204 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            prop: "role",
            label: "角色",
            width: "70",
        }));
        const __VLS_206 = __VLS_205({
            prop: "role",
            label: "角色",
            width: "70",
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        __VLS_207.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_207.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_208 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                size: "small",
                type: (row.role === 'numerator' ? 'danger' : row.role === 'denominator' ? 'warning' : 'info'),
            }));
            const __VLS_210 = __VLS_209({
                size: "small",
                type: (row.role === 'numerator' ? 'danger' : row.role === 'denominator' ? 'warning' : 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_209));
            __VLS_211.slots.default;
            (__VLS_ctx.COMPONENT_ROLE_LABELS[row.role] || row.role);
            var __VLS_211;
        }
        var __VLS_207;
        const __VLS_212 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            prop: "component_name",
            label: "组件名称",
            minWidth: "100",
        }));
        const __VLS_214 = __VLS_213({
            prop: "component_name",
            label: "组件名称",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        const __VLS_216 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            prop: "aggregate_label",
            label: "聚合定义",
            minWidth: "100",
        }));
        const __VLS_218 = __VLS_217({
            prop: "aggregate_label",
            label: "聚合定义",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_219.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (row.aggregate_label || row.aggregate_name || '-');
            if (row.is_auto_created) {
                const __VLS_220 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
                    size: "small",
                    type: "info",
                    ...{ style: {} },
                }));
                const __VLS_222 = __VLS_221({
                    size: "small",
                    type: "info",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_221));
                __VLS_223.slots.default;
                var __VLS_223;
            }
        }
        var __VLS_219;
        const __VLS_224 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
            prop: "expression",
            label: "表达式",
            minWidth: "80",
            showOverflowTooltip: true,
        }));
        const __VLS_226 = __VLS_225({
            prop: "expression",
            label: "表达式",
            minWidth: "80",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        var __VLS_203;
        if (__VLS_ctx.explainContext.business_definition || __VLS_ctx.explainContext.calculation_desc) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            if (__VLS_ctx.explainContext.business_definition) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (__VLS_ctx.explainContext.business_definition);
            }
            if (__VLS_ctx.explainContext.calculation_desc) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (__VLS_ctx.explainContext.calculation_desc);
            }
        }
        if (__VLS_ctx.explainContext.computed_at) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            (__VLS_ctx.formatDateTime(__VLS_ctx.explainContext.computed_at));
        }
        var __VLS_199;
    }
    if (__VLS_ctx.explainContext && __VLS_ctx.explainContext.components.length === 0 && __VLS_ctx.explainContext.formula_expr) {
        const __VLS_228 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_230 = __VLS_229({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_229));
        __VLS_231.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_231.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.explainContext.formula_expr);
        if (__VLS_ctx.explainContext.business_definition) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.explainContext.business_definition);
        }
        if (__VLS_ctx.explainContext.calculation_desc) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.explainContext.calculation_desc);
        }
        if (__VLS_ctx.explainContext.metric_version) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ style: {} },
            });
            (__VLS_ctx.explainContext.metric_version);
            if (__VLS_ctx.explainContext.computed_at) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.formatDateTime(__VLS_ctx.explainContext.computed_at));
            }
        }
        var __VLS_231;
    }
    if (__VLS_ctx.lineageGraph) {
        const __VLS_232 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_234 = __VLS_233({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
        __VLS_235.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_235.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        for (const [edge] of __VLS_getVForSourceType((__VLS_ctx.lineageGraph.edges))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (edge.source_id + edge.target_id),
                ...{ style: {} },
            });
            const __VLS_236 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
                size: "small",
                type: (edge.direction === 'upstream' ? 'info' : 'success'),
            }));
            const __VLS_238 = __VLS_237({
                size: "small",
                type: (edge.direction === 'upstream' ? 'info' : 'success'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_237));
            __VLS_239.slots.default;
            (edge.direction === 'upstream' ? '↑ 上游' : '↓ 下游');
            var __VLS_239;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.getNodeLabel(edge.source_id));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.getNodeLabel(edge.target_id));
            if (edge.label) {
                const __VLS_240 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                    size: "small",
                    type: "warning",
                }));
                const __VLS_242 = __VLS_241({
                    size: "small",
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_241));
                __VLS_243.slots.default;
                (edge.label);
                var __VLS_243;
            }
        }
        if (__VLS_ctx.lineageGraph.truncated) {
            const __VLS_244 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
                type: "warning",
                closable: (false),
                ...{ style: {} },
            }));
            const __VLS_246 = __VLS_245({
                type: "warning",
                closable: (false),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_245));
            __VLS_247.slots.default;
            (__VLS_ctx.lineageGraph.truncation_message);
            var __VLS_247;
        }
        var __VLS_235;
    }
    else if (__VLS_ctx.lineageLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_248 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
            ...{ class: "is-loading" },
        }));
        const __VLS_250 = __VLS_249({
            ...{ class: "is-loading" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_249));
        __VLS_251.slots.default;
        const __VLS_252 = {}.Loading;
        /** @type {[typeof __VLS_components.Loading, ]} */ ;
        // @ts-ignore
        const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({}));
        const __VLS_254 = __VLS_253({}, ...__VLS_functionalComponentArgsRest(__VLS_253));
        var __VLS_251;
    }
    if (__VLS_ctx.downstreamRefs) {
        const __VLS_256 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_258 = __VLS_257({
            shadow: "never",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        __VLS_259.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_259.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        const __VLS_260 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
            data: (__VLS_ctx.downstreamRefs.refs),
            size: "small",
            stripe: true,
            ...{ style: {} },
            maxHeight: (200),
            emptyText: "暂无下游引用",
        }));
        const __VLS_262 = __VLS_261({
            data: (__VLS_ctx.downstreamRefs.refs),
            size: "small",
            stripe: true,
            ...{ style: {} },
            maxHeight: (200),
            emptyText: "暂无下游引用",
        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
        __VLS_263.slots.default;
        const __VLS_264 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            prop: "type",
            label: "类型",
            width: "80",
        }));
        const __VLS_266 = __VLS_265({
            prop: "type",
            label: "类型",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        __VLS_267.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_267.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_268 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                size: "small",
            }));
            const __VLS_270 = __VLS_269({
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_269));
            __VLS_271.slots.default;
            (__VLS_ctx.downstreamTypeLabel(row.type));
            var __VLS_271;
        }
        var __VLS_267;
        const __VLS_272 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
            prop: "name",
            label: "名称",
            minWidth: "120",
            showOverflowTooltip: true,
        }));
        const __VLS_274 = __VLS_273({
            prop: "name",
            label: "名称",
            minWidth: "120",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_273));
        const __VLS_276 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
            prop: "usage",
            label: "引用方式",
            minWidth: "100",
            showOverflowTooltip: true,
        }));
        const __VLS_278 = __VLS_277({
            prop: "usage",
            label: "引用方式",
            minWidth: "100",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_277));
        const __VLS_280 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
            prop: "risk_level",
            label: "风险",
            width: "60",
            align: "center",
        }));
        const __VLS_282 = __VLS_281({
            prop: "risk_level",
            label: "风险",
            width: "60",
            align: "center",
        }, ...__VLS_functionalComponentArgsRest(__VLS_281));
        __VLS_283.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_283.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.risk_level === 'high') {
                const __VLS_284 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                    type: "danger",
                    size: "small",
                }));
                const __VLS_286 = __VLS_285({
                    type: "danger",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_285));
                __VLS_287.slots.default;
                var __VLS_287;
            }
            else if (row.risk_level === 'medium') {
                const __VLS_288 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
                    type: "warning",
                    size: "small",
                }));
                const __VLS_290 = __VLS_289({
                    type: "warning",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_289));
                __VLS_291.slots.default;
                var __VLS_291;
            }
            else {
                const __VLS_292 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
                    type: "info",
                    size: "small",
                }));
                const __VLS_294 = __VLS_293({
                    type: "info",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_293));
                __VLS_295.slots.default;
                var __VLS_295;
            }
        }
        var __VLS_283;
        var __VLS_263;
        var __VLS_259;
    }
    else if (__VLS_ctx.downstreamRefsLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_296 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
            ...{ class: "is-loading" },
        }));
        const __VLS_298 = __VLS_297({
            ...{ class: "is-loading" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_297));
        __VLS_299.slots.default;
        const __VLS_300 = {}.Loading;
        /** @type {[typeof __VLS_components.Loading, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({}));
        const __VLS_302 = __VLS_301({}, ...__VLS_functionalComponentArgsRest(__VLS_301));
        var __VLS_299;
    }
    const __VLS_304 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_306 = __VLS_305({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_305));
    __VLS_307.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_307.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    const __VLS_308 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        inline: (true),
        size: "small",
    }));
    const __VLS_310 = __VLS_309({
        inline: (true),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    __VLS_311.slots.default;
    const __VLS_312 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
        label: "计算期号",
    }));
    const __VLS_314 = __VLS_313({
        label: "计算期号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_313));
    __VLS_315.slots.default;
    const __VLS_316 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
        modelValue: (__VLS_ctx.computePeriod),
        placeholder: "2026-07 / 2026Q3 / 2026H1",
        ...{ style: {} },
        clearable: true,
        disabled: (__VLS_ctx.computing),
    }));
    const __VLS_318 = __VLS_317({
        modelValue: (__VLS_ctx.computePeriod),
        placeholder: "2026-07 / 2026Q3 / 2026H1",
        ...{ style: {} },
        clearable: true,
        disabled: (__VLS_ctx.computing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_317));
    var __VLS_315;
    const __VLS_320 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({}));
    const __VLS_322 = __VLS_321({}, ...__VLS_functionalComponentArgsRest(__VLS_321));
    __VLS_323.slots.default;
    if (__VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')) {
        const __VLS_324 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.computing ? __VLS_ctx.Loading : __VLS_ctx.VideoPlay),
            loading: (__VLS_ctx.computing),
        }));
        const __VLS_326 = __VLS_325({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.computing ? __VLS_ctx.Loading : __VLS_ctx.VideoPlay),
            loading: (__VLS_ctx.computing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        let __VLS_328;
        let __VLS_329;
        let __VLS_330;
        const __VLS_331 = {
            onClick: (__VLS_ctx.doCompute)
        };
        __VLS_327.slots.default;
        (__VLS_ctx.computing ? (__VLS_ctx.lastComputeStatus === 'running' ? '执行中...' : '已提交') : '计算');
        var __VLS_327;
    }
    if (__VLS_ctx.userStore.hasOp('warehouse.metrics', 'U')) {
        const __VLS_332 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
            ...{ 'onClick': {} },
            icon: (__VLS_ctx.Refresh),
            loading: (__VLS_ctx.computing),
            disabled: (__VLS_ctx.computing),
        }));
        const __VLS_334 = __VLS_333({
            ...{ 'onClick': {} },
            icon: (__VLS_ctx.Refresh),
            loading: (__VLS_ctx.computing),
            disabled: (__VLS_ctx.computing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_333));
        let __VLS_336;
        let __VLS_337;
        let __VLS_338;
        const __VLS_339 = {
            onClick: (__VLS_ctx.doRecalc)
        };
        __VLS_335.slots.default;
        var __VLS_335;
    }
    var __VLS_323;
    var __VLS_311;
    if (__VLS_ctx.lastComputeStatus) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        if (__VLS_ctx.lastComputeStatus === 'running') {
            const __VLS_340 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
                type: "info",
                closable: (false),
                title: "计算执行中，运行记录区将自动更新...",
                showIcon: true,
            }));
            const __VLS_342 = __VLS_341({
                type: "info",
                closable: (false),
                title: "计算执行中，运行记录区将自动更新...",
                showIcon: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_341));
        }
        else if (__VLS_ctx.lastComputeStatus === 'success' && __VLS_ctx.computedResult) {
            const __VLS_344 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
                type: "success",
                closable: (false),
                title: (`上次计算完成 · 结果: ${__VLS_ctx.computedResult.period}`),
                showIcon: true,
            }));
            const __VLS_346 = __VLS_345({
                type: "success",
                closable: (false),
                title: (`上次计算完成 · 结果: ${__VLS_ctx.computedResult.period}`),
                showIcon: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_345));
            __VLS_347.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_347.slots;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (__VLS_ctx.metricResultDisplay(__VLS_ctx.computedResult));
            }
            var __VLS_347;
        }
        else if (__VLS_ctx.lastComputeStatus === 'failed') {
            const __VLS_348 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
                type: "error",
                closable: (false),
                title: (__VLS_ctx.lastComputeError || '计算失败'),
                showIcon: true,
            }));
            const __VLS_350 = __VLS_349({
                type: "error",
                closable: (false),
                title: (__VLS_ctx.lastComputeError || '计算失败'),
                showIcon: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_349));
            __VLS_351.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_351.slots;
                const __VLS_352 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
                    ...{ 'onClick': {} },
                    size: "small",
                    text: true,
                    disabled: (__VLS_ctx.computing),
                }));
                const __VLS_354 = __VLS_353({
                    ...{ 'onClick': {} },
                    size: "small",
                    text: true,
                    disabled: (__VLS_ctx.computing),
                }, ...__VLS_functionalComponentArgsRest(__VLS_353));
                let __VLS_356;
                let __VLS_357;
                let __VLS_358;
                const __VLS_359 = {
                    onClick: (__VLS_ctx.doCompute)
                };
                __VLS_355.slots.default;
                var __VLS_355;
            }
            var __VLS_351;
        }
    }
    var __VLS_307;
    const __VLS_360 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_362 = __VLS_361({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
    __VLS_363.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_363.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    if (__VLS_ctx.trendData.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_364 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
            description: "暂无计算结果",
            imageSize: (80),
        }));
        const __VLS_366 = __VLS_365({
            description: "暂无计算结果",
            imageSize: (80),
        }, ...__VLS_functionalComponentArgsRest(__VLS_365));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        for (const [d, i] of __VLS_getVForSourceType((__VLS_ctx.trendData))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (i),
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (d.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: ({ height: Math.max(4, (d.value / Math.max(...__VLS_ctx.trendData.map(x => x.value), 1)) * 100) + '%', width: '100%', maxWidth: '40px', background: '#409eff', borderRadius: '4px 4px 0 0', minHeight: '4px' }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (d.period);
        }
    }
    var __VLS_363;
    const __VLS_368 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_370 = __VLS_369({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
    __VLS_371.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_371.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    const __VLS_372 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.results),
        size: "small",
        border: true,
        emptyText: "暂无结果",
        maxHeight: "200",
        highlightCurrentRow: true,
    }));
    const __VLS_374 = __VLS_373({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.results),
        size: "small",
        border: true,
        emptyText: "暂无结果",
        maxHeight: "200",
        highlightCurrentRow: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_373));
    let __VLS_376;
    let __VLS_377;
    let __VLS_378;
    const __VLS_379 = {
        onRowClick: (__VLS_ctx.onResultRowClick)
    };
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.resultsLoading) }, null, null);
    __VLS_375.slots.default;
    const __VLS_380 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
        prop: "period",
        label: "周期",
        width: "120",
    }));
    const __VLS_382 = __VLS_381({
        prop: "period",
        label: "周期",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_381));
    const __VLS_384 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
        label: "计算结果",
        minWidth: "120",
    }));
    const __VLS_386 = __VLS_385({
        label: "计算结果",
        minWidth: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_385));
    __VLS_387.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_387.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.metricResultDisplay(row));
    }
    var __VLS_387;
    const __VLS_388 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
        label: "明细行数",
        width: "90",
        align: "center",
    }));
    const __VLS_390 = __VLS_389({
        label: "明细行数",
        width: "90",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_389));
    __VLS_391.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_391.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.value?.row_count ?? row.rows?.length ?? 0);
    }
    var __VLS_391;
    const __VLS_392 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
        prop: "computed_at",
        label: "计算时间",
        width: "160",
    }));
    const __VLS_394 = __VLS_393({
        prop: "computed_at",
        label: "计算时间",
        width: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
    __VLS_395.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_395.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.computed_at));
    }
    var __VLS_395;
    var __VLS_375;
    var __VLS_371;
    const __VLS_396 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_398 = __VLS_397({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_397));
    __VLS_399.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_399.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        if (__VLS_ctx.resultDetail?.permission_level === 'full') {
            const __VLS_400 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                loading: (__VLS_ctx.exporting),
                ...{ style: {} },
            }));
            const __VLS_402 = __VLS_401({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                loading: (__VLS_ctx.exporting),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_401));
            let __VLS_404;
            let __VLS_405;
            let __VLS_406;
            const __VLS_407 = {
                onClick: (__VLS_ctx.handleExportDetail)
            };
            __VLS_403.slots.default;
            var __VLS_403;
        }
    }
    if (__VLS_ctx.resultDetailLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (true) }, null, null);
    }
    else if (__VLS_ctx.resultDetail && __VLS_ctx.resultDetail.permission_level === 'full') {
        const __VLS_408 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
            data: (__VLS_ctx.resultDetail.rows || []),
            size: "small",
            border: true,
            maxHeight: "340",
            emptyText: "计算成功，但无明细数据",
        }));
        const __VLS_410 = __VLS_409({
            data: (__VLS_ctx.resultDetail.rows || []),
            size: "small",
            border: true,
            maxHeight: "340",
            emptyText: "计算成功，但无明细数据",
        }, ...__VLS_functionalComponentArgsRest(__VLS_409));
        __VLS_411.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.detailDimCols))) {
            const __VLS_412 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_413 = __VLS_asFunctionalComponent(__VLS_412, new __VLS_412({
                key: ('d-' + c),
                prop: (c),
                label: (c),
            }));
            const __VLS_414 = __VLS_413({
                key: ('d-' + c),
                prop: (c),
                label: (c),
            }, ...__VLS_functionalComponentArgsRest(__VLS_413));
            __VLS_415.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_415.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.dimension_values?.[c] ?? '');
            }
            var __VLS_415;
        }
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.detailMeasCols))) {
            const __VLS_416 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
                key: ('m-' + c),
                prop: (c),
                label: (c),
            }));
            const __VLS_418 = __VLS_417({
                key: ('m-' + c),
                prop: (c),
                label: (c),
            }, ...__VLS_functionalComponentArgsRest(__VLS_417));
            __VLS_419.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_419.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.measure_values?.[c] ?? '');
            }
            var __VLS_419;
        }
        const __VLS_420 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
            prop: "value",
            label: "值",
            width: "120",
        }));
        const __VLS_422 = __VLS_421({
            prop: "value",
            label: "值",
            width: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_421));
        var __VLS_411;
        if ((__VLS_ctx.resultDetail.total || 0) > __VLS_ctx.detailPageSize) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            (__VLS_ctx.resultDetail.total || 0);
            (__VLS_ctx.resultDetail.page || 1);
            (Math.ceil((__VLS_ctx.resultDetail.total || 0) / (__VLS_ctx.resultDetail.page_size || 1)));
            const __VLS_424 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                disabled: ((__VLS_ctx.resultDetail.page || 1) <= 1),
            }));
            const __VLS_426 = __VLS_425({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                disabled: ((__VLS_ctx.resultDetail.page || 1) <= 1),
            }, ...__VLS_functionalComponentArgsRest(__VLS_425));
            let __VLS_428;
            let __VLS_429;
            let __VLS_430;
            const __VLS_431 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.detailMetric))
                        return;
                    if (!!(__VLS_ctx.resultDetailLoading))
                        return;
                    if (!(__VLS_ctx.resultDetail && __VLS_ctx.resultDetail.permission_level === 'full'))
                        return;
                    if (!((__VLS_ctx.resultDetail.total || 0) > __VLS_ctx.detailPageSize))
                        return;
                    __VLS_ctx.changeDetailPage((__VLS_ctx.resultDetail.page || 1) - 1);
                }
            };
            __VLS_427.slots.default;
            var __VLS_427;
            const __VLS_432 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                disabled: ((__VLS_ctx.resultDetail.page || 1) >= Math.ceil((__VLS_ctx.resultDetail.total || 0) / (__VLS_ctx.resultDetail.page_size || 1))),
            }));
            const __VLS_434 = __VLS_433({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                disabled: ((__VLS_ctx.resultDetail.page || 1) >= Math.ceil((__VLS_ctx.resultDetail.total || 0) / (__VLS_ctx.resultDetail.page_size || 1))),
            }, ...__VLS_functionalComponentArgsRest(__VLS_433));
            let __VLS_436;
            let __VLS_437;
            let __VLS_438;
            const __VLS_439 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.detailMetric))
                        return;
                    if (!!(__VLS_ctx.resultDetailLoading))
                        return;
                    if (!(__VLS_ctx.resultDetail && __VLS_ctx.resultDetail.permission_level === 'full'))
                        return;
                    if (!((__VLS_ctx.resultDetail.total || 0) > __VLS_ctx.detailPageSize))
                        return;
                    __VLS_ctx.changeDetailPage((__VLS_ctx.resultDetail.page || 1) + 1);
                }
            };
            __VLS_435.slots.default;
            var __VLS_435;
        }
    }
    else if (__VLS_ctx.resultDetail && __VLS_ctx.resultDetail.permission_level === 'summary_only') {
        const __VLS_440 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({
            description: "您没有数据明细权限，仅可查看汇总值",
            imageSize: (80),
        }));
        const __VLS_442 = __VLS_441({
            description: "您没有数据明细权限，仅可查看汇总值",
            imageSize: (80),
        }, ...__VLS_functionalComponentArgsRest(__VLS_441));
    }
    else if (__VLS_ctx.lastComputeStatus === 'failed') {
        const __VLS_444 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({
            description: (__VLS_ctx.lastComputeError || '计算失败，无法加载明细'),
            imageSize: (80),
        }));
        const __VLS_446 = __VLS_445({
            description: (__VLS_ctx.lastComputeError || '计算失败，无法加载明细'),
            imageSize: (80),
        }, ...__VLS_functionalComponentArgsRest(__VLS_445));
    }
    else {
        const __VLS_448 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_449 = __VLS_asFunctionalComponent(__VLS_448, new __VLS_448({
            description: "点击上方某一期计算结果，查看其明细",
            imageSize: (80),
        }));
        const __VLS_450 = __VLS_449({
            description: "点击上方某一期计算结果，查看其明细",
            imageSize: (80),
        }, ...__VLS_functionalComponentArgsRest(__VLS_449));
    }
    var __VLS_399;
    const __VLS_452 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_454 = __VLS_453({
        shadow: "never",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_453));
    __VLS_455.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_455.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    const __VLS_456 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_457 = __VLS_asFunctionalComponent(__VLS_456, new __VLS_456({
        data: (__VLS_ctx.runs),
        size: "small",
        border: true,
        emptyText: "暂无记录",
        maxHeight: "200",
    }));
    const __VLS_458 = __VLS_457({
        data: (__VLS_ctx.runs),
        size: "small",
        border: true,
        emptyText: "暂无记录",
        maxHeight: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_457));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.runsLoading) }, null, null);
    __VLS_459.slots.default;
    const __VLS_460 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_461 = __VLS_asFunctionalComponent(__VLS_460, new __VLS_460({
        prop: "status",
        label: "状态",
        width: "80",
    }));
    const __VLS_462 = __VLS_461({
        prop: "status",
        label: "状态",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_461));
    __VLS_463.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_463.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_464 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_465 = __VLS_asFunctionalComponent(__VLS_464, new __VLS_464({
            size: "small",
            type: (row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : row.status === 'running' ? 'warning' : 'info'),
        }));
        const __VLS_466 = __VLS_465({
            size: "small",
            type: (row.status === 'success' ? 'success' : row.status === 'failed' ? 'danger' : row.status === 'running' ? 'warning' : 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_465));
        __VLS_467.slots.default;
        (__VLS_ctx.METRIC_RUN_STATUS_LABELS[row.status] || row.status);
        var __VLS_467;
    }
    var __VLS_463;
    const __VLS_468 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_469 = __VLS_asFunctionalComponent(__VLS_468, new __VLS_468({
        prop: "period",
        label: "周期",
        width: "100",
    }));
    const __VLS_470 = __VLS_469({
        prop: "period",
        label: "周期",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_469));
    const __VLS_472 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({
        prop: "error_message",
        label: "错误信息",
        minWidth: "160",
        showOverflowTooltip: true,
    }));
    const __VLS_474 = __VLS_473({
        prop: "error_message",
        label: "错误信息",
        minWidth: "160",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_473));
    const __VLS_476 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
        prop: "started_at",
        label: "开始时间",
        width: "160",
    }));
    const __VLS_478 = __VLS_477({
        prop: "started_at",
        label: "开始时间",
        width: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_477));
    __VLS_479.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_479.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.started_at));
    }
    var __VLS_479;
    const __VLS_480 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
        prop: "finished_at",
        label: "结束时间",
        width: "160",
    }));
    const __VLS_482 = __VLS_481({
        prop: "finished_at",
        label: "结束时间",
        width: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_481));
    __VLS_483.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_483.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.finished_at));
    }
    var __VLS_483;
    var __VLS_459;
    var __VLS_455;
    if (__VLS_ctx.detailMetric) {
        /** @type {[typeof MetricAutomationPanel, ]} */ ;
        // @ts-ignore
        const __VLS_484 = __VLS_asFunctionalComponent(MetricAutomationPanel, new MetricAutomationPanel({
            metricId: (__VLS_ctx.detailMetric.id),
            metricCode: (__VLS_ctx.detailMetric.metric_code),
            metricName: (__VLS_ctx.detailMetric.metric_name),
        }));
        const __VLS_485 = __VLS_484({
            metricId: (__VLS_ctx.detailMetric.id),
            metricCode: (__VLS_ctx.detailMetric.metric_code),
            metricName: (__VLS_ctx.detailMetric.metric_name),
        }, ...__VLS_functionalComponentArgsRest(__VLS_484));
    }
}
var __VLS_167;
if (__VLS_ctx.dialogVisible) {
    /** @type {[typeof FormulaFieldEditor, typeof FormulaFieldEditor, ]} */ ;
    // @ts-ignore
    const __VLS_487 = __VLS_asFunctionalComponent(FormulaFieldEditor, new FormulaFieldEditor({
        ...{ 'onUpdate:visible': {} },
        ...{ 'onFormulaChange': {} },
        key: (__VLS_ctx.formulaEditorKey),
        visible: (__VLS_ctx.dialogVisible),
        title: (__VLS_ctx.editorTitle),
        subtitle: (__VLS_ctx.editorSubtitle),
        datasetId: (__VLS_ctx.form.related_dataset_id || null),
        fields: (__VLS_ctx.formulaEditorFields),
        initialFormula: (__VLS_ctx.form.formula_expr),
        sourceGroups: ([]),
        hideDefaultConfig: (true),
        hideDefaultActions: (true),
    }));
    const __VLS_488 = __VLS_487({
        ...{ 'onUpdate:visible': {} },
        ...{ 'onFormulaChange': {} },
        key: (__VLS_ctx.formulaEditorKey),
        visible: (__VLS_ctx.dialogVisible),
        title: (__VLS_ctx.editorTitle),
        subtitle: (__VLS_ctx.editorSubtitle),
        datasetId: (__VLS_ctx.form.related_dataset_id || null),
        fields: (__VLS_ctx.formulaEditorFields),
        initialFormula: (__VLS_ctx.form.formula_expr),
        sourceGroups: ([]),
        hideDefaultConfig: (true),
        hideDefaultActions: (true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_487));
    let __VLS_490;
    let __VLS_491;
    let __VLS_492;
    const __VLS_493 = {
        'onUpdate:visible': (...[$event]) => {
            if (!(__VLS_ctx.dialogVisible))
                return;
            __VLS_ctx.dialogVisible = $event;
        }
    };
    const __VLS_494 = {
        onFormulaChange: ((v) => __VLS_ctx.form.formula_expr = v)
    };
    __VLS_489.slots.default;
    {
        const { config: __VLS_thisSlot } = __VLS_489.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "config-card" },
        });
        const __VLS_495 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_496 = __VLS_asFunctionalComponent(__VLS_495, new __VLS_495({
            labelPosition: "top",
            ...{ class: "config-form" },
            size: "small",
        }));
        const __VLS_497 = __VLS_496({
            labelPosition: "top",
            ...{ class: "config-form" },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_496));
        __VLS_498.slots.default;
        const __VLS_499 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_500 = __VLS_asFunctionalComponent(__VLS_499, new __VLS_499({
            label: "依赖数据集",
        }));
        const __VLS_501 = __VLS_500({
            label: "依赖数据集",
        }, ...__VLS_functionalComponentArgsRest(__VLS_500));
        __VLS_502.slots.default;
        const __VLS_503 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_504 = __VLS_asFunctionalComponent(__VLS_503, new __VLS_503({
            ...{ 'onFocus': {} },
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.form.related_dataset_id),
            clearable: true,
            filterable: true,
            placeholder: "选择数据集",
            ...{ style: {} },
            loading: (__VLS_ctx.loadingDatasets),
        }));
        const __VLS_505 = __VLS_504({
            ...{ 'onFocus': {} },
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.form.related_dataset_id),
            clearable: true,
            filterable: true,
            placeholder: "选择数据集",
            ...{ style: {} },
            loading: (__VLS_ctx.loadingDatasets),
        }, ...__VLS_functionalComponentArgsRest(__VLS_504));
        let __VLS_507;
        let __VLS_508;
        let __VLS_509;
        const __VLS_510 = {
            onFocus: (__VLS_ctx.loadDatasetOptions)
        };
        const __VLS_511 = {
            onChange: (__VLS_ctx.onDatasetChange)
        };
        __VLS_506.slots.default;
        for (const [ds] of __VLS_getVForSourceType((__VLS_ctx.datasetOptions))) {
            const __VLS_512 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
                key: (ds.id),
                label: (`${ds.label} (${ds.layer})`),
                value: (ds.id),
            }));
            const __VLS_514 = __VLS_513({
                key: (ds.id),
                label: (`${ds.label} (${ds.layer})`),
                value: (ds.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_513));
            __VLS_515.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (ds.label);
            const __VLS_516 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
                size: "small",
                type: "info",
                ...{ style: {} },
            }));
            const __VLS_518 = __VLS_517({
                size: "small",
                type: "info",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_517));
            __VLS_519.slots.default;
            (ds.layer);
            var __VLS_519;
            var __VLS_515;
        }
        var __VLS_506;
        var __VLS_502;
        if (__VLS_ctx.form.formula_expr) {
            const __VLS_520 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
                label: "指标类型",
            }));
            const __VLS_522 = __VLS_521({
                label: "指标类型",
            }, ...__VLS_functionalComponentArgsRest(__VLS_521));
            __VLS_523.slots.default;
            const __VLS_524 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_525 = __VLS_asFunctionalComponent(__VLS_524, new __VLS_524({
                type: (__VLS_ctx.metricTypeTagType),
                size: "small",
            }));
            const __VLS_526 = __VLS_525({
                type: (__VLS_ctx.metricTypeTagType),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_525));
            __VLS_527.slots.default;
            (__VLS_ctx.metricTypeLabel);
            var __VLS_527;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            var __VLS_523;
        }
        if (__VLS_ctx.form.related_dataset_id && __VLS_ctx.form.formula_expr) {
            const __VLS_528 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_529 = __VLS_asFunctionalComponent(__VLS_528, new __VLS_528({
                label: "",
            }));
            const __VLS_530 = __VLS_529({
                label: "",
            }, ...__VLS_functionalComponentArgsRest(__VLS_529));
            __VLS_531.slots.default;
            const __VLS_532 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_533 = __VLS_asFunctionalComponent(__VLS_532, new __VLS_532({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                type: "primary",
                ...{ style: {} },
            }));
            const __VLS_534 = __VLS_533({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
                type: "primary",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_533));
            let __VLS_536;
            let __VLS_537;
            let __VLS_538;
            const __VLS_539 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.dialogVisible))
                        return;
                    if (!(__VLS_ctx.form.related_dataset_id && __VLS_ctx.form.formula_expr))
                        return;
                    __VLS_ctx.showSql = !__VLS_ctx.showSql;
                }
            };
            __VLS_535.slots.default;
            (__VLS_ctx.showSql ? '▾ 收起编译预览' : '▸ 展开编译预览');
            var __VLS_535;
            if (__VLS_ctx.showSql) {
                const __VLS_540 = {}.ElCard;
                /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
                // @ts-ignore
                const __VLS_541 = __VLS_asFunctionalComponent(__VLS_540, new __VLS_540({
                    shadow: "never",
                    size: "small",
                    ...{ style: {} },
                }));
                const __VLS_542 = __VLS_541({
                    shadow: "never",
                    size: "small",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_541));
                __VLS_543.slots.default;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                if (__VLS_ctx.compiling) {
                    const __VLS_544 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_545 = __VLS_asFunctionalComponent(__VLS_544, new __VLS_544({
                        type: "info",
                        size: "small",
                    }));
                    const __VLS_546 = __VLS_545({
                        type: "info",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_545));
                    __VLS_547.slots.default;
                    var __VLS_547;
                }
                else if (__VLS_ctx.compileResult && __VLS_ctx.compileResult.valid) {
                    const __VLS_548 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_549 = __VLS_asFunctionalComponent(__VLS_548, new __VLS_548({
                        type: "success",
                        size: "small",
                    }));
                    const __VLS_550 = __VLS_549({
                        type: "success",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_549));
                    __VLS_551.slots.default;
                    var __VLS_551;
                }
                else if (__VLS_ctx.compileResult && !__VLS_ctx.compileResult.valid) {
                    const __VLS_552 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_553 = __VLS_asFunctionalComponent(__VLS_552, new __VLS_552({
                        type: "danger",
                        size: "small",
                    }));
                    const __VLS_554 = __VLS_553({
                        type: "danger",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_553));
                    __VLS_555.slots.default;
                    ((__VLS_ctx.compileResult.errors || []).length);
                    var __VLS_555;
                }
                else {
                    const __VLS_556 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_557 = __VLS_asFunctionalComponent(__VLS_556, new __VLS_556({
                        type: "info",
                        size: "small",
                    }));
                    const __VLS_558 = __VLS_557({
                        type: "info",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_557));
                    __VLS_559.slots.default;
                    var __VLS_559;
                }
                if (__VLS_ctx.compileResult && (__VLS_ctx.compileResult.dependencies || []).length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ style: {} },
                    });
                    for (const [dep] of __VLS_getVForSourceType((__VLS_ctx.compileResult.dependencies))) {
                        const __VLS_560 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_561 = __VLS_asFunctionalComponent(__VLS_560, new __VLS_560({
                            key: (dep.field_code),
                            size: "small",
                            type: "primary",
                            effect: "plain",
                            ...{ style: {} },
                        }));
                        const __VLS_562 = __VLS_561({
                            key: (dep.field_code),
                            size: "small",
                            type: "primary",
                            effect: "plain",
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_561));
                        __VLS_563.slots.default;
                        (dep.field_label || dep.field_code);
                        var __VLS_563;
                    }
                }
                if (__VLS_ctx.compileResult && (__VLS_ctx.compileResult.functions || []).length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ style: {} },
                    });
                    for (const [fn] of __VLS_getVForSourceType((__VLS_ctx.compileResult.functions))) {
                        const __VLS_564 = {}.ElTag;
                        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                        // @ts-ignore
                        const __VLS_565 = __VLS_asFunctionalComponent(__VLS_564, new __VLS_564({
                            key: (fn),
                            size: "small",
                            type: "warning",
                            effect: "plain",
                            ...{ style: {} },
                        }));
                        const __VLS_566 = __VLS_565({
                            key: (fn),
                            size: "small",
                            type: "warning",
                            effect: "plain",
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_565));
                        __VLS_567.slots.default;
                        (fn);
                        var __VLS_567;
                    }
                }
                if (__VLS_ctx.compileResult && __VLS_ctx.compileResult.sql) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ style: {} },
                    });
                    const __VLS_568 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_569 = __VLS_asFunctionalComponent(__VLS_568, new __VLS_568({
                        modelValue: (__VLS_ctx.compileResult.sql),
                        type: "textarea",
                        rows: (4),
                        readonly: true,
                        ...{ style: {} },
                    }));
                    const __VLS_570 = __VLS_569({
                        modelValue: (__VLS_ctx.compileResult.sql),
                        type: "textarea",
                        rows: (4),
                        readonly: true,
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_569));
                }
                for (const [e, i] of __VLS_getVForSourceType(((__VLS_ctx.compileResult ? __VLS_ctx.compileResult.errors : [])))) {
                    const __VLS_572 = {}.ElAlert;
                    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
                    // @ts-ignore
                    const __VLS_573 = __VLS_asFunctionalComponent(__VLS_572, new __VLS_572({
                        key: ('e' + i),
                        type: "error",
                        closable: (false),
                        showIcon: true,
                        ...{ style: {} },
                    }));
                    const __VLS_574 = __VLS_573({
                        key: ('e' + i),
                        type: "error",
                        closable: (false),
                        showIcon: true,
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_573));
                    __VLS_575.slots.default;
                    {
                        const { title: __VLS_thisSlot } = __VLS_575.slots;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ style: {} },
                        });
                        (e.code);
                        (e.message);
                    }
                    var __VLS_575;
                }
                var __VLS_543;
            }
            var __VLS_531;
        }
        if (__VLS_ctx.ratioFormulaDetected && __VLS_ctx.editMode === 'formula' && __VLS_ctx.form.related_dataset_id) {
            const __VLS_576 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_577 = __VLS_asFunctionalComponent(__VLS_576, new __VLS_576({
                label: "",
            }));
            const __VLS_578 = __VLS_577({
                label: "",
            }, ...__VLS_functionalComponentArgsRest(__VLS_577));
            __VLS_579.slots.default;
            const __VLS_580 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_581 = __VLS_asFunctionalComponent(__VLS_580, new __VLS_580({
                type: "warning",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }));
            const __VLS_582 = __VLS_581({
                type: "warning",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_581));
            __VLS_583.slots.default;
            {
                const { title: __VLS_thisSlot } = __VLS_583.slots;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
            }
            {
                const { default: __VLS_thisSlot } = __VLS_583.slots;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                const __VLS_584 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_585 = __VLS_asFunctionalComponent(__VLS_584, new __VLS_584({
                    ...{ 'onClick': {} },
                    size: "small",
                }));
                const __VLS_586 = __VLS_585({
                    ...{ 'onClick': {} },
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_585));
                let __VLS_588;
                let __VLS_589;
                let __VLS_590;
                const __VLS_591 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.dialogVisible))
                            return;
                        if (!(__VLS_ctx.ratioFormulaDetected && __VLS_ctx.editMode === 'formula' && __VLS_ctx.form.related_dataset_id))
                            return;
                        __VLS_ctx.ratioFormulaDetected = false;
                    }
                };
                __VLS_587.slots.default;
                var __VLS_587;
                const __VLS_592 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_593 = __VLS_asFunctionalComponent(__VLS_592, new __VLS_592({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    loading: (__VLS_ctx.decomposing),
                }));
                const __VLS_594 = __VLS_593({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    loading: (__VLS_ctx.decomposing),
                }, ...__VLS_functionalComponentArgsRest(__VLS_593));
                let __VLS_596;
                let __VLS_597;
                let __VLS_598;
                const __VLS_599 = {
                    onClick: (__VLS_ctx.switchToComponentMode)
                };
                __VLS_595.slots.default;
                var __VLS_595;
            }
            var __VLS_583;
            var __VLS_579;
        }
        if (__VLS_ctx.form.related_dataset_id && __VLS_ctx.form.formula_expr) {
            const __VLS_600 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_601 = __VLS_asFunctionalComponent(__VLS_600, new __VLS_600({
                label: "计算模式",
                ref: "computeModeRef",
            }));
            const __VLS_602 = __VLS_601({
                label: "计算模式",
                ref: "computeModeRef",
            }, ...__VLS_functionalComponentArgsRest(__VLS_601));
            /** @type {typeof __VLS_ctx.computeModeRef} */ ;
            var __VLS_604 = {};
            __VLS_603.slots.default;
            const __VLS_606 = {}.ElRadioGroup;
            /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
            // @ts-ignore
            const __VLS_607 = __VLS_asFunctionalComponent(__VLS_606, new __VLS_606({
                modelValue: (__VLS_ctx.editMode),
                size: "small",
            }));
            const __VLS_608 = __VLS_607({
                modelValue: (__VLS_ctx.editMode),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_607));
            __VLS_609.slots.default;
            const __VLS_610 = {}.ElRadioButton;
            /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
            // @ts-ignore
            const __VLS_611 = __VLS_asFunctionalComponent(__VLS_610, new __VLS_610({
                value: "formula",
            }));
            const __VLS_612 = __VLS_611({
                value: "formula",
            }, ...__VLS_functionalComponentArgsRest(__VLS_611));
            __VLS_613.slots.default;
            var __VLS_613;
            const __VLS_614 = {}.ElRadioButton;
            /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
            // @ts-ignore
            const __VLS_615 = __VLS_asFunctionalComponent(__VLS_614, new __VLS_614({
                value: "component",
                disabled: (!__VLS_ctx.isRatioFormula(__VLS_ctx.form.formula_expr)),
            }));
            const __VLS_616 = __VLS_615({
                value: "component",
                disabled: (!__VLS_ctx.isRatioFormula(__VLS_ctx.form.formula_expr)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_615));
            __VLS_617.slots.default;
            var __VLS_617;
            var __VLS_609;
            var __VLS_603;
        }
        if (__VLS_ctx.editMode === 'component') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ref: "componentConfigRef",
                ...{ style: {} },
            });
            /** @type {typeof __VLS_ctx.componentConfigRef} */ ;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            const __VLS_618 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_619 = __VLS_asFunctionalComponent(__VLS_618, new __VLS_618({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                loading: (__VLS_ctx.decomposing),
            }));
            const __VLS_620 = __VLS_619({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                loading: (__VLS_ctx.decomposing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_619));
            let __VLS_622;
            let __VLS_623;
            let __VLS_624;
            const __VLS_625 = {
                onClick: (__VLS_ctx.switchToComponentMode)
            };
            __VLS_621.slots.default;
            var __VLS_621;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
                ...{ class: "component-table" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
            for (const [row, $index] of __VLS_getVForSourceType((__VLS_ctx.componentRows))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                    key: ($index),
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ style: {} },
                });
                const __VLS_626 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_627 = __VLS_asFunctionalComponent(__VLS_626, new __VLS_626({
                    size: "small",
                    type: (row.role === 'numerator' ? 'danger' : row.role === 'denominator' ? 'warning' : 'info'),
                }));
                const __VLS_628 = __VLS_627({
                    size: "small",
                    type: (row.role === 'numerator' ? 'danger' : row.role === 'denominator' ? 'warning' : 'info'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_627));
                __VLS_629.slots.default;
                (__VLS_ctx.COMPONENT_ROLE_LABELS[row.role] || row.role);
                var __VLS_629;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ style: {} },
                });
                const __VLS_630 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_631 = __VLS_asFunctionalComponent(__VLS_630, new __VLS_630({
                    modelValue: (row.component_name),
                    size: "small",
                }));
                const __VLS_632 = __VLS_631({
                    modelValue: (row.component_name),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_631));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ style: {} },
                });
                (row.expression);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ style: {} },
                });
                if (row.aggregate_id) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ style: {} },
                    });
                    (__VLS_ctx.publishedAggregates.find(a => a.id === row.aggregate_id)?.name || `#${row.aggregate_id}`);
                    const __VLS_634 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_635 = __VLS_asFunctionalComponent(__VLS_634, new __VLS_634({
                        ...{ 'onClick': {} },
                        size: "small",
                        text: true,
                        type: "danger",
                        ...{ style: {} },
                    }));
                    const __VLS_636 = __VLS_635({
                        ...{ 'onClick': {} },
                        size: "small",
                        text: true,
                        type: "danger",
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_635));
                    let __VLS_638;
                    let __VLS_639;
                    let __VLS_640;
                    const __VLS_641 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.dialogVisible))
                                return;
                            if (!(__VLS_ctx.editMode === 'component'))
                                return;
                            if (!(row.aggregate_id))
                                return;
                            __VLS_ctx.setExistingAggregate($index, null);
                        }
                    };
                    __VLS_637.slots.default;
                    var __VLS_637;
                }
                else if (row.new_aggregate_index !== null) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ style: {} },
                    });
                    (__VLS_ctx.newAggregates[row.new_aggregate_index]?.name);
                    const __VLS_642 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_643 = __VLS_asFunctionalComponent(__VLS_642, new __VLS_642({
                        size: "small",
                        type: "info",
                    }));
                    const __VLS_644 = __VLS_643({
                        size: "small",
                        type: "info",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_643));
                    __VLS_645.slots.default;
                    var __VLS_645;
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ style: {} },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    ...{ style: {} },
                });
                const __VLS_646 = {}.ElPopover;
                /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
                // @ts-ignore
                const __VLS_647 = __VLS_asFunctionalComponent(__VLS_646, new __VLS_646({
                    placement: "left",
                    width: (160),
                    trigger: "click",
                }));
                const __VLS_648 = __VLS_647({
                    placement: "left",
                    width: (160),
                    trigger: "click",
                }, ...__VLS_functionalComponentArgsRest(__VLS_647));
                __VLS_649.slots.default;
                {
                    const { reference: __VLS_thisSlot } = __VLS_649.slots;
                    const __VLS_650 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_651 = __VLS_asFunctionalComponent(__VLS_650, new __VLS_650({
                        size: "small",
                        text: true,
                        ...{ style: {} },
                    }));
                    const __VLS_652 = __VLS_651({
                        size: "small",
                        text: true,
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_651));
                    __VLS_653.slots.default;
                    var __VLS_653;
                }
                const __VLS_654 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_655 = __VLS_asFunctionalComponent(__VLS_654, new __VLS_654({
                    ...{ 'onChange': {} },
                    modelValue: (row.aggregate_id),
                    size: "small",
                    clearable: true,
                    filterable: true,
                    placeholder: "选择已有聚合",
                    ...{ style: {} },
                }));
                const __VLS_656 = __VLS_655({
                    ...{ 'onChange': {} },
                    modelValue: (row.aggregate_id),
                    size: "small",
                    clearable: true,
                    filterable: true,
                    placeholder: "选择已有聚合",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_655));
                let __VLS_658;
                let __VLS_659;
                let __VLS_660;
                const __VLS_661 = {
                    onChange: ((val) => __VLS_ctx.setExistingAggregate($index, val || null))
                };
                __VLS_657.slots.default;
                for (const [agg] of __VLS_getVForSourceType((__VLS_ctx.publishedAggregates))) {
                    const __VLS_662 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_663 = __VLS_asFunctionalComponent(__VLS_662, new __VLS_662({
                        key: (agg.id),
                        label: (agg.name),
                        value: (agg.id),
                    }));
                    const __VLS_664 = __VLS_663({
                        key: (agg.id),
                        label: (agg.name),
                        value: (agg.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_663));
                }
                var __VLS_657;
                var __VLS_649;
            }
            const __VLS_666 = {}.ElForm;
            /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
            // @ts-ignore
            const __VLS_667 = __VLS_asFunctionalComponent(__VLS_666, new __VLS_666({
                labelPosition: "left",
                labelWidth: "70px",
                size: "small",
            }));
            const __VLS_668 = __VLS_667({
                labelPosition: "left",
                labelWidth: "70px",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_667));
            __VLS_669.slots.default;
            const __VLS_670 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_671 = __VLS_asFunctionalComponent(__VLS_670, new __VLS_670({
                label: "组合规则",
            }));
            const __VLS_672 = __VLS_671({
                label: "组合规则",
            }, ...__VLS_functionalComponentArgsRest(__VLS_671));
            __VLS_673.slots.default;
            const __VLS_674 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_675 = __VLS_asFunctionalComponent(__VLS_674, new __VLS_674({
                modelValue: (__VLS_ctx.combinationRule),
                readonly: true,
                ...{ style: {} },
            }));
            const __VLS_676 = __VLS_675({
                modelValue: (__VLS_ctx.combinationRule),
                readonly: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_675));
            var __VLS_673;
            const __VLS_678 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_679 = __VLS_asFunctionalComponent(__VLS_678, new __VLS_678({
                label: "分组维度",
            }));
            const __VLS_680 = __VLS_679({
                label: "分组维度",
            }, ...__VLS_functionalComponentArgsRest(__VLS_679));
            __VLS_681.slots.default;
            const __VLS_682 = {}.ElTooltip;
            /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
            // @ts-ignore
            const __VLS_683 = __VLS_asFunctionalComponent(__VLS_682, new __VLS_682({
                placement: "top",
                effect: "dark",
                rawContent: true,
                content: "计算时 GROUP BY 的字段，由关联的<br/>DWS 聚合定义决定，仅作预览。<br/><br/>如需修改，请前往<br/>「数据建模 → 汇总视图」调整。",
            }));
            const __VLS_684 = __VLS_683({
                placement: "top",
                effect: "dark",
                rawContent: true,
                content: "计算时 GROUP BY 的字段，由关联的<br/>DWS 聚合定义决定，仅作预览。<br/><br/>如需修改，请前往<br/>「数据建模 → 汇总视图」调整。",
            }, ...__VLS_functionalComponentArgsRest(__VLS_683));
            __VLS_685.slots.default;
            const __VLS_686 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_687 = __VLS_asFunctionalComponent(__VLS_686, new __VLS_686({
                ...{ style: {} },
            }));
            const __VLS_688 = __VLS_687({
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_687));
            __VLS_689.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                viewBox: "0 0 24 24",
                width: "14",
                height: "14",
                fill: "currentColor",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z",
            });
            var __VLS_689;
            var __VLS_685;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            for (const [dim] of __VLS_getVForSourceType((__VLS_ctx.inferredDimensions))) {
                const __VLS_690 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_691 = __VLS_asFunctionalComponent(__VLS_690, new __VLS_690({
                    key: (dim),
                    size: "small",
                    type: "success",
                }));
                const __VLS_692 = __VLS_691({
                    key: (dim),
                    size: "small",
                    type: "success",
                }, ...__VLS_functionalComponentArgsRest(__VLS_691));
                __VLS_693.slots.default;
                (dim);
                var __VLS_693;
            }
            if (!__VLS_ctx.inferredDimensions.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
            }
            var __VLS_681;
            var __VLS_669;
        }
        var __VLS_498;
    }
    {
        const { actions: __VLS_thisSlot } = __VLS_489.slots;
        if (__VLS_ctx.dialogMode === 'create') {
            const __VLS_694 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_695 = __VLS_asFunctionalComponent(__VLS_694, new __VLS_694({
                ...{ 'onClick': {} },
            }));
            const __VLS_696 = __VLS_695({
                ...{ 'onClick': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_695));
            let __VLS_698;
            let __VLS_699;
            let __VLS_700;
            const __VLS_701 = {
                onClick: (__VLS_ctx.goToStep1)
            };
            __VLS_697.slots.default;
            var __VLS_697;
        }
        const __VLS_702 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_703 = __VLS_asFunctionalComponent(__VLS_702, new __VLS_702({
            ...{ 'onClick': {} },
        }));
        const __VLS_704 = __VLS_703({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_703));
        let __VLS_706;
        let __VLS_707;
        let __VLS_708;
        const __VLS_709 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.dialogVisible))
                    return;
                __VLS_ctx.dialogVisible = false;
            }
        };
        __VLS_705.slots.default;
        var __VLS_705;
        const __VLS_710 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_711 = __VLS_asFunctionalComponent(__VLS_710, new __VLS_710({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
            disabled: (__VLS_ctx.formulaHasError),
        }));
        const __VLS_712 = __VLS_711({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
            disabled: (__VLS_ctx.formulaHasError),
        }, ...__VLS_functionalComponentArgsRest(__VLS_711));
        let __VLS_714;
        let __VLS_715;
        let __VLS_716;
        const __VLS_717 = {
            onClick: (__VLS_ctx.save)
        };
        __VLS_713.slots.default;
        (__VLS_ctx.editMode === 'component' ? '保存指标 + 组件' : '保存指标');
        var __VLS_713;
    }
    var __VLS_489;
}
const __VLS_718 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_719 = __VLS_asFunctionalComponent(__VLS_718, new __VLS_718({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.step1Visible),
    title: "新建指标 - 基本信息",
    width: "480px",
    closeOnClickModal: (false),
}));
const __VLS_720 = __VLS_719({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.step1Visible),
    title: "新建指标 - 基本信息",
    width: "480px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_719));
let __VLS_722;
let __VLS_723;
let __VLS_724;
const __VLS_725 = {
    onClosed: (__VLS_ctx.closeStep1)
};
__VLS_721.slots.default;
const __VLS_726 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_727 = __VLS_asFunctionalComponent(__VLS_726, new __VLS_726({
    labelPosition: "top",
    size: "small",
}));
const __VLS_728 = __VLS_727({
    labelPosition: "top",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_727));
__VLS_729.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_730 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_731 = __VLS_asFunctionalComponent(__VLS_730, new __VLS_730({
    label: "指标编码",
    required: true,
    ...{ style: {} },
}));
const __VLS_732 = __VLS_731({
    label: "指标编码",
    required: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_731));
__VLS_733.slots.default;
const __VLS_734 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_735 = __VLS_asFunctionalComponent(__VLS_734, new __VLS_734({
    modelValue: (__VLS_ctx.form.metric_code),
    maxlength: "64",
    placeholder: "如 turnover_rate",
}));
const __VLS_736 = __VLS_735({
    modelValue: (__VLS_ctx.form.metric_code),
    maxlength: "64",
    placeholder: "如 turnover_rate",
}, ...__VLS_functionalComponentArgsRest(__VLS_735));
var __VLS_733;
const __VLS_738 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_739 = __VLS_asFunctionalComponent(__VLS_738, new __VLS_738({
    label: "指标名称",
    required: true,
    ...{ style: {} },
}));
const __VLS_740 = __VLS_739({
    label: "指标名称",
    required: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_739));
__VLS_741.slots.default;
const __VLS_742 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_743 = __VLS_asFunctionalComponent(__VLS_742, new __VLS_742({
    modelValue: (__VLS_ctx.form.metric_name),
    maxlength: "128",
    placeholder: "如 离职率",
}));
const __VLS_744 = __VLS_743({
    modelValue: (__VLS_ctx.form.metric_name),
    maxlength: "128",
    placeholder: "如 离职率",
}, ...__VLS_functionalComponentArgsRest(__VLS_743));
var __VLS_741;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_746 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_747 = __VLS_asFunctionalComponent(__VLS_746, new __VLS_746({
    label: "主题域",
    ...{ style: {} },
}));
const __VLS_748 = __VLS_747({
    label: "主题域",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_747));
__VLS_749.slots.default;
const __VLS_750 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_751 = __VLS_asFunctionalComponent(__VLS_750, new __VLS_750({
    modelValue: (__VLS_ctx.form.subject_area),
    placeholder: "如 薪酬",
}));
const __VLS_752 = __VLS_751({
    modelValue: (__VLS_ctx.form.subject_area),
    placeholder: "如 薪酬",
}, ...__VLS_functionalComponentArgsRest(__VLS_751));
var __VLS_749;
const __VLS_754 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_755 = __VLS_asFunctionalComponent(__VLS_754, new __VLS_754({
    label: "负责人",
    ...{ style: {} },
}));
const __VLS_756 = __VLS_755({
    label: "负责人",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_755));
__VLS_757.slots.default;
const __VLS_758 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_759 = __VLS_asFunctionalComponent(__VLS_758, new __VLS_758({
    modelValue: (__VLS_ctx.form.owner_name),
    placeholder: "如 张三",
}));
const __VLS_760 = __VLS_759({
    modelValue: (__VLS_ctx.form.owner_name),
    placeholder: "如 张三",
}, ...__VLS_functionalComponentArgsRest(__VLS_759));
var __VLS_757;
const __VLS_762 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_763 = __VLS_asFunctionalComponent(__VLS_762, new __VLS_762({
    label: "业务定义",
}));
const __VLS_764 = __VLS_763({
    label: "业务定义",
}, ...__VLS_functionalComponentArgsRest(__VLS_763));
__VLS_765.slots.default;
const __VLS_766 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_767 = __VLS_asFunctionalComponent(__VLS_766, new __VLS_766({
    modelValue: (__VLS_ctx.form.business_definition),
    type: "textarea",
    rows: (2),
    placeholder: "指标的业务含义说明",
}));
const __VLS_768 = __VLS_767({
    modelValue: (__VLS_ctx.form.business_definition),
    type: "textarea",
    rows: (2),
    placeholder: "指标的业务含义说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_767));
var __VLS_765;
const __VLS_770 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_771 = __VLS_asFunctionalComponent(__VLS_770, new __VLS_770({
    label: "口径说明",
}));
const __VLS_772 = __VLS_771({
    label: "口径说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_771));
__VLS_773.slots.default;
const __VLS_774 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_775 = __VLS_asFunctionalComponent(__VLS_774, new __VLS_774({
    modelValue: (__VLS_ctx.form.calculation_desc),
    type: "textarea",
    rows: (2),
    placeholder: "计算口径的文字说明",
}));
const __VLS_776 = __VLS_775({
    modelValue: (__VLS_ctx.form.calculation_desc),
    type: "textarea",
    rows: (2),
    placeholder: "计算口径的文字说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_775));
var __VLS_773;
var __VLS_729;
{
    const { footer: __VLS_thisSlot } = __VLS_721.slots;
    const __VLS_778 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_779 = __VLS_asFunctionalComponent(__VLS_778, new __VLS_778({
        ...{ 'onClick': {} },
    }));
    const __VLS_780 = __VLS_779({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_779));
    let __VLS_782;
    let __VLS_783;
    let __VLS_784;
    const __VLS_785 = {
        onClick: (...[$event]) => {
            __VLS_ctx.step1Visible = false;
        }
    };
    __VLS_781.slots.default;
    var __VLS_781;
    const __VLS_786 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_787 = __VLS_asFunctionalComponent(__VLS_786, new __VLS_786({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_788 = __VLS_787({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_787));
    let __VLS_790;
    let __VLS_791;
    let __VLS_792;
    const __VLS_793 = {
        onClick: (__VLS_ctx.goToStep2)
    };
    __VLS_789.slots.default;
    var __VLS_789;
}
var __VLS_721;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['config-card']} */ ;
/** @type {__VLS_StyleScopedClasses['config-form']} */ ;
/** @type {__VLS_StyleScopedClasses['component-table']} */ ;
// @ts-ignore
var __VLS_605 = __VLS_604;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Plus: Plus,
            Search: Search,
            Refresh: Refresh,
            Edit: Edit,
            Finished: Finished,
            FolderDelete: FolderDelete,
            TrendCharts: TrendCharts,
            VideoPlay: VideoPlay,
            Loading: Loading,
            METRIC_RUN_STATUS_LABELS: METRIC_RUN_STATUS_LABELS,
            COMPONENT_ROLE_LABELS: COMPONENT_ROLE_LABELS,
            MetricAutomationPanel: MetricAutomationPanel,
            FormulaFieldEditor: FormulaFieldEditor,
            userStore: userStore,
            metrics: metrics,
            loading: loading,
            total: total,
            page: page,
            pageSize: pageSize,
            keyword: keyword,
            statusFilter: statusFilter,
            TYPE_LABELS: TYPE_LABELS,
            metricTypeLabel: metricTypeLabel,
            metricTypeTagType: metricTypeTagType,
            STATUS_LABELS: STATUS_LABELS,
            STATUS_TAG: STATUS_TAG,
            detailVisible: detailVisible,
            detailMetric: detailMetric,
            results: results,
            runs: runs,
            resultsLoading: resultsLoading,
            runsLoading: runsLoading,
            computePeriod: computePeriod,
            computing: computing,
            explainContext: explainContext,
            lineageGraph: lineageGraph,
            lineageLoading: lineageLoading,
            downstreamRefs: downstreamRefs,
            downstreamRefsLoading: downstreamRefsLoading,
            resultDetail: resultDetail,
            resultDetailLoading: resultDetailLoading,
            detailPageSize: detailPageSize,
            exporting: exporting,
            detailDimCols: detailDimCols,
            detailMeasCols: detailMeasCols,
            load: load,
            openDetail: openDetail,
            changeDetailPage: changeDetailPage,
            onResultRowClick: onResultRowClick,
            handleExportDetail: handleExportDetail,
            lastComputeStatus: lastComputeStatus,
            lastComputeError: lastComputeError,
            computedResult: computedResult,
            doCompute: doCompute,
            doRecalc: doRecalc,
            metricResultDisplay: metricResultDisplay,
            getNodeLabel: getNodeLabel,
            downstreamTypeLabel: downstreamTypeLabel,
            trendData: trendData,
            dialogVisible: dialogVisible,
            dialogMode: dialogMode,
            step1Visible: step1Visible,
            form: form,
            saving: saving,
            datasetOptions: datasetOptions,
            loadingDatasets: loadingDatasets,
            formulaEditorFields: formulaEditorFields,
            formulaEditorKey: formulaEditorKey,
            editorTitle: editorTitle,
            editorSubtitle: editorSubtitle,
            editMode: editMode,
            ratioFormulaDetected: ratioFormulaDetected,
            decomposing: decomposing,
            componentRows: componentRows,
            newAggregates: newAggregates,
            combinationRule: combinationRule,
            inferredDimensions: inferredDimensions,
            publishedAggregates: publishedAggregates,
            computeModeRef: computeModeRef,
            componentConfigRef: componentConfigRef,
            isRatioFormula: isRatioFormula,
            switchToComponentMode: switchToComponentMode,
            setExistingAggregate: setExistingAggregate,
            loadDatasetOptions: loadDatasetOptions,
            openCreate: openCreate,
            goToStep2: goToStep2,
            goToStep1: goToStep1,
            closeStep1: closeStep1,
            openEdit: openEdit,
            save: save,
            onDatasetChange: onDatasetChange,
            compileResult: compileResult,
            compiling: compiling,
            showSql: showSql,
            formulaHasError: formulaHasError,
            doPublish: doPublish,
            doArchive: doArchive,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
