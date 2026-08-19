/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, VideoPlay, Switch, Delete, Edit, InfoFilled, Loading, Clock, RefreshRight } from '@element-plus/icons-vue';
import { listQualityRules, createQualityRule, updateQualityRule, enableQualityRule, disableQualityRule, deleteQualityRule, runQualityRule, getQualityAlerts, listQualityRuns, getQualityRelationMetadata, listQualityStatus, getQualityStatusImpact, rebuildQualityStatusIndex, QUALITY_RULE_TYPE_LABELS, QUALITY_SEVERITY_LABELS, } from '@/api/warehouse';
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue';
// ==================== 状态 ====================
const loading = ref(false);
const rules = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
// 筛选
const filterAssetType = ref('');
const filterRuleType = ref('');
const filterEnabled = ref(undefined);
// 表单
const dialogVisible = ref(false);
const dialogTitle = ref('新建质量规则');
const editingId = ref(null);
const formRef = ref(null);
const qualityMetadata = ref([]);
const qualityMetadataLoading = ref(false);
const form = reactive({
    asset_type: 'table',
    asset_code: '',
    rule_type: 'not_null',
    rule_config: { column: '' },
    enabled: true,
    severity: 'warn',
});
// 运行结果
const runDialogVisible = ref(false);
const runResult = ref(null);
const runLoading = ref(false);
// 告警摘要
const alerts = ref(null);
const statusLoading = ref(false);
const statusError = ref('');
const statusStale = ref(false);
const qualityPeriod = ref(new Date().toISOString().slice(0, 7).replace('-', ''));
const qualityStatuses = ref([]);
const impactVisible = ref(false);
const impactLoading = ref(false);
const impactError = ref('');
const selectedStatus = ref(null);
const selectedImpact = ref(null);
const rebuildingIndex = ref(false);
const statusSummary = computed(() => qualityStatuses.value.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
}, { pending: 0, passed: 0, warning: 0, failed: 0 }));
function qualityStatusLabel(status) {
    return { pending: '待检查', passed: '通过', warning: '警告', failed: '失败' }[status] || status;
}
function qualityStatusTagType(status) {
    return { pending: 'info', passed: 'success', warning: 'warning', failed: 'danger' }[status] || 'info';
}
function isStatusStale(item) {
    if (!item.checked_at)
        return true;
    return Date.now() - new Date(item.checked_at).getTime() > 24 * 60 * 60 * 1000;
}
async function loadQualityStatuses() {
    statusLoading.value = true;
    statusError.value = '';
    try {
        const response = await listQualityStatus({ period: qualityPeriod.value });
        qualityStatuses.value = response.items;
        statusStale.value = qualityStatuses.value.some(isStatusStale);
    }
    catch (error) {
        qualityStatuses.value = [];
        statusError.value = error?.response?.status === 403 ? 'forbidden' : (error?.response?.data?.detail || '质量状态暂时不可用');
    }
    finally {
        statusLoading.value = false;
    }
}
async function showQualityImpact(item) {
    selectedStatus.value = item;
    selectedImpact.value = null;
    impactError.value = '';
    impactVisible.value = true;
    impactLoading.value = true;
    try {
        selectedImpact.value = await getQualityStatusImpact({ asset_type: item.asset_type, asset_id: item.asset_id, asset_code: item.asset_code, period: item.period });
    }
    catch (error) {
        impactError.value = error?.response?.status === 403 ? '无权限查看质量影响范围' : (error?.response?.data?.detail || '加载质量影响范围失败');
    }
    finally {
        impactLoading.value = false;
    }
}
async function handleRebuildIndex() {
    if (rebuildingIndex.value)
        return;
    rebuildingIndex.value = true;
    try {
        const result = await rebuildQualityStatusIndex();
        ElMessage.success(`索引已刷新，共 ${result.rebuilt_count} 条状态`);
        await loadQualityStatuses();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '重建索引失败');
    }
    finally {
        rebuildingIndex.value = false;
    }
}
// 运行历史 + 重跑
const runsVisible = ref(false);
const runs = ref([]);
const runsRuleId = ref(0);
const runsTotal = ref(0);
const retrying = ref(new Set());
async function showRuns(ruleId) {
    runsRuleId.value = ruleId;
    try {
        const res = await listQualityRuns({ rule_id: ruleId, page_size: 20 });
        runs.value = res.items;
        runsTotal.value = res.total;
    }
    catch {
        runs.value = [];
    }
    runsVisible.value = true;
}
async function retryQualityRun(ruleId, period) {
    retrying.value.add(ruleId);
    try {
        await runQualityRule(ruleId);
        ElMessage.success('已重新执行');
        runsVisible.value = false;
        load();
        loadAlerts();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '重试失败');
    }
    finally {
        retrying.value.delete(ruleId);
    }
}
// 定时配置
const scheduleVisible = ref(false);
const scheduleBizId = ref(0);
const scheduleBizName = ref('');
function openSchedule(rule) {
    scheduleBizId.value = rule.id;
    scheduleBizName.value = `${rule.asset_code} (${QUALITY_RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type})`;
    scheduleVisible.value = true;
}
// ==================== 计算 ====================
const relationDatasets = computed(() => qualityMetadata.value);
const selectedQualityDataset = computed(() => relationDatasets.value.find(d => d.id === Number(form.rule_config?.dataset_id)));
const relationOptions = computed(() => selectedQualityDataset.value?.relations || []);
const selectedQualityRelation = computed(() => relationOptions.value.find(r => r.id === Number(form.rule_config?.relation_id)));
async function loadQualityMetadata() {
    qualityMetadataLoading.value = true;
    try {
        qualityMetadata.value = (await getQualityRelationMetadata()).datasets;
    }
    catch {
        qualityMetadata.value = [];
        ElMessage.error('加载关系元数据失败，无法配置关系质量规则');
    }
    finally {
        qualityMetadataLoading.value = false;
    }
}
function onQualityDatasetChange() {
    form.rule_config.relation_id = null;
    form.rule_config.left_period_column = '';
    form.rule_config.right_period_column = '';
    form.asset_type = 'relation';
}
function onQualityRelationChange() {
    const relation = selectedQualityRelation.value;
    if (!relation)
        return;
    form.asset_type = 'relation';
    form.asset_code = String(relation.id);
    form.rule_config.expected_cardinality = relation.cardinality;
    form.rule_config.left_period_column = relation.left_period_column || '';
    form.rule_config.right_period_column = relation.right_period_column || '';
}
const ruleTypeOptions = computed(() => Object.entries(QUALITY_RULE_TYPE_LABELS).map(([value, label]) => ({ value, label })));
const severityOptions = computed(() => Object.entries(QUALITY_SEVERITY_LABELS).map(([value, label]) => ({ value, label })));
/** 不可执行的规则类型（Q0309） */
const isUnexecutable = (ruleType) => ruleType === 'referential_integrity' || ruleType === 'custom_sql';
// ==================== 方法 ====================
async function load() {
    loading.value = true;
    try {
        const res = await listQualityRules({
            asset_type: filterAssetType.value || undefined,
            rule_type: filterRuleType.value || undefined,
            enabled: filterEnabled.value !== undefined ? filterEnabled.value === 'true' : undefined,
            page: page.value,
            page_size: pageSize.value,
        });
        rules.value = res.items;
        total.value = res.total;
    }
    catch {
        ElMessage.error('加载质量规则失败');
    }
    finally {
        loading.value = false;
    }
}
async function loadAlerts() {
    try {
        alerts.value = await getQualityAlerts();
    }
    catch { /* 告警摘要加载失败不影响主列表 */ }
}
function openCreate() {
    editingId.value = null;
    dialogTitle.value = '新建质量规则';
    form.asset_type = 'table';
    form.asset_code = '';
    form.rule_type = 'not_null';
    form.rule_config = { column: '' };
    form.enabled = true;
    form.severity = 'warn';
    dialogVisible.value = true;
}
function openEdit(rule) {
    editingId.value = rule.id;
    dialogTitle.value = '编辑质量规则';
    form.asset_type = rule.asset_type;
    form.asset_code = rule.asset_code;
    form.rule_type = rule.rule_type;
    form.rule_config = { ...rule.rule_config };
    form.enabled = rule.enabled;
    form.severity = rule.severity;
    dialogVisible.value = true;
}
function onRuleTypeChange() {
    if (form.rule_type === 'relation_cardinality')
        form.asset_type = 'relation';
    // 根据 rule_type 重置 rule_config 默认值
    if (editingId.value)
        return; // 编辑时不重置
    const defaults = {
        not_null: { column: '' },
        unique: { column: '' },
        enum: { column: '', values: [] },
        date_format: { column: '', format: '%Y-%m-%d' },
        referential_integrity: { column: '', ref_table: '', ref_column: '' },
        custom_sql: { sql: '' },
        relation_cardinality: { dataset_id: null, relation_id: null, expected_cardinality: 'N:1', period_column: '', left_period_column: '', right_period_column: '', missing_key_severity: 'warn' },
    };
    form.rule_config = defaults[form.rule_type] || {};
}
async function handleSave() {
    try {
        if (editingId.value) {
            await updateQualityRule(editingId.value, {
                rule_config: form.rule_config,
                enabled: form.enabled,
                severity: form.severity,
            });
            ElMessage.success('规则已更新');
        }
        else {
            await createQualityRule({ ...form });
            ElMessage.success('规则已创建');
        }
        dialogVisible.value = false;
        await load();
        await loadAlerts();
    }
    catch (e) {
        const msg = e?.response?.data?.detail || e?.message || '保存失败';
        ElMessage.error(msg);
    }
}
async function handleToggle(rule) {
    try {
        if (rule.enabled) {
            await disableQualityRule(rule.id);
            ElMessage.success('已禁用');
        }
        else {
            await enableQualityRule(rule.id);
            ElMessage.success('已启用');
        }
        await load();
    }
    catch {
        ElMessage.error('操作失败');
    }
}
async function handleDelete(rule) {
    try {
        await ElMessageBox.confirm(`确定删除规则「${rule.asset_code}」吗？历史运行记录将保留。`, '删除确认', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
        await deleteQualityRule(rule.id);
        ElMessage.success('已删除');
        await load();
        await loadAlerts();
    }
    catch {
        // 用户取消
    }
}
async function handleRun(rule) {
    let period;
    if (rule.rule_type === 'relation_cardinality') {
        try {
            const result = await ElMessageBox.prompt('关系基数检查必须指定期间（YYYYMM）', '选择检查期间', {
                inputValue: String(rule.rule_config?.period || ''),
                inputPattern: /^\d{6}$/,
                inputErrorMessage: '请输入 6 位期间，例如 202607',
                confirmButtonText: '执行检查',
                cancelButtonText: '取消',
            });
            period = result.value.trim();
        }
        catch {
            return;
        }
    }
    runLoading.value = true;
    runResult.value = null;
    runDialogVisible.value = true;
    try {
        runResult.value = await runQualityRule(rule.id, period ? { period } : {});
        await load();
        await loadAlerts();
    }
    catch (e) {
        const msg = e?.response?.data?.detail || e?.message || '执行失败';
        ElMessage.error(msg);
        runDialogVisible.value = false;
    }
    finally {
        runLoading.value = false;
    }
}
function ruleTypeLabel(type) {
    return QUALITY_RULE_TYPE_LABELS[type] || type;
}
function severityTagType(sev) {
    if (sev === 'error')
        return 'danger';
    if (sev === 'warn')
        return 'warning';
    return 'info';
}
function runStatusTagType(status) {
    if (status === 'pass')
        return 'success';
    if (status === 'fail' || status === 'error')
        return 'danger';
    if (status === 'warn')
        return 'warning';
    return 'info';
}
function runStatusLabel(status) {
    if (!status)
        return '未运行';
    const map = { pass: '通过', warn: '警告', fail: '失败', error: '异常' };
    return map[status] || status;
}
// ==================== 生命周期 ====================
onMounted(() => {
    load();
    loadAlerts();
    loadQualityMetadata();
    loadQualityStatuses();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['status-summary-item']} */ ;
/** @type {__VLS_StyleScopedClasses['status-summary-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "quality-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
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
if (__VLS_ctx.alerts) {
    const __VLS_8 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        gutter: (16),
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        gutter: (16),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        sm: (8),
    }));
    const __VLS_14 = __VLS_13({
        sm: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        shadow: "hover",
        ...{ class: "alert-card" },
    }));
    const __VLS_18 = __VLS_17({
        shadow: "hover",
        ...{ class: "alert-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert-num" },
    });
    (__VLS_ctx.alerts.total_rules);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert-label" },
    });
    var __VLS_19;
    var __VLS_15;
    const __VLS_20 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        sm: (8),
    }));
    const __VLS_22 = __VLS_21({
        sm: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        shadow: "hover",
        ...{ class: "alert-card" },
        ...{ style: ({ borderLeft: __VLS_ctx.alerts.failed_rules ? '3px solid #F56C6C' : '' }) },
    }));
    const __VLS_26 = __VLS_25({
        shadow: "hover",
        ...{ class: "alert-card" },
        ...{ style: ({ borderLeft: __VLS_ctx.alerts.failed_rules ? '3px solid #F56C6C' : '' }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert-num" },
        ...{ class: ({ 'text-danger': __VLS_ctx.alerts.failed_rules }) },
    });
    (__VLS_ctx.alerts.failed_rules);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert-label" },
    });
    var __VLS_27;
    var __VLS_23;
    const __VLS_28 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        sm: (8),
    }));
    const __VLS_30 = __VLS_29({
        sm: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        shadow: "hover",
        ...{ class: "alert-card" },
        ...{ style: ({ borderLeft: __VLS_ctx.alerts.warning_rules ? '3px solid #E6A23C' : '' }) },
    }));
    const __VLS_34 = __VLS_33({
        shadow: "hover",
        ...{ class: "alert-card" },
        ...{ style: ({ borderLeft: __VLS_ctx.alerts.warning_rules ? '3px solid #E6A23C' : '' }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert-num" },
        ...{ class: ({ 'text-warning': __VLS_ctx.alerts.warning_rules }) },
    });
    (__VLS_ctx.alerts.warning_rules);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "alert-label" },
    });
    var __VLS_35;
    var __VLS_31;
    var __VLS_11;
}
const __VLS_36 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    shadow: "never",
    ...{ class: "filter-card" },
}));
const __VLS_38 = __VLS_37({
    shadow: "never",
    ...{ class: "filter-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    inline: (true),
    size: "default",
}));
const __VLS_42 = __VLS_41({
    inline: (true),
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "资产类型",
}));
const __VLS_46 = __VLS_45({
    label: "资产类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterAssetType),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_50 = __VLS_49({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterAssetType),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onChange: (__VLS_ctx.load)
};
__VLS_51.slots.default;
const __VLS_56 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "数据表",
    value: "table",
}));
const __VLS_58 = __VLS_57({
    label: "数据表",
    value: "table",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "数据集",
    value: "dataset",
}));
const __VLS_62 = __VLS_61({
    label: "数据集",
    value: "dataset",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
const __VLS_64 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "字段",
    value: "field",
}));
const __VLS_66 = __VLS_65({
    label: "字段",
    value: "field",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_51;
var __VLS_47;
const __VLS_68 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "规则类型",
}));
const __VLS_70 = __VLS_69({
    label: "规则类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterRuleType),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_74 = __VLS_73({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterRuleType),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onChange: (__VLS_ctx.load)
};
__VLS_75.slots.default;
for (const [o] of __VLS_getVForSourceType((__VLS_ctx.ruleTypeOptions))) {
    const __VLS_80 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }));
    const __VLS_82 = __VLS_81({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
}
var __VLS_75;
var __VLS_71;
const __VLS_84 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "启用",
}));
const __VLS_86 = __VLS_85({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterEnabled),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_90 = __VLS_89({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterEnabled),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onChange: (__VLS_ctx.load)
};
__VLS_91.slots.default;
const __VLS_96 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "启用",
    value: "true",
}));
const __VLS_98 = __VLS_97({
    label: "启用",
    value: "true",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    label: "禁用",
    value: "false",
}));
const __VLS_102 = __VLS_101({
    label: "禁用",
    value: "false",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
var __VLS_91;
var __VLS_87;
const __VLS_104 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_110 = __VLS_109({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
let __VLS_112;
let __VLS_113;
let __VLS_114;
const __VLS_115 = {
    onClick: (__VLS_ctx.load)
};
__VLS_111.slots.default;
var __VLS_111;
var __VLS_107;
var __VLS_43;
var __VLS_39;
const __VLS_116 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    shadow: "never",
}));
const __VLS_118 = __VLS_117({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_119.slots.default;
const __VLS_120 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    data: (__VLS_ctx.rules),
    size: "small",
    stripe: true,
    rowKey: "id",
}));
const __VLS_122 = __VLS_121({
    data: (__VLS_ctx.rules),
    size: "small",
    stripe: true,
    rowKey: "id",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "资产",
    minWidth: "160",
}));
const __VLS_126 = __VLS_125({
    label: "资产",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_127.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_128 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        size: "small",
        type: "info",
        ...{ style: {} },
    }));
    const __VLS_130 = __VLS_129({
        size: "small",
        type: "info",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_131.slots.default;
    (row.asset_type);
    var __VLS_131;
    (row.asset_code);
}
var __VLS_127;
const __VLS_132 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    label: "规则类型",
    width: "120",
}));
const __VLS_134 = __VLS_133({
    label: "规则类型",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_135.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.ruleTypeLabel(row.rule_type));
    if (__VLS_ctx.isUnexecutable(row.rule_type)) {
        const __VLS_136 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            content: "执行暂不支持，仅可保存配置",
            placement: "top",
        }));
        const __VLS_138 = __VLS_137({
            content: "执行暂不支持，仅可保存配置",
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        const __VLS_140 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            ...{ style: {} },
        }));
        const __VLS_142 = __VLS_141({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        const __VLS_144 = {}.InfoFilled;
        /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
        const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
        var __VLS_143;
        var __VLS_139;
    }
}
var __VLS_135;
const __VLS_148 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "参数",
    minWidth: "140",
}));
const __VLS_150 = __VLS_149({
    label: "参数",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_151.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    if (row.rule_config.column) {
        (row.rule_config.column);
    }
    if (row.rule_config.values) {
        (row.rule_config.values?.join(', '));
    }
    if (row.rule_config.format) {
        (row.rule_config.format);
    }
}
var __VLS_151;
const __VLS_152 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    label: "严重级",
    width: "80",
}));
const __VLS_154 = __VLS_153({
    label: "严重级",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_155.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_155.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_156 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        type: (__VLS_ctx.severityTagType(row.severity)),
        size: "small",
        effect: "dark",
    }));
    const __VLS_158 = __VLS_157({
        type: (__VLS_ctx.severityTagType(row.severity)),
        size: "small",
        effect: "dark",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    (__VLS_ctx.QUALITY_SEVERITY_LABELS[row.severity] || row.severity);
    var __VLS_159;
}
var __VLS_155;
const __VLS_160 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    label: "最近运行",
    width: "100",
}));
const __VLS_162 = __VLS_161({
    label: "最近运行",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_163.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_164 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        type: (__VLS_ctx.runStatusTagType(row.last_run_status)),
        size: "small",
        effect: "plain",
    }));
    const __VLS_166 = __VLS_165({
        type: (__VLS_ctx.runStatusTagType(row.last_run_status)),
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    (__VLS_ctx.runStatusLabel(row.last_run_status));
    var __VLS_167;
}
var __VLS_163;
const __VLS_168 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    label: "操作",
    width: "300",
    fixed: "right",
}));
const __VLS_170 = __VLS_169({
    label: "操作",
    width: "300",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
__VLS_171.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_171.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_172 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        type: "primary",
        icon: (__VLS_ctx.VideoPlay),
        loading: (__VLS_ctx.runLoading),
        disabled: (__VLS_ctx.isUnexecutable(row.rule_type)),
    }));
    const __VLS_174 = __VLS_173({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        type: "primary",
        icon: (__VLS_ctx.VideoPlay),
        loading: (__VLS_ctx.runLoading),
        disabled: (__VLS_ctx.isUnexecutable(row.rule_type)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    let __VLS_176;
    let __VLS_177;
    let __VLS_178;
    const __VLS_179 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleRun(row);
        }
    };
    __VLS_175.slots.default;
    var __VLS_175;
    const __VLS_180 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        icon: (__VLS_ctx.Switch),
    }));
    const __VLS_182 = __VLS_181({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        icon: (__VLS_ctx.Switch),
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
    let __VLS_184;
    let __VLS_185;
    let __VLS_186;
    const __VLS_187 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleToggle(row);
        }
    };
    __VLS_183.slots.default;
    (row.enabled ? '禁用' : '启用');
    var __VLS_183;
    const __VLS_188 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }));
    const __VLS_190 = __VLS_189({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    let __VLS_192;
    let __VLS_193;
    let __VLS_194;
    const __VLS_195 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_191.slots.default;
    var __VLS_191;
    const __VLS_196 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        icon: (__VLS_ctx.Clock),
    }));
    const __VLS_198 = __VLS_197({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        icon: (__VLS_ctx.Clock),
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    let __VLS_200;
    let __VLS_201;
    let __VLS_202;
    const __VLS_203 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openSchedule(row);
        }
    };
    __VLS_199.slots.default;
    var __VLS_199;
    const __VLS_204 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
    }));
    const __VLS_206 = __VLS_205({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    let __VLS_208;
    let __VLS_209;
    let __VLS_210;
    const __VLS_211 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showRuns(row.id);
        }
    };
    __VLS_207.slots.default;
    var __VLS_207;
    const __VLS_212 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_214 = __VLS_213({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    let __VLS_216;
    let __VLS_217;
    let __VLS_218;
    const __VLS_219 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleDelete(row);
        }
    };
    __VLS_215.slots.default;
    var __VLS_215;
}
var __VLS_171;
var __VLS_123;
if (__VLS_ctx.total > __VLS_ctx.pageSize) {
    const __VLS_220 = {}.ElPagination;
    /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        ...{ 'onChange': {} },
        currentPage: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        total: (__VLS_ctx.total),
        pageSizes: ([10, 20, 50]),
        layout: "total, prev, pager, next, sizes",
        ...{ style: {} },
    }));
    const __VLS_222 = __VLS_221({
        ...{ 'onChange': {} },
        currentPage: (__VLS_ctx.page),
        pageSize: (__VLS_ctx.pageSize),
        total: (__VLS_ctx.total),
        pageSizes: ([10, 20, 50]),
        layout: "total, prev, pager, next, sizes",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    let __VLS_224;
    let __VLS_225;
    let __VLS_226;
    const __VLS_227 = {
        onChange: (__VLS_ctx.load)
    };
    var __VLS_223;
}
var __VLS_119;
const __VLS_228 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
    shadow: "never",
    ...{ class: "status-card" },
}));
const __VLS_230 = __VLS_229({
    shadow: "never",
    ...{ class: "status-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_229));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.statusLoading) }, null, null);
__VLS_231.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-title" },
});
const __VLS_232 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.qualityPeriod),
    placeholder: "YYYYMM",
    maxlength: "6",
    ...{ style: {} },
}));
const __VLS_234 = __VLS_233({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.qualityPeriod),
    placeholder: "YYYYMM",
    maxlength: "6",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
let __VLS_236;
let __VLS_237;
let __VLS_238;
const __VLS_239 = {
    onKeyup: (__VLS_ctx.loadQualityStatuses)
};
var __VLS_235;
const __VLS_240 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_242 = __VLS_241({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
let __VLS_244;
let __VLS_245;
let __VLS_246;
const __VLS_247 = {
    onClick: (__VLS_ctx.loadQualityStatuses)
};
__VLS_243.slots.default;
var __VLS_243;
const __VLS_248 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.rebuildingIndex),
}));
const __VLS_250 = __VLS_249({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.rebuildingIndex),
}, ...__VLS_functionalComponentArgsRest(__VLS_249));
let __VLS_252;
let __VLS_253;
let __VLS_254;
const __VLS_255 = {
    onClick: (__VLS_ctx.handleRebuildIndex)
};
__VLS_251.slots.default;
var __VLS_251;
if (__VLS_ctx.statusStale) {
    const __VLS_256 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
        type: "warning",
    }));
    const __VLS_258 = __VLS_257({
        type: "warning",
    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
    __VLS_259.slots.default;
    var __VLS_259;
}
if (__VLS_ctx.statusError === 'forbidden') {
    const __VLS_260 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        title: "无权限查看质量状态",
        type: "warning",
        showIcon: true,
        closable: (false),
    }));
    const __VLS_262 = __VLS_261({
        title: "无权限查看质量状态",
        type: "warning",
        showIcon: true,
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
}
else if (__VLS_ctx.statusError) {
    const __VLS_264 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
        title: (__VLS_ctx.statusError),
        type: "error",
        showIcon: true,
        closable: (false),
    }));
    const __VLS_266 = __VLS_265({
        title: (__VLS_ctx.statusError),
        type: "error",
        showIcon: true,
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_265));
}
else if (!__VLS_ctx.statusLoading && !__VLS_ctx.qualityStatuses.length) {
    const __VLS_268 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
        description: "当前期间暂无质量状态",
    }));
    const __VLS_270 = __VLS_269({
        description: "当前期间暂无质量状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
}
else {
    const __VLS_272 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
        gutter: (12),
        ...{ class: "status-summary" },
    }));
    const __VLS_274 = __VLS_273({
        gutter: (12),
        ...{ class: "status-summary" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_273));
    __VLS_275.slots.default;
    for (const [key] of __VLS_getVForSourceType((['pending', 'passed', 'warning', 'failed']))) {
        const __VLS_276 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
            key: (key),
            span: (6),
        }));
        const __VLS_278 = __VLS_277({
            key: (key),
            span: (6),
        }, ...__VLS_functionalComponentArgsRest(__VLS_277));
        __VLS_279.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "status-summary-item" },
            ...{ class: (`status-summary-item status-${key}`) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.statusSummary[key] || 0);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.qualityStatusLabel(key));
        var __VLS_279;
    }
    var __VLS_275;
    const __VLS_280 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        data: (__VLS_ctx.qualityStatuses),
        size: "small",
        stripe: true,
        maxHeight: "330",
    }));
    const __VLS_282 = __VLS_281({
        data: (__VLS_ctx.qualityStatuses),
        size: "small",
        stripe: true,
        maxHeight: "330",
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    __VLS_283.slots.default;
    const __VLS_284 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
        label: "资产",
        minWidth: "180",
    }));
    const __VLS_286 = __VLS_285({
        label: "资产",
        minWidth: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    __VLS_287.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_287.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_288 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
            size: "small",
            type: "info",
        }));
        const __VLS_290 = __VLS_289({
            size: "small",
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_289));
        __VLS_291.slots.default;
        (row.asset_type);
        var __VLS_291;
        (row.asset_code || ('#' + row.asset_id));
    }
    var __VLS_287;
    const __VLS_292 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
        prop: "period",
        label: "期间",
        width: "90",
    }));
    const __VLS_294 = __VLS_293({
        prop: "period",
        label: "期间",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_293));
    const __VLS_296 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
        label: "状态",
        width: "100",
    }));
    const __VLS_298 = __VLS_297({
        label: "状态",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
    __VLS_299.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_299.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_300 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
            type: (__VLS_ctx.qualityStatusTagType(row.status)),
        }));
        const __VLS_302 = __VLS_301({
            type: (__VLS_ctx.qualityStatusTagType(row.status)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_301));
        __VLS_303.slots.default;
        (__VLS_ctx.qualityStatusLabel(row.status));
        var __VLS_303;
    }
    var __VLS_299;
    const __VLS_304 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
        prop: "severity",
        label: "严重级别",
        width: "90",
    }));
    const __VLS_306 = __VLS_305({
        prop: "severity",
        label: "严重级别",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_305));
    const __VLS_308 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        prop: "duplicate_key_count",
        label: "重复键",
        width: "80",
    }));
    const __VLS_310 = __VLS_309({
        prop: "duplicate_key_count",
        label: "重复键",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    const __VLS_312 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
        prop: "missing_key_count",
        label: "缺失键",
        width: "80",
    }));
    const __VLS_314 = __VLS_313({
        prop: "missing_key_count",
        label: "缺失键",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_313));
    const __VLS_316 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
        label: "操作",
        width: "100",
        fixed: "right",
    }));
    const __VLS_318 = __VLS_317({
        label: "操作",
        width: "100",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_317));
    __VLS_319.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_319.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_320 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_322 = __VLS_321({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_321));
        let __VLS_324;
        let __VLS_325;
        let __VLS_326;
        const __VLS_327 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.statusError === 'forbidden'))
                    return;
                if (!!(__VLS_ctx.statusError))
                    return;
                if (!!(!__VLS_ctx.statusLoading && !__VLS_ctx.qualityStatuses.length))
                    return;
                __VLS_ctx.showQualityImpact(row);
            }
        };
        __VLS_323.slots.default;
        var __VLS_323;
    }
    var __VLS_319;
    var __VLS_283;
}
var __VLS_231;
const __VLS_328 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "560px",
    destroyOnClose: true,
}));
const __VLS_330 = __VLS_329({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "560px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_329));
__VLS_331.slots.default;
const __VLS_332 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
    model: (__VLS_ctx.form),
    labelWidth: "80px",
    size: "default",
    ref: "formRef",
}));
const __VLS_334 = __VLS_333({
    model: (__VLS_ctx.form),
    labelWidth: "80px",
    size: "default",
    ref: "formRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_333));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_336 = {};
__VLS_335.slots.default;
const __VLS_338 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
    label: "资产类型",
    required: true,
}));
const __VLS_340 = __VLS_339({
    label: "资产类型",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_339));
__VLS_341.slots.default;
const __VLS_342 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
    modelValue: (__VLS_ctx.form.asset_type),
    ...{ style: {} },
}));
const __VLS_344 = __VLS_343({
    modelValue: (__VLS_ctx.form.asset_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_343));
__VLS_345.slots.default;
const __VLS_346 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
    label: "数据表 (table)",
    value: "table",
}));
const __VLS_348 = __VLS_347({
    label: "数据表 (table)",
    value: "table",
}, ...__VLS_functionalComponentArgsRest(__VLS_347));
const __VLS_350 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
    label: "数据集 (dataset)",
    value: "dataset",
}));
const __VLS_352 = __VLS_351({
    label: "数据集 (dataset)",
    value: "dataset",
}, ...__VLS_functionalComponentArgsRest(__VLS_351));
const __VLS_354 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
    label: "字段 (field)",
    value: "field",
}));
const __VLS_356 = __VLS_355({
    label: "字段 (field)",
    value: "field",
}, ...__VLS_functionalComponentArgsRest(__VLS_355));
const __VLS_358 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_359 = __VLS_asFunctionalComponent(__VLS_358, new __VLS_358({
    label: "关联关系 (relation)",
    value: "relation",
}));
const __VLS_360 = __VLS_359({
    label: "关联关系 (relation)",
    value: "relation",
}, ...__VLS_functionalComponentArgsRest(__VLS_359));
var __VLS_345;
var __VLS_341;
const __VLS_362 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
    label: "资产编码",
    required: true,
}));
const __VLS_364 = __VLS_363({
    label: "资产编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_363));
__VLS_365.slots.default;
const __VLS_366 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_367 = __VLS_asFunctionalComponent(__VLS_366, new __VLS_366({
    modelValue: (__VLS_ctx.form.asset_code),
    placeholder: "table_name 或 dataset_id 或 table.column",
}));
const __VLS_368 = __VLS_367({
    modelValue: (__VLS_ctx.form.asset_code),
    placeholder: "table_name 或 dataset_id 或 table.column",
}, ...__VLS_functionalComponentArgsRest(__VLS_367));
var __VLS_365;
const __VLS_370 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_371 = __VLS_asFunctionalComponent(__VLS_370, new __VLS_370({
    label: "规则类型",
    required: true,
}));
const __VLS_372 = __VLS_371({
    label: "规则类型",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_371));
__VLS_373.slots.default;
const __VLS_374 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_375 = __VLS_asFunctionalComponent(__VLS_374, new __VLS_374({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.rule_type),
    ...{ style: {} },
}));
const __VLS_376 = __VLS_375({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.rule_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_375));
let __VLS_378;
let __VLS_379;
let __VLS_380;
const __VLS_381 = {
    onChange: (__VLS_ctx.onRuleTypeChange)
};
__VLS_377.slots.default;
for (const [o] of __VLS_getVForSourceType((__VLS_ctx.ruleTypeOptions))) {
    const __VLS_382 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_383 = __VLS_asFunctionalComponent(__VLS_382, new __VLS_382({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }));
    const __VLS_384 = __VLS_383({
        key: (o.value),
        label: (o.label),
        value: (o.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_383));
}
var __VLS_377;
var __VLS_373;
if (__VLS_ctx.form.rule_type === 'not_null' || __VLS_ctx.form.rule_type === 'unique') {
    const __VLS_386 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_387 = __VLS_asFunctionalComponent(__VLS_386, new __VLS_386({
        label: "检查字段",
        required: true,
    }));
    const __VLS_388 = __VLS_387({
        label: "检查字段",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_387));
    __VLS_389.slots.default;
    const __VLS_390 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_391 = __VLS_asFunctionalComponent(__VLS_390, new __VLS_390({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }));
    const __VLS_392 = __VLS_391({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }, ...__VLS_functionalComponentArgsRest(__VLS_391));
    var __VLS_389;
}
else if (__VLS_ctx.form.rule_type === 'enum') {
    const __VLS_394 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_395 = __VLS_asFunctionalComponent(__VLS_394, new __VLS_394({
        label: "检查字段",
        required: true,
    }));
    const __VLS_396 = __VLS_395({
        label: "检查字段",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_395));
    __VLS_397.slots.default;
    const __VLS_398 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_399 = __VLS_asFunctionalComponent(__VLS_398, new __VLS_398({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }));
    const __VLS_400 = __VLS_399({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }, ...__VLS_functionalComponentArgsRest(__VLS_399));
    var __VLS_397;
    const __VLS_402 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_403 = __VLS_asFunctionalComponent(__VLS_402, new __VLS_402({
        label: "合法枚举值",
        required: true,
    }));
    const __VLS_404 = __VLS_403({
        label: "合法枚举值",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_403));
    __VLS_405.slots.default;
    const __VLS_406 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_407 = __VLS_asFunctionalComponent(__VLS_406, new __VLS_406({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.rule_config.valuesStr),
        placeholder: "用逗号分隔，如: A,B,C",
    }));
    const __VLS_408 = __VLS_407({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.rule_config.valuesStr),
        placeholder: "用逗号分隔，如: A,B,C",
    }, ...__VLS_functionalComponentArgsRest(__VLS_407));
    let __VLS_410;
    let __VLS_411;
    let __VLS_412;
    const __VLS_413 = {
        onChange: (...[$event]) => {
            if (!!(__VLS_ctx.form.rule_type === 'not_null' || __VLS_ctx.form.rule_type === 'unique'))
                return;
            if (!(__VLS_ctx.form.rule_type === 'enum'))
                return;
            __VLS_ctx.form.rule_config.values = (__VLS_ctx.form.rule_config.valuesStr || '').split(',').map((s) => s.trim()).filter(Boolean);
        }
    };
    var __VLS_409;
    var __VLS_405;
}
else if (__VLS_ctx.form.rule_type === 'date_format') {
    const __VLS_414 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_415 = __VLS_asFunctionalComponent(__VLS_414, new __VLS_414({
        label: "检查字段",
        required: true,
    }));
    const __VLS_416 = __VLS_415({
        label: "检查字段",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_415));
    __VLS_417.slots.default;
    const __VLS_418 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_419 = __VLS_asFunctionalComponent(__VLS_418, new __VLS_418({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }));
    const __VLS_420 = __VLS_419({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }, ...__VLS_functionalComponentArgsRest(__VLS_419));
    var __VLS_417;
    const __VLS_422 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_423 = __VLS_asFunctionalComponent(__VLS_422, new __VLS_422({
        label: "日期格式",
        required: true,
    }));
    const __VLS_424 = __VLS_423({
        label: "日期格式",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_423));
    __VLS_425.slots.default;
    const __VLS_426 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_427 = __VLS_asFunctionalComponent(__VLS_426, new __VLS_426({
        modelValue: (__VLS_ctx.form.rule_config.format),
        ...{ style: {} },
    }));
    const __VLS_428 = __VLS_427({
        modelValue: (__VLS_ctx.form.rule_config.format),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_427));
    __VLS_429.slots.default;
    const __VLS_430 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_431 = __VLS_asFunctionalComponent(__VLS_430, new __VLS_430({
        label: "%Y-%m-%d (2024-01-01)",
        value: "%Y-%m-%d",
    }));
    const __VLS_432 = __VLS_431({
        label: "%Y-%m-%d (2024-01-01)",
        value: "%Y-%m-%d",
    }, ...__VLS_functionalComponentArgsRest(__VLS_431));
    const __VLS_434 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_435 = __VLS_asFunctionalComponent(__VLS_434, new __VLS_434({
        label: "%Y/%m/%d (2024/01/01)",
        value: "%Y/%m/%d",
    }));
    const __VLS_436 = __VLS_435({
        label: "%Y/%m/%d (2024/01/01)",
        value: "%Y/%m/%d",
    }, ...__VLS_functionalComponentArgsRest(__VLS_435));
    const __VLS_438 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_439 = __VLS_asFunctionalComponent(__VLS_438, new __VLS_438({
        label: "%Y%m%d (20240101)",
        value: "%Y%m%d",
    }));
    const __VLS_440 = __VLS_439({
        label: "%Y%m%d (20240101)",
        value: "%Y%m%d",
    }, ...__VLS_functionalComponentArgsRest(__VLS_439));
    const __VLS_442 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_443 = __VLS_asFunctionalComponent(__VLS_442, new __VLS_442({
        label: "%d/%m/%Y (01/01/2024)",
        value: "%d/%m/%Y",
    }));
    const __VLS_444 = __VLS_443({
        label: "%d/%m/%Y (01/01/2024)",
        value: "%d/%m/%Y",
    }, ...__VLS_functionalComponentArgsRest(__VLS_443));
    const __VLS_446 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_447 = __VLS_asFunctionalComponent(__VLS_446, new __VLS_446({
        label: "%Y-%m-%d %H:%i:%s (日期时间)",
        value: "%Y-%m-%d %H:%i:%s",
    }));
    const __VLS_448 = __VLS_447({
        label: "%Y-%m-%d %H:%i:%s (日期时间)",
        value: "%Y-%m-%d %H:%i:%s",
    }, ...__VLS_functionalComponentArgsRest(__VLS_447));
    var __VLS_429;
    var __VLS_425;
}
else if (__VLS_ctx.form.rule_type === 'relation_cardinality') {
    const __VLS_450 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_451 = __VLS_asFunctionalComponent(__VLS_450, new __VLS_450({
        title: "关系元数据由数据集配置提供，期间字段和关联键不可手工输入。",
        type: "info",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_452 = __VLS_451({
        title: "关系元数据由数据集配置提供，期间字段和关联键不可手工输入。",
        type: "info",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_451));
    const __VLS_454 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_455 = __VLS_asFunctionalComponent(__VLS_454, new __VLS_454({
        label: "数据集",
        required: true,
    }));
    const __VLS_456 = __VLS_455({
        label: "数据集",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_455));
    __VLS_457.slots.default;
    const __VLS_458 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_459 = __VLS_asFunctionalComponent(__VLS_458, new __VLS_458({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.rule_config.dataset_id),
        filterable: true,
        loading: (__VLS_ctx.qualityMetadataLoading),
        ...{ style: {} },
    }));
    const __VLS_460 = __VLS_459({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.rule_config.dataset_id),
        filterable: true,
        loading: (__VLS_ctx.qualityMetadataLoading),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_459));
    let __VLS_462;
    let __VLS_463;
    let __VLS_464;
    const __VLS_465 = {
        onChange: (__VLS_ctx.onQualityDatasetChange)
    };
    __VLS_461.slots.default;
    for (const [dataset] of __VLS_getVForSourceType((__VLS_ctx.relationDatasets))) {
        const __VLS_466 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_467 = __VLS_asFunctionalComponent(__VLS_466, new __VLS_466({
            key: (dataset.id),
            label: (dataset.label || dataset.name),
            value: (dataset.id),
        }));
        const __VLS_468 = __VLS_467({
            key: (dataset.id),
            label: (dataset.label || dataset.name),
            value: (dataset.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_467));
    }
    var __VLS_461;
    var __VLS_457;
    const __VLS_470 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_471 = __VLS_asFunctionalComponent(__VLS_470, new __VLS_470({
        label: "关系",
        required: true,
    }));
    const __VLS_472 = __VLS_471({
        label: "关系",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_471));
    __VLS_473.slots.default;
    const __VLS_474 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_475 = __VLS_asFunctionalComponent(__VLS_474, new __VLS_474({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.rule_config.relation_id),
        filterable: true,
        disabled: (!__VLS_ctx.form.rule_config.dataset_id),
        ...{ style: {} },
    }));
    const __VLS_476 = __VLS_475({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.rule_config.relation_id),
        filterable: true,
        disabled: (!__VLS_ctx.form.rule_config.dataset_id),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_475));
    let __VLS_478;
    let __VLS_479;
    let __VLS_480;
    const __VLS_481 = {
        onChange: (__VLS_ctx.onQualityRelationChange)
    };
    __VLS_477.slots.default;
    for (const [relation] of __VLS_getVForSourceType((__VLS_ctx.relationOptions))) {
        const __VLS_482 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_483 = __VLS_asFunctionalComponent(__VLS_482, new __VLS_482({
            key: (relation.id),
            label: ('#' + relation.id + ' ' + relation.left_alias + ' → ' + relation.right_alias + ' (' + relation.cardinality + ')'),
            value: (relation.id),
        }));
        const __VLS_484 = __VLS_483({
            key: (relation.id),
            label: ('#' + relation.id + ' ' + relation.left_alias + ' → ' + relation.right_alias + ' (' + relation.cardinality + ')'),
            value: (relation.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_483));
    }
    var __VLS_477;
    var __VLS_473;
    const __VLS_486 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_487 = __VLS_asFunctionalComponent(__VLS_486, new __VLS_486({
        label: "声明基数",
        required: true,
    }));
    const __VLS_488 = __VLS_487({
        label: "声明基数",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_487));
    __VLS_489.slots.default;
    const __VLS_490 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_491 = __VLS_asFunctionalComponent(__VLS_490, new __VLS_490({
        modelValue: (__VLS_ctx.selectedQualityRelation?.cardinality || ''),
        disabled: true,
    }));
    const __VLS_492 = __VLS_491({
        modelValue: (__VLS_ctx.selectedQualityRelation?.cardinality || ''),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_491));
    var __VLS_489;
    const __VLS_494 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_495 = __VLS_asFunctionalComponent(__VLS_494, new __VLS_494({
        label: "左期间字段",
        required: true,
    }));
    const __VLS_496 = __VLS_495({
        label: "左期间字段",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_495));
    __VLS_497.slots.default;
    const __VLS_498 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_499 = __VLS_asFunctionalComponent(__VLS_498, new __VLS_498({
        modelValue: (__VLS_ctx.form.rule_config.left_period_column),
        ...{ style: {} },
        disabled: (!__VLS_ctx.selectedQualityRelation),
    }));
    const __VLS_500 = __VLS_499({
        modelValue: (__VLS_ctx.form.rule_config.left_period_column),
        ...{ style: {} },
        disabled: (!__VLS_ctx.selectedQualityRelation),
    }, ...__VLS_functionalComponentArgsRest(__VLS_499));
    __VLS_501.slots.default;
    if (__VLS_ctx.selectedQualityRelation?.left_period_column) {
        const __VLS_502 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_503 = __VLS_asFunctionalComponent(__VLS_502, new __VLS_502({
            label: (__VLS_ctx.selectedQualityRelation.left_period_column),
            value: (__VLS_ctx.selectedQualityRelation.left_period_column),
        }));
        const __VLS_504 = __VLS_503({
            label: (__VLS_ctx.selectedQualityRelation.left_period_column),
            value: (__VLS_ctx.selectedQualityRelation.left_period_column),
        }, ...__VLS_functionalComponentArgsRest(__VLS_503));
    }
    var __VLS_501;
    var __VLS_497;
    const __VLS_506 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_507 = __VLS_asFunctionalComponent(__VLS_506, new __VLS_506({
        label: "右期间字段",
        required: true,
    }));
    const __VLS_508 = __VLS_507({
        label: "右期间字段",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_507));
    __VLS_509.slots.default;
    const __VLS_510 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_511 = __VLS_asFunctionalComponent(__VLS_510, new __VLS_510({
        modelValue: (__VLS_ctx.form.rule_config.right_period_column),
        ...{ style: {} },
        disabled: (!__VLS_ctx.selectedQualityRelation),
    }));
    const __VLS_512 = __VLS_511({
        modelValue: (__VLS_ctx.form.rule_config.right_period_column),
        ...{ style: {} },
        disabled: (!__VLS_ctx.selectedQualityRelation),
    }, ...__VLS_functionalComponentArgsRest(__VLS_511));
    __VLS_513.slots.default;
    if (__VLS_ctx.selectedQualityRelation?.right_period_column) {
        const __VLS_514 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_515 = __VLS_asFunctionalComponent(__VLS_514, new __VLS_514({
            label: (__VLS_ctx.selectedQualityRelation.right_period_column),
            value: (__VLS_ctx.selectedQualityRelation.right_period_column),
        }));
        const __VLS_516 = __VLS_515({
            label: (__VLS_ctx.selectedQualityRelation.right_period_column),
            value: (__VLS_ctx.selectedQualityRelation.right_period_column),
        }, ...__VLS_functionalComponentArgsRest(__VLS_515));
    }
    var __VLS_513;
    var __VLS_509;
    const __VLS_518 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_519 = __VLS_asFunctionalComponent(__VLS_518, new __VLS_518({
        label: "缺失策略",
    }));
    const __VLS_520 = __VLS_519({
        label: "缺失策略",
    }, ...__VLS_functionalComponentArgsRest(__VLS_519));
    __VLS_521.slots.default;
    const __VLS_522 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_523 = __VLS_asFunctionalComponent(__VLS_522, new __VLS_522({
        modelValue: (__VLS_ctx.form.rule_config.missing_key_severity),
        ...{ style: {} },
    }));
    const __VLS_524 = __VLS_523({
        modelValue: (__VLS_ctx.form.rule_config.missing_key_severity),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_523));
    __VLS_525.slots.default;
    const __VLS_526 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_527 = __VLS_asFunctionalComponent(__VLS_526, new __VLS_526({
        label: "警告",
        value: "warn",
    }));
    const __VLS_528 = __VLS_527({
        label: "警告",
        value: "warn",
    }, ...__VLS_functionalComponentArgsRest(__VLS_527));
    const __VLS_530 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_531 = __VLS_asFunctionalComponent(__VLS_530, new __VLS_530({
        label: "阻断",
        value: "error",
    }));
    const __VLS_532 = __VLS_531({
        label: "阻断",
        value: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_531));
    var __VLS_525;
    var __VLS_521;
}
else if (__VLS_ctx.form.rule_type === 'referential_integrity') {
    const __VLS_534 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_535 = __VLS_asFunctionalComponent(__VLS_534, new __VLS_534({
        title: "引用完整性检查暂不支持执行，仅可保存配置。将在后续版本中支持。",
        type: "info",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_536 = __VLS_535({
        title: "引用完整性检查暂不支持执行，仅可保存配置。将在后续版本中支持。",
        type: "info",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_535));
    const __VLS_538 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_539 = __VLS_asFunctionalComponent(__VLS_538, new __VLS_538({
        label: "检查字段",
        required: true,
    }));
    const __VLS_540 = __VLS_539({
        label: "检查字段",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_539));
    __VLS_541.slots.default;
    const __VLS_542 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_543 = __VLS_asFunctionalComponent(__VLS_542, new __VLS_542({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }));
    const __VLS_544 = __VLS_543({
        modelValue: (__VLS_ctx.form.rule_config.column),
        placeholder: "column_code",
    }, ...__VLS_functionalComponentArgsRest(__VLS_543));
    var __VLS_541;
    const __VLS_546 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_547 = __VLS_asFunctionalComponent(__VLS_546, new __VLS_546({
        label: "引用表",
    }));
    const __VLS_548 = __VLS_547({
        label: "引用表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_547));
    __VLS_549.slots.default;
    const __VLS_550 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_551 = __VLS_asFunctionalComponent(__VLS_550, new __VLS_550({
        modelValue: (__VLS_ctx.form.rule_config.ref_table),
        placeholder: "引用的目标表",
    }));
    const __VLS_552 = __VLS_551({
        modelValue: (__VLS_ctx.form.rule_config.ref_table),
        placeholder: "引用的目标表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_551));
    var __VLS_549;
    const __VLS_554 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_555 = __VLS_asFunctionalComponent(__VLS_554, new __VLS_554({
        label: "引用字段",
    }));
    const __VLS_556 = __VLS_555({
        label: "引用字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_555));
    __VLS_557.slots.default;
    const __VLS_558 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_559 = __VLS_asFunctionalComponent(__VLS_558, new __VLS_558({
        modelValue: (__VLS_ctx.form.rule_config.ref_column),
        placeholder: "引用的目标字段",
    }));
    const __VLS_560 = __VLS_559({
        modelValue: (__VLS_ctx.form.rule_config.ref_column),
        placeholder: "引用的目标字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_559));
    var __VLS_557;
}
else if (__VLS_ctx.form.rule_type === 'custom_sql') {
    const __VLS_562 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_563 = __VLS_asFunctionalComponent(__VLS_562, new __VLS_562({
        title: "自定义 SQL 检查暂不支持执行，仅可保存配置。将在后续版本中支持。",
        type: "info",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_564 = __VLS_563({
        title: "自定义 SQL 检查暂不支持执行，仅可保存配置。将在后续版本中支持。",
        type: "info",
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_563));
    const __VLS_566 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_567 = __VLS_asFunctionalComponent(__VLS_566, new __VLS_566({
        label: "SQL 语句",
    }));
    const __VLS_568 = __VLS_567({
        label: "SQL 语句",
    }, ...__VLS_functionalComponentArgsRest(__VLS_567));
    __VLS_569.slots.default;
    const __VLS_570 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_571 = __VLS_asFunctionalComponent(__VLS_570, new __VLS_570({
        modelValue: (__VLS_ctx.form.rule_config.sql),
        type: "textarea",
        rows: (3),
        placeholder: "SELECT COUNT(*) FROM ...",
    }));
    const __VLS_572 = __VLS_571({
        modelValue: (__VLS_ctx.form.rule_config.sql),
        type: "textarea",
        rows: (3),
        placeholder: "SELECT COUNT(*) FROM ...",
    }, ...__VLS_functionalComponentArgsRest(__VLS_571));
    var __VLS_569;
}
const __VLS_574 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_575 = __VLS_asFunctionalComponent(__VLS_574, new __VLS_574({
    label: "严重级别",
}));
const __VLS_576 = __VLS_575({
    label: "严重级别",
}, ...__VLS_functionalComponentArgsRest(__VLS_575));
__VLS_577.slots.default;
const __VLS_578 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_579 = __VLS_asFunctionalComponent(__VLS_578, new __VLS_578({
    modelValue: (__VLS_ctx.form.severity),
}));
const __VLS_580 = __VLS_579({
    modelValue: (__VLS_ctx.form.severity),
}, ...__VLS_functionalComponentArgsRest(__VLS_579));
__VLS_581.slots.default;
for (const [o] of __VLS_getVForSourceType((__VLS_ctx.severityOptions))) {
    const __VLS_582 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_583 = __VLS_asFunctionalComponent(__VLS_582, new __VLS_582({
        key: (o.value),
        value: (o.value),
    }));
    const __VLS_584 = __VLS_583({
        key: (o.value),
        value: (o.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_583));
    __VLS_585.slots.default;
    (o.label);
    var __VLS_585;
}
var __VLS_581;
var __VLS_577;
const __VLS_586 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_587 = __VLS_asFunctionalComponent(__VLS_586, new __VLS_586({
    label: "启用",
}));
const __VLS_588 = __VLS_587({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_587));
__VLS_589.slots.default;
const __VLS_590 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_591 = __VLS_asFunctionalComponent(__VLS_590, new __VLS_590({
    modelValue: (__VLS_ctx.form.enabled),
}));
const __VLS_592 = __VLS_591({
    modelValue: (__VLS_ctx.form.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_591));
var __VLS_589;
const __VLS_594 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_595 = __VLS_asFunctionalComponent(__VLS_594, new __VLS_594({
    label: "定时执行",
}));
const __VLS_596 = __VLS_595({
    label: "定时执行",
}, ...__VLS_functionalComponentArgsRest(__VLS_595));
__VLS_597.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ style: {} },
});
var __VLS_597;
var __VLS_335;
{
    const { footer: __VLS_thisSlot } = __VLS_331.slots;
    const __VLS_598 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_599 = __VLS_asFunctionalComponent(__VLS_598, new __VLS_598({
        ...{ 'onClick': {} },
    }));
    const __VLS_600 = __VLS_599({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_599));
    let __VLS_602;
    let __VLS_603;
    let __VLS_604;
    const __VLS_605 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_601.slots.default;
    var __VLS_601;
    const __VLS_606 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_607 = __VLS_asFunctionalComponent(__VLS_606, new __VLS_606({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_608 = __VLS_607({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_607));
    let __VLS_610;
    let __VLS_611;
    let __VLS_612;
    const __VLS_613 = {
        onClick: (__VLS_ctx.handleSave)
    };
    __VLS_609.slots.default;
    var __VLS_609;
}
var __VLS_331;
const __VLS_614 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_615 = __VLS_asFunctionalComponent(__VLS_614, new __VLS_614({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.runsVisible),
    title: "质量运行历史",
    width: "780px",
}));
const __VLS_616 = __VLS_615({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.runsVisible),
    title: "质量运行历史",
    width: "780px",
}, ...__VLS_functionalComponentArgsRest(__VLS_615));
let __VLS_618;
let __VLS_619;
let __VLS_620;
const __VLS_621 = {
    onClose: (...[$event]) => {
        __VLS_ctx.runs = [];
    }
};
__VLS_617.slots.default;
const __VLS_622 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_623 = __VLS_asFunctionalComponent(__VLS_622, new __VLS_622({
    data: (__VLS_ctx.runs),
    size: "small",
    border: true,
    maxHeight: "400",
}));
const __VLS_624 = __VLS_623({
    data: (__VLS_ctx.runs),
    size: "small",
    border: true,
    maxHeight: "400",
}, ...__VLS_functionalComponentArgsRest(__VLS_623));
__VLS_625.slots.default;
const __VLS_626 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_627 = __VLS_asFunctionalComponent(__VLS_626, new __VLS_626({
    prop: "id",
    label: "运行ID",
    width: "80",
}));
const __VLS_628 = __VLS_627({
    prop: "id",
    label: "运行ID",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_627));
const __VLS_630 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_631 = __VLS_asFunctionalComponent(__VLS_630, new __VLS_630({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_632 = __VLS_631({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_631));
__VLS_633.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_633.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_634 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_635 = __VLS_asFunctionalComponent(__VLS_634, new __VLS_634({
        size: "small",
        type: (__VLS_ctx.runStatusTagType(row.status)),
    }));
    const __VLS_636 = __VLS_635({
        size: "small",
        type: (__VLS_ctx.runStatusTagType(row.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_635));
    __VLS_637.slots.default;
    (__VLS_ctx.runStatusLabel(row.status));
    var __VLS_637;
}
var __VLS_633;
const __VLS_638 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_639 = __VLS_asFunctionalComponent(__VLS_638, new __VLS_638({
    prop: "checked_count",
    label: "检查数",
    width: "80",
    align: "center",
}));
const __VLS_640 = __VLS_639({
    prop: "checked_count",
    label: "检查数",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_639));
const __VLS_642 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_643 = __VLS_asFunctionalComponent(__VLS_642, new __VLS_642({
    prop: "failed_count",
    label: "失败数",
    width: "80",
    align: "center",
}));
const __VLS_644 = __VLS_643({
    prop: "failed_count",
    label: "失败数",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_643));
const __VLS_646 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_647 = __VLS_asFunctionalComponent(__VLS_646, new __VLS_646({
    prop: "started_at",
    label: "开始时间",
    width: "150",
}));
const __VLS_648 = __VLS_647({
    prop: "started_at",
    label: "开始时间",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_647));
__VLS_649.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_649.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.started_at));
}
var __VLS_649;
const __VLS_650 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_651 = __VLS_asFunctionalComponent(__VLS_650, new __VLS_650({
    prop: "finished_at",
    label: "结束时间",
    width: "150",
}));
const __VLS_652 = __VLS_651({
    prop: "finished_at",
    label: "结束时间",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_651));
__VLS_653.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_653.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.finished_at));
}
var __VLS_653;
const __VLS_654 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_655 = __VLS_asFunctionalComponent(__VLS_654, new __VLS_654({
    prop: "message",
    label: "消息",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_656 = __VLS_655({
    prop: "message",
    label: "消息",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_655));
const __VLS_658 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_659 = __VLS_asFunctionalComponent(__VLS_658, new __VLS_658({
    label: "操作",
    width: "70",
    fixed: "right",
}));
const __VLS_660 = __VLS_659({
    label: "操作",
    width: "70",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_659));
__VLS_661.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_661.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.status === 'fail' || row.status === 'error') {
        const __VLS_662 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_663 = __VLS_asFunctionalComponent(__VLS_662, new __VLS_662({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.RefreshRight),
            loading: (__VLS_ctx.retrying.has(row.rule_id)),
        }));
        const __VLS_664 = __VLS_663({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.RefreshRight),
            loading: (__VLS_ctx.retrying.has(row.rule_id)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_663));
        let __VLS_666;
        let __VLS_667;
        let __VLS_668;
        const __VLS_669 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'fail' || row.status === 'error'))
                    return;
                __VLS_ctx.retryQualityRun(row.rule_id, row.period || undefined);
            }
        };
        __VLS_665.slots.default;
        var __VLS_665;
    }
}
var __VLS_661;
var __VLS_625;
var __VLS_617;
const __VLS_670 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_671 = __VLS_asFunctionalComponent(__VLS_670, new __VLS_670({
    modelValue: (__VLS_ctx.impactVisible),
    title: "质量诊断与影响范围",
    size: "520px",
}));
const __VLS_672 = __VLS_671({
    modelValue: (__VLS_ctx.impactVisible),
    title: "质量诊断与影响范围",
    size: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_671));
__VLS_673.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.impactLoading) }, null, null);
if (__VLS_ctx.impactError) {
    const __VLS_674 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_675 = __VLS_asFunctionalComponent(__VLS_674, new __VLS_674({
        title: (__VLS_ctx.impactError),
        type: "error",
        showIcon: true,
        closable: (false),
    }));
    const __VLS_676 = __VLS_675({
        title: (__VLS_ctx.impactError),
        type: "error",
        showIcon: true,
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_675));
}
else if (__VLS_ctx.selectedStatus) {
    const __VLS_678 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_679 = __VLS_asFunctionalComponent(__VLS_678, new __VLS_678({
        column: (1),
        border: true,
        size: "small",
    }));
    const __VLS_680 = __VLS_679({
        column: (1),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_679));
    __VLS_681.slots.default;
    const __VLS_682 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_683 = __VLS_asFunctionalComponent(__VLS_682, new __VLS_682({
        label: "资产",
    }));
    const __VLS_684 = __VLS_683({
        label: "资产",
    }, ...__VLS_functionalComponentArgsRest(__VLS_683));
    __VLS_685.slots.default;
    (__VLS_ctx.selectedStatus.asset_type);
    (__VLS_ctx.selectedStatus.asset_code || __VLS_ctx.selectedStatus.asset_id);
    var __VLS_685;
    const __VLS_686 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_687 = __VLS_asFunctionalComponent(__VLS_686, new __VLS_686({
        label: "期间",
    }));
    const __VLS_688 = __VLS_687({
        label: "期间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_687));
    __VLS_689.slots.default;
    (__VLS_ctx.selectedStatus.period || '未指定');
    var __VLS_689;
    const __VLS_690 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_691 = __VLS_asFunctionalComponent(__VLS_690, new __VLS_690({
        label: "状态",
    }));
    const __VLS_692 = __VLS_691({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_691));
    __VLS_693.slots.default;
    const __VLS_694 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_695 = __VLS_asFunctionalComponent(__VLS_694, new __VLS_694({
        type: (__VLS_ctx.qualityStatusTagType(__VLS_ctx.selectedStatus.status)),
    }));
    const __VLS_696 = __VLS_695({
        type: (__VLS_ctx.qualityStatusTagType(__VLS_ctx.selectedStatus.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_695));
    __VLS_697.slots.default;
    (__VLS_ctx.qualityStatusLabel(__VLS_ctx.selectedStatus.status));
    var __VLS_697;
    var __VLS_693;
    const __VLS_698 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_699 = __VLS_asFunctionalComponent(__VLS_698, new __VLS_698({
        label: "检查数",
    }));
    const __VLS_700 = __VLS_699({
        label: "检查数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_699));
    __VLS_701.slots.default;
    (__VLS_ctx.selectedStatus.checked_count);
    var __VLS_701;
    const __VLS_702 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_703 = __VLS_asFunctionalComponent(__VLS_702, new __VLS_702({
        label: "失败数",
    }));
    const __VLS_704 = __VLS_703({
        label: "失败数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_703));
    __VLS_705.slots.default;
    (__VLS_ctx.selectedStatus.failed_count);
    var __VLS_705;
    const __VLS_706 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_707 = __VLS_asFunctionalComponent(__VLS_706, new __VLS_706({
        label: "重复键数",
    }));
    const __VLS_708 = __VLS_707({
        label: "重复键数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_707));
    __VLS_709.slots.default;
    (__VLS_ctx.selectedStatus.duplicate_key_count);
    var __VLS_709;
    const __VLS_710 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_711 = __VLS_asFunctionalComponent(__VLS_710, new __VLS_710({
        label: "缺失键数",
    }));
    const __VLS_712 = __VLS_711({
        label: "缺失键数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_711));
    __VLS_713.slots.default;
    (__VLS_ctx.selectedStatus.missing_key_count);
    var __VLS_713;
    const __VLS_714 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_715 = __VLS_asFunctionalComponent(__VLS_714, new __VLS_714({
        label: "影响数据集",
    }));
    const __VLS_716 = __VLS_715({
        label: "影响数据集",
    }, ...__VLS_functionalComponentArgsRest(__VLS_715));
    __VLS_717.slots.default;
    (__VLS_ctx.selectedImpact?.dataset_count ?? '-');
    var __VLS_717;
    const __VLS_718 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_719 = __VLS_asFunctionalComponent(__VLS_718, new __VLS_718({
        label: "影响报表",
    }));
    const __VLS_720 = __VLS_719({
        label: "影响报表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_719));
    __VLS_721.slots.default;
    (__VLS_ctx.selectedImpact?.report_count ?? '-');
    var __VLS_721;
    var __VLS_681;
    const __VLS_722 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_723 = __VLS_asFunctionalComponent(__VLS_722, new __VLS_722({
        contentPosition: "left",
    }));
    const __VLS_724 = __VLS_723({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_723));
    __VLS_725.slots.default;
    var __VLS_725;
    for (const [sample, index] of __VLS_getVForSourceType(((__VLS_ctx.selectedStatus.sample_key_hashes || [])))) {
        const __VLS_726 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_727 = __VLS_asFunctionalComponent(__VLS_726, new __VLS_726({
            key: (index),
            type: "info",
            ...{ class: "hash-tag" },
        }));
        const __VLS_728 = __VLS_727({
            key: (index),
            type: "info",
            ...{ class: "hash-tag" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_727));
        __VLS_729.slots.default;
        (sample.key_hash || sample.hash || JSON.stringify(sample));
        var __VLS_729;
    }
    if (!(__VLS_ctx.selectedStatus.sample_key_hashes || []).length) {
        const __VLS_730 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_731 = __VLS_asFunctionalComponent(__VLS_730, new __VLS_730({
            description: "暂无哈希样例",
        }));
        const __VLS_732 = __VLS_731({
            description: "暂无哈希样例",
        }, ...__VLS_functionalComponentArgsRest(__VLS_731));
    }
    const __VLS_734 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_735 = __VLS_asFunctionalComponent(__VLS_734, new __VLS_734({
        contentPosition: "left",
    }));
    const __VLS_736 = __VLS_735({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_735));
    __VLS_737.slots.default;
    var __VLS_737;
    for (const [dataset] of __VLS_getVForSourceType(((__VLS_ctx.selectedImpact?.datasets || [])))) {
        const __VLS_738 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_739 = __VLS_asFunctionalComponent(__VLS_738, new __VLS_738({
            key: ('d-' + dataset.id),
            ...{ class: "scope-tag" },
        }));
        const __VLS_740 = __VLS_739({
            key: ('d-' + dataset.id),
            ...{ class: "scope-tag" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_739));
        __VLS_741.slots.default;
        (dataset.label || dataset.name);
        var __VLS_741;
    }
    for (const [report] of __VLS_getVForSourceType(((__VLS_ctx.selectedImpact?.reports || [])))) {
        const __VLS_742 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_743 = __VLS_asFunctionalComponent(__VLS_742, new __VLS_742({
            key: ('r-' + report.id),
            ...{ class: "scope-tag" },
            type: "success",
        }));
        const __VLS_744 = __VLS_743({
            key: ('r-' + report.id),
            ...{ class: "scope-tag" },
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_743));
        __VLS_745.slots.default;
        (report.name);
        var __VLS_745;
    }
}
var __VLS_673;
/** @type {[typeof ScheduleConfigDialog, ]} */ ;
// @ts-ignore
const __VLS_746 = __VLS_asFunctionalComponent(ScheduleConfigDialog, new ScheduleConfigDialog({
    visible: (__VLS_ctx.scheduleVisible),
    kind: "quality_run",
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: ({ rule_id: __VLS_ctx.scheduleBizId }),
    periodRequired: (__VLS_ctx.rules.find(r => r.id === __VLS_ctx.scheduleBizId)?.rule_type === 'relation_cardinality'),
}));
const __VLS_747 = __VLS_746({
    visible: (__VLS_ctx.scheduleVisible),
    kind: "quality_run",
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: ({ rule_id: __VLS_ctx.scheduleBizId }),
    periodRequired: (__VLS_ctx.rules.find(r => r.id === __VLS_ctx.scheduleBizId)?.rule_type === 'relation_cardinality'),
}, ...__VLS_functionalComponentArgsRest(__VLS_746));
const __VLS_749 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_750 = __VLS_asFunctionalComponent(__VLS_749, new __VLS_749({
    modelValue: (__VLS_ctx.runDialogVisible),
    title: "运行结果",
    width: "500px",
}));
const __VLS_751 = __VLS_750({
    modelValue: (__VLS_ctx.runDialogVisible),
    title: "运行结果",
    width: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_750));
__VLS_752.slots.default;
if (__VLS_ctx.runLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_753 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_754 = __VLS_asFunctionalComponent(__VLS_753, new __VLS_753({
        ...{ class: "is-loading" },
        size: (32),
    }));
    const __VLS_755 = __VLS_754({
        ...{ class: "is-loading" },
        size: (32),
    }, ...__VLS_functionalComponentArgsRest(__VLS_754));
    __VLS_756.slots.default;
    const __VLS_757 = {}.Loading;
    /** @type {[typeof __VLS_components.Loading, ]} */ ;
    // @ts-ignore
    const __VLS_758 = __VLS_asFunctionalComponent(__VLS_757, new __VLS_757({}));
    const __VLS_759 = __VLS_758({}, ...__VLS_functionalComponentArgsRest(__VLS_758));
    var __VLS_756;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ style: {} },
    });
}
else if (__VLS_ctx.runResult) {
    const __VLS_761 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_762 = __VLS_asFunctionalComponent(__VLS_761, new __VLS_761({
        column: (1),
        border: true,
        size: "small",
    }));
    const __VLS_763 = __VLS_762({
        column: (1),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_762));
    __VLS_764.slots.default;
    const __VLS_765 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_766 = __VLS_asFunctionalComponent(__VLS_765, new __VLS_765({
        label: "运行 ID",
    }));
    const __VLS_767 = __VLS_766({
        label: "运行 ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_766));
    __VLS_768.slots.default;
    (__VLS_ctx.runResult.run_id);
    var __VLS_768;
    const __VLS_769 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_770 = __VLS_asFunctionalComponent(__VLS_769, new __VLS_769({
        label: "结果",
    }));
    const __VLS_771 = __VLS_770({
        label: "结果",
    }, ...__VLS_functionalComponentArgsRest(__VLS_770));
    __VLS_772.slots.default;
    const __VLS_773 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_774 = __VLS_asFunctionalComponent(__VLS_773, new __VLS_773({
        type: (__VLS_ctx.runStatusTagType(__VLS_ctx.runResult.status)),
        size: "small",
    }));
    const __VLS_775 = __VLS_774({
        type: (__VLS_ctx.runStatusTagType(__VLS_ctx.runResult.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_774));
    __VLS_776.slots.default;
    (__VLS_ctx.runStatusLabel(__VLS_ctx.runResult.status));
    var __VLS_776;
    var __VLS_772;
    const __VLS_777 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_778 = __VLS_asFunctionalComponent(__VLS_777, new __VLS_777({
        label: "详情",
    }));
    const __VLS_779 = __VLS_778({
        label: "详情",
    }, ...__VLS_functionalComponentArgsRest(__VLS_778));
    __VLS_780.slots.default;
    (__VLS_ctx.runResult.message);
    var __VLS_780;
    var __VLS_764;
}
{
    const { footer: __VLS_thisSlot } = __VLS_752.slots;
    const __VLS_781 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_782 = __VLS_asFunctionalComponent(__VLS_781, new __VLS_781({
        ...{ 'onClick': {} },
    }));
    const __VLS_783 = __VLS_782({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_782));
    let __VLS_785;
    let __VLS_786;
    let __VLS_787;
    const __VLS_788 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runDialogVisible = false;
        }
    };
    __VLS_784.slots.default;
    var __VLS_784;
}
var __VLS_752;
/** @type {__VLS_StyleScopedClasses['quality-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-card']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-num']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-label']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-card']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-num']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-label']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-card']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-num']} */ ;
/** @type {__VLS_StyleScopedClasses['alert-label']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-card']} */ ;
/** @type {__VLS_StyleScopedClasses['status-card']} */ ;
/** @type {__VLS_StyleScopedClasses['status-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['status-title']} */ ;
/** @type {__VLS_StyleScopedClasses['status-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['status-summary-item']} */ ;
/** @type {__VLS_StyleScopedClasses['hash-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
// @ts-ignore
var __VLS_337 = __VLS_336;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Plus: Plus,
            Refresh: Refresh,
            VideoPlay: VideoPlay,
            Switch: Switch,
            Delete: Delete,
            Edit: Edit,
            InfoFilled: InfoFilled,
            Loading: Loading,
            Clock: Clock,
            RefreshRight: RefreshRight,
            QUALITY_SEVERITY_LABELS: QUALITY_SEVERITY_LABELS,
            ScheduleConfigDialog: ScheduleConfigDialog,
            loading: loading,
            rules: rules,
            total: total,
            page: page,
            pageSize: pageSize,
            filterAssetType: filterAssetType,
            filterRuleType: filterRuleType,
            filterEnabled: filterEnabled,
            dialogVisible: dialogVisible,
            dialogTitle: dialogTitle,
            formRef: formRef,
            qualityMetadataLoading: qualityMetadataLoading,
            form: form,
            runDialogVisible: runDialogVisible,
            runResult: runResult,
            runLoading: runLoading,
            alerts: alerts,
            statusLoading: statusLoading,
            statusError: statusError,
            statusStale: statusStale,
            qualityPeriod: qualityPeriod,
            qualityStatuses: qualityStatuses,
            impactVisible: impactVisible,
            impactLoading: impactLoading,
            impactError: impactError,
            selectedStatus: selectedStatus,
            selectedImpact: selectedImpact,
            rebuildingIndex: rebuildingIndex,
            statusSummary: statusSummary,
            qualityStatusLabel: qualityStatusLabel,
            qualityStatusTagType: qualityStatusTagType,
            loadQualityStatuses: loadQualityStatuses,
            showQualityImpact: showQualityImpact,
            handleRebuildIndex: handleRebuildIndex,
            runsVisible: runsVisible,
            runs: runs,
            retrying: retrying,
            showRuns: showRuns,
            retryQualityRun: retryQualityRun,
            scheduleVisible: scheduleVisible,
            scheduleBizId: scheduleBizId,
            scheduleBizName: scheduleBizName,
            openSchedule: openSchedule,
            relationDatasets: relationDatasets,
            relationOptions: relationOptions,
            selectedQualityRelation: selectedQualityRelation,
            onQualityDatasetChange: onQualityDatasetChange,
            onQualityRelationChange: onQualityRelationChange,
            ruleTypeOptions: ruleTypeOptions,
            severityOptions: severityOptions,
            isUnexecutable: isUnexecutable,
            load: load,
            openCreate: openCreate,
            openEdit: openEdit,
            onRuleTypeChange: onRuleTypeChange,
            handleSave: handleSave,
            handleToggle: handleToggle,
            handleDelete: handleDelete,
            handleRun: handleRun,
            ruleTypeLabel: ruleTypeLabel,
            severityTagType: severityTagType,
            runStatusTagType: runStatusTagType,
            runStatusLabel: runStatusLabel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
