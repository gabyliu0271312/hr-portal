/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, computed, onMounted } from 'vue';
import { Refresh, Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { monitorApi, } from '@/api/ucp';
const hours = ref(24);
const summary = ref(null);
const trend = ref([]);
const statusDist = ref({});
const recentRuns = ref([]);
const alerts = ref([]);
const pipeStats = ref([]);
const loadingSummary = ref(false);
const loadingTrend = ref(false);
const loadingStatus = ref(false);
const loadingRecent = ref(false);
const loadingAlerts = ref(false);
const loadingPipes = ref(false);
const chartW = 700;
const chartH = 220;
const marginX = 30;
const marginY = 20;
async function loadAll() {
    await Promise.all([
        loadSummary(),
        loadTrend(),
        loadStatus(),
        loadRecent(),
        loadAlerts(),
        loadPipeStats(),
    ]);
}
async function loadSummary() {
    loadingSummary.value = true;
    try {
        summary.value = await monitorApi.summary(hours.value);
    }
    finally {
        loadingSummary.value = false;
    }
}
async function loadTrend() {
    loadingTrend.value = true;
    try {
        trend.value = await monitorApi.trend(hours.value, 'hour');
    }
    finally {
        loadingTrend.value = false;
    }
}
async function loadStatus() {
    loadingStatus.value = true;
    try {
        statusDist.value = await monitorApi.statusDistribution(hours.value);
    }
    finally {
        loadingStatus.value = false;
    }
}
async function loadRecent() {
    loadingRecent.value = true;
    try {
        recentRuns.value = await monitorApi.recentRuns(50);
    }
    finally {
        loadingRecent.value = false;
    }
}
async function loadAlerts() {
    loadingAlerts.value = true;
    try {
        alerts.value = await monitorApi.alerts(50);
    }
    finally {
        loadingAlerts.value = false;
    }
}
async function loadPipeStats() {
    loadingPipes.value = true;
    try {
        pipeStats.value = await monitorApi.pipelineStats(hours.value, 10);
    }
    finally {
        loadingPipes.value = false;
    }
}
// ===== 图表计算 =====
const maxY = computed(() => {
    const m = Math.max(1, ...trend.value.map((t) => Math.max(t.total, t.success, t.failed)));
    return Math.ceil(m * 1.1);
});
function xPos(i) {
    if (trend.value.length <= 1)
        return chartW / 2;
    return marginX + (i / (trend.value.length - 1)) * (chartW - 2 * marginX);
}
function yPos(v) {
    return chartH - marginY - (v / maxY.value) * (chartH - 2 * marginY);
}
const totalLinePoints = computed(() => trend.value.map((t, i) => `${xPos(i)},${yPos(t.total)}`).join(' '));
const successLinePoints = computed(() => trend.value.map((t, i) => `${xPos(i)},${yPos(t.success)}`).join(' '));
const failedLinePoints = computed(() => trend.value.map((t, i) => `${xPos(i)},${yPos(t.failed)}`).join(' '));
function shortBucket(b) {
    if (!b)
        return '';
    return b.length > 12 ? b.slice(5) : b;
}
// 饼图
const STATUS_COLORS = {
    SUCCESS: '#67C23A',
    PARTIAL_SUCCESS: '#E6A23C',
    FAILED: '#F56C6C',
    RUNNING: '#409EFF',
    PENDING: '#909399',
    CANCELLED: '#C0C4CC',
    TIMEOUT: '#F56C6C',
};
function statusColor(s) {
    return STATUS_COLORS[s] || '#909399';
}
const statusList = computed(() => Object.entries(statusDist.value)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count));
const totalCount = computed(() => statusList.value.reduce((sum, s) => sum + s.count, 0));
const pieSlices = computed(() => {
    const list = statusList.value;
    if (list.length === 0 || totalCount.value === 0)
        return [];
    let startAngle = -Math.PI / 2;
    const slices = [];
    for (const s of list) {
        const angle = (s.count / totalCount.value) * Math.PI * 2;
        const endAngle = startAngle + angle;
        const x1 = Math.cos(startAngle) * 80;
        const y1 = Math.sin(startAngle) * 80;
        const x2 = Math.cos(endAngle) * 80;
        const y2 = Math.sin(endAngle) * 80;
        const largeArc = angle > Math.PI ? 1 : 0;
        const path = `M 0 0 L ${x1} ${y1} A 80 80 0 ${largeArc} 1 ${x2} ${y2} Z`;
        slices.push({ path, color: statusColor(s.status) });
        startAngle = endAngle;
    }
    return slices;
});
// 工具
function formatMs(ms) {
    if (ms === null || ms === undefined)
        return '-';
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60_000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
}
function statusTagType(s) {
    if (s === 'SUCCESS')
        return 'success';
    if (s === 'PARTIAL_SUCCESS')
        return 'warning';
    if (s === 'FAILED' || s === 'TIMEOUT')
        return 'danger';
    if (s === 'RUNNING')
        return 'primary';
    return 'info';
}
const failRateClass = computed(() => {
    if (!summary.value)
        return '';
    if (summary.value.fail_rate > 20)
        return 'text-error';
    if (summary.value.fail_rate > 5)
        return 'text-warn';
    return 'text-success';
});
// ── Phase 4: 告警规则管理 ──
import { alertRuleApi } from '@/api/ucp';
const alertRules = ref([]);
const loadingRules = ref(false);
const alertRuleDialogVisible = ref(false);
const editingAlertRule = ref(null);
const alertRuleForm = ref({
    rule_code: '', rule_name: '', rule_type: 'FAIL_RATE',
    threshold_value: 0, threshold_unit: 'percent',
    notify_channels: '', cooldown_minutes: 60, description: '',
});
function ruleTypeLabel(t) {
    const m = { FAIL_RATE: '失败率', CONSECUTIVE_FAIL: '连续失败', DURATION: '平均耗时', DEAD_LETTER_COUNT: '死信数量' };
    return m[t] || t;
}
async function loadAlertRules() {
    loadingRules.value = true;
    try {
        const res = await alertRuleApi.list();
        alertRules.value = res.items;
    }
    catch {
        alertRules.value = [];
    }
    finally {
        loadingRules.value = false;
    }
}
function openAlertRuleDialog(row) {
    if (row) {
        editingAlertRule.value = row;
        alertRuleForm.value = {
            rule_code: row.rule_code, rule_name: row.rule_name, rule_type: row.rule_type,
            threshold_value: row.threshold_value, threshold_unit: row.threshold_unit || 'percent',
            notify_channels: row.notify_channels || '', cooldown_minutes: row.cooldown_minutes,
            description: row.description || '',
        };
    }
    else {
        editingAlertRule.value = null;
        alertRuleForm.value = { rule_code: '', rule_name: '', rule_type: 'FAIL_RATE', threshold_value: 0, threshold_unit: 'percent', notify_channels: '', cooldown_minutes: 60, description: '' };
    }
    alertRuleDialogVisible.value = true;
}
async function saveAlertRule() {
    if (!alertRuleForm.value.rule_code || !alertRuleForm.value.rule_name) {
        ElMessage.warning('请填写规则编码和名称');
        return;
    }
    try {
        if (editingAlertRule.value) {
            await alertRuleApi.update(editingAlertRule.value.id, alertRuleForm.value);
            ElMessage.success('规则已更新');
        }
        else {
            await alertRuleApi.create(alertRuleForm.value);
            ElMessage.success('规则已创建');
        }
        alertRuleDialogVisible.value = false;
        await loadAlertRules();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
}
async function toggleAlertRule(row) {
    try {
        await alertRuleApi.update(row.id, { is_active: row.is_active ? 0 : 1 });
        row.is_active = row.is_active ? 0 : 1;
        ElMessage.success(row.is_active ? '已启用' : '已停用');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function deleteAlertRule(row) {
    try {
        await ElMessageBox.confirm(`确定删除规则「${row.rule_name}」？`, '删除确认', { type: 'warning' });
    }
    catch {
        return;
    }
    try {
        await alertRuleApi.delete(row.id);
        ElMessage.success('已删除');
        await loadAlertRules();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
onMounted(loadAll);
onMounted(loadAlertRules);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['pie-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['pie-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['pie-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-count']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "monitor-dashboard-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "actions" },
});
const __VLS_0 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.hours),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.hours),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.loadAll)
};
__VLS_3.slots.default;
const __VLS_8 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    value: (4),
}));
const __VLS_10 = __VLS_9({
    value: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
var __VLS_11;
const __VLS_12 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    value: (24),
}));
const __VLS_14 = __VLS_13({
    value: (24),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
var __VLS_15;
const __VLS_16 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    value: (168),
}));
const __VLS_18 = __VLS_17({
    value: (168),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
var __VLS_19;
const __VLS_20 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    value: (720),
}));
const __VLS_22 = __VLS_21({
    value: (720),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
var __VLS_23;
var __VLS_3;
const __VLS_24 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_26 = __VLS_25({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onClick: (__VLS_ctx.loadAll)
};
__VLS_27.slots.default;
var __VLS_27;
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (...[$event]) => {
        __VLS_ctx.$router.push('/ucp/circuits');
    }
};
__VLS_35.slots.default;
var __VLS_35;
const __VLS_40 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    gutter: (12),
    ...{ class: "stat-row" },
}));
const __VLS_42 = __VLS_41({
    gutter: (12),
    ...{ class: "stat-row" },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingSummary) }, null, null);
__VLS_43.slots.default;
const __VLS_44 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    span: (4),
}));
const __VLS_46 = __VLS_45({
    span: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ class: "stat-card" },
}));
const __VLS_50 = __VLS_49({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.summary?.pipeline_total ?? '-');
var __VLS_51;
var __VLS_47;
const __VLS_52 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    span: (4),
}));
const __VLS_54 = __VLS_53({
    span: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ class: "stat-card stat-success" },
}));
const __VLS_58 = __VLS_57({
    ...{ class: "stat-card stat-success" },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.summary?.pipeline_success ?? '-');
var __VLS_59;
var __VLS_55;
const __VLS_60 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    span: (4),
}));
const __VLS_62 = __VLS_61({
    span: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ class: "stat-card stat-warn" },
}));
const __VLS_66 = __VLS_65({
    ...{ class: "stat-card stat-warn" },
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.summary?.pipeline_partial ?? '-');
var __VLS_67;
var __VLS_63;
const __VLS_68 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    span: (4),
}));
const __VLS_70 = __VLS_69({
    span: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ class: "stat-card stat-error" },
}));
const __VLS_74 = __VLS_73({
    ...{ class: "stat-card stat-error" },
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.summary?.pipeline_failed ?? '-');
var __VLS_75;
var __VLS_71;
const __VLS_76 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    span: (4),
}));
const __VLS_78 = __VLS_77({
    span: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    ...{ class: "stat-card" },
}));
const __VLS_82 = __VLS_81({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
    ...{ class: (__VLS_ctx.failRateClass) },
});
(__VLS_ctx.summary?.fail_rate ?? '0');
var __VLS_83;
var __VLS_79;
const __VLS_84 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    span: (4),
}));
const __VLS_86 = __VLS_85({
    span: (4),
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ class: "stat-card" },
}));
const __VLS_90 = __VLS_89({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.formatMs(__VLS_ctx.summary?.avg_duration_ms));
var __VLS_91;
var __VLS_87;
var __VLS_43;
const __VLS_92 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    gutter: (12),
    ...{ class: "stat-row" },
}));
const __VLS_94 = __VLS_93({
    gutter: (12),
    ...{ class: "stat-row" },
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingSummary) }, null, null);
__VLS_95.slots.default;
const __VLS_96 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    span: (6),
}));
const __VLS_98 = __VLS_97({
    span: (6),
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    ...{ class: "stat-card-mini" },
}));
const __VLS_102 = __VLS_101({
    ...{ class: "stat-card-mini" },
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-value" },
});
(__VLS_ctx.summary?.pipeline_running ?? '-');
var __VLS_103;
var __VLS_99;
const __VLS_104 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    span: (6),
}));
const __VLS_106 = __VLS_105({
    span: (6),
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ class: "stat-card-mini" },
}));
const __VLS_110 = __VLS_109({
    ...{ class: "stat-card-mini" },
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-value" },
});
(__VLS_ctx.summary?.events_total ?? '-');
var __VLS_111;
var __VLS_107;
const __VLS_112 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    span: (6),
}));
const __VLS_114 = __VLS_113({
    span: (6),
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
const __VLS_116 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    ...{ class: "stat-card-mini" },
}));
const __VLS_118 = __VLS_117({
    ...{ class: "stat-card-mini" },
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-value text-warn" },
});
(__VLS_ctx.summary?.events_failed ?? '-');
var __VLS_119;
var __VLS_115;
const __VLS_120 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    span: (6),
}));
const __VLS_122 = __VLS_121({
    span: (6),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    ...{ class: "stat-card-mini" },
}));
const __VLS_126 = __VLS_125({
    ...{ class: "stat-card-mini" },
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "mini-value text-error" },
});
(__VLS_ctx.summary?.dead_letters ?? '-');
(__VLS_ctx.summary?.pending_approvals ?? '-');
var __VLS_127;
var __VLS_123;
var __VLS_95;
const __VLS_128 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    gutter: (12),
    ...{ class: "chart-row" },
}));
const __VLS_130 = __VLS_129({
    gutter: (12),
    ...{ class: "chart-row" },
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    span: (16),
}));
const __VLS_134 = __VLS_133({
    span: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_139.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.hours);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chart-container" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingTrend) }, null, null);
if (__VLS_ctx.trend.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: (`0 0 ${__VLS_ctx.chartW} ${__VLS_ctx.chartH}`),
        width: (__VLS_ctx.chartW),
        height: (__VLS_ctx.chartH),
    });
    for (const [i] of __VLS_getVForSourceType((5))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
            key: (`grid-${i}`),
            x1: (__VLS_ctx.marginX),
            y1: ((__VLS_ctx.chartH - __VLS_ctx.marginY) * i / 5 + __VLS_ctx.marginY / 5),
            x2: (__VLS_ctx.chartW - __VLS_ctx.marginX),
            y2: ((__VLS_ctx.chartH - __VLS_ctx.marginY) * i / 5 + __VLS_ctx.marginY / 5),
            stroke: "#ebeef5",
            'stroke-dasharray': "2,2",
        });
    }
    for (const [t, i] of __VLS_getVForSourceType((__VLS_ctx.trend))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
            key: (`x-${i}`),
            x: (__VLS_ctx.xPos(i)),
            y: (__VLS_ctx.chartH - 5),
            'font-size': "9",
            fill: "#909399",
            'text-anchor': "middle",
        });
        (__VLS_ctx.shortBucket(t.bucket));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: (__VLS_ctx.successLinePoints),
        stroke: "#67C23A",
        'stroke-width': "2",
        fill: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: (__VLS_ctx.failedLinePoints),
        stroke: "#F56C6C",
        'stroke-width': "2",
        fill: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: (__VLS_ctx.totalLinePoints),
        stroke: "#409EFF",
        'stroke-width': "2",
        fill: "none",
        'stroke-dasharray': "3,2",
    });
    for (const [t, i] of __VLS_getVForSourceType((__VLS_ctx.trend))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            key: (`s-${i}`),
            cx: (__VLS_ctx.xPos(i)),
            cy: (__VLS_ctx.yPos(t.success)),
            r: "3",
            fill: "#67C23A",
        });
    }
    for (const [t, i] of __VLS_getVForSourceType((__VLS_ctx.trend))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            key: (`f-${i}`),
            cx: (__VLS_ctx.xPos(i)),
            cy: (__VLS_ctx.yPos(t.failed)),
            r: "3",
            fill: "#F56C6C",
        });
    }
}
else {
    const __VLS_140 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        description: "暂无数据",
    }));
    const __VLS_142 = __VLS_141({
        description: "暂无数据",
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "chart-legend" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
    ...{ style: {} },
});
var __VLS_139;
var __VLS_135;
const __VLS_144 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    span: (8),
}));
const __VLS_146 = __VLS_145({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
const __VLS_148 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_151.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pie-container" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingStatus) }, null, null);
if (__VLS_ctx.statusList.length > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: (`0 0 200 200`),
        width: "200",
        height: "200",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.g, __VLS_intrinsicElements.g)({
        transform: "translate(100,100)",
    });
    for (const [slice, i] of __VLS_getVForSourceType((__VLS_ctx.pieSlices))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            key: (`slice-${i}`),
            d: (slice.path),
            fill: (slice.color),
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        r: "40",
        fill: "#fff",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
        'text-anchor': "middle",
        y: "-5",
        'font-size': "14",
        'font-weight': "bold",
    });
    (__VLS_ctx.totalCount);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.text, __VLS_intrinsicElements.text)({
        'text-anchor': "middle",
        y: "15",
        'font-size': "10",
        fill: "#909399",
    });
}
else {
    const __VLS_152 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        description: "暂无数据",
        imageSize: (80),
    }));
    const __VLS_154 = __VLS_153({
        description: "暂无数据",
        imageSize: (80),
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ class: "pie-legend" },
});
for (const [s, i] of __VLS_getVForSourceType((__VLS_ctx.statusList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
        key: (s.status),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ style: ({ background: __VLS_ctx.statusColor(s.status) }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (s.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (s.count);
}
var __VLS_151;
var __VLS_147;
var __VLS_131;
const __VLS_156 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    gutter: (12),
    ...{ class: "chart-row" },
}));
const __VLS_158 = __VLS_157({
    gutter: (12),
    ...{ class: "chart-row" },
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
const __VLS_160 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    span: (12),
}));
const __VLS_162 = __VLS_161({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({}));
const __VLS_166 = __VLS_165({}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_167.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pipe-stats" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingPipes) }, null, null);
for (const [p] of __VLS_getVForSourceType((__VLS_ctx.pipeStats))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (p.pipeline_code),
        ...{ class: "pipe-bar-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pipe-name" },
    });
    (p.pipeline_code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pipe-bar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pipe-bar-success" },
        ...{ style: ({ width: (p.success / p.total * 100) + '%' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pipe-bar-failed" },
        ...{ style: ({ width: (p.failed / p.total * 100) + '%' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "pipe-count" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (p.total);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
        ...{ class: (p.fail_rate > 10 ? 'text-error' : '') },
    });
    (p.fail_rate);
}
if (__VLS_ctx.pipeStats.length === 0) {
    const __VLS_168 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        description: "暂无数据",
        imageSize: (80),
    }));
    const __VLS_170 = __VLS_169({
        description: "暂无数据",
        imageSize: (80),
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
}
var __VLS_167;
var __VLS_163;
const __VLS_172 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    span: (12),
}));
const __VLS_174 = __VLS_173({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
__VLS_175.slots.default;
const __VLS_176 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({}));
const __VLS_178 = __VLS_177({}, ...__VLS_functionalComponentArgsRest(__VLS_177));
__VLS_179.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_179.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.alerts.length);
}
const __VLS_180 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    data: (__VLS_ctx.alerts),
    stripe: true,
    maxHeight: "400",
}));
const __VLS_182 = __VLS_181({
    data: (__VLS_ctx.alerts),
    stripe: true,
    maxHeight: "400",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingAlerts) }, null, null);
__VLS_183.slots.default;
const __VLS_184 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    label: "级别",
    width: "80",
}));
const __VLS_186 = __VLS_185({
    label: "级别",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_187.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_188 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        type: (row.level === 'CRITICAL' ? 'danger' : 'warning'),
        size: "small",
    }));
    const __VLS_190 = __VLS_189({
        type: (row.level === 'CRITICAL' ? 'danger' : 'warning'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    (row.level);
    var __VLS_191;
}
var __VLS_187;
const __VLS_192 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
    prop: "type",
    label: "类型",
    width: "120",
}));
const __VLS_194 = __VLS_193({
    prop: "type",
    label: "类型",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_193));
const __VLS_196 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
    prop: "message",
    label: "内容",
    showOverflowTooltip: true,
}));
const __VLS_198 = __VLS_197({
    prop: "message",
    label: "内容",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_197));
const __VLS_200 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    label: "时间",
    width: "160",
}));
const __VLS_202 = __VLS_201({
    label: "时间",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_203.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "muted" },
    });
    (__VLS_ctx.formatDateTime(row.created_at) || '-');
}
var __VLS_203;
var __VLS_183;
var __VLS_179;
var __VLS_175;
var __VLS_159;
const __VLS_204 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({}));
const __VLS_206 = __VLS_205({}, ...__VLS_functionalComponentArgsRest(__VLS_205));
__VLS_207.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_207.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.recentRuns.length);
}
const __VLS_208 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    data: (__VLS_ctx.recentRuns),
    stripe: true,
    maxHeight: "500",
}));
const __VLS_210 = __VLS_209({
    data: (__VLS_ctx.recentRuns),
    stripe: true,
    maxHeight: "500",
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingRecent) }, null, null);
__VLS_211.slots.default;
const __VLS_212 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
    prop: "pipeline_code",
    label: "Pipeline",
    width: "200",
}));
const __VLS_214 = __VLS_213({
    prop: "pipeline_code",
    label: "Pipeline",
    width: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_213));
const __VLS_216 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
    prop: "pipeline_run_id",
    label: "Run ID",
    width: "220",
}));
const __VLS_218 = __VLS_217({
    prop: "pipeline_run_id",
    label: "Run ID",
    width: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_217));
__VLS_219.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_219.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
        ...{ class: "run-id" },
    });
    (row.pipeline_run_id);
}
var __VLS_219;
const __VLS_220 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    label: "状态",
    width: "120",
}));
const __VLS_222 = __VLS_221({
    label: "状态",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
__VLS_223.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_223.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_224 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        type: (__VLS_ctx.statusTagType(row.status)),
        size: "small",
    }));
    const __VLS_226 = __VLS_225({
        type: (__VLS_ctx.statusTagType(row.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_227.slots.default;
    (row.status);
    var __VLS_227;
}
var __VLS_223;
const __VLS_228 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
    prop: "trigger_type",
    label: "触发",
    width: "100",
}));
const __VLS_230 = __VLS_229({
    prop: "trigger_type",
    label: "触发",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_229));
const __VLS_232 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    prop: "triggered_by",
    label: "操作人",
    width: "120",
}));
const __VLS_234 = __VLS_233({
    prop: "triggered_by",
    label: "操作人",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
const __VLS_236 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
    label: "耗时",
    width: "100",
}));
const __VLS_238 = __VLS_237({
    label: "耗时",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_237));
__VLS_239.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_239.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatMs(row.duration_ms));
}
var __VLS_239;
const __VLS_240 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    label: "开始时间",
    width: "180",
}));
const __VLS_242 = __VLS_241({
    label: "开始时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
__VLS_243.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_243.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "muted" },
    });
    (__VLS_ctx.formatDateTime(row.started_at) || __VLS_ctx.formatDateTime(row.created_at) || '-');
}
var __VLS_243;
var __VLS_211;
var __VLS_207;
const __VLS_244 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
    ...{ style: {} },
}));
const __VLS_246 = __VLS_245({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_245));
__VLS_247.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_247.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.alertRules.length);
    const __VLS_248 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
    }));
    const __VLS_250 = __VLS_249({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
    let __VLS_252;
    let __VLS_253;
    let __VLS_254;
    const __VLS_255 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openAlertRuleDialog();
        }
    };
    __VLS_251.slots.default;
    const __VLS_256 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({}));
    const __VLS_258 = __VLS_257({}, ...__VLS_functionalComponentArgsRest(__VLS_257));
    __VLS_259.slots.default;
    const __VLS_260 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({}));
    const __VLS_262 = __VLS_261({}, ...__VLS_functionalComponentArgsRest(__VLS_261));
    var __VLS_259;
    var __VLS_251;
}
const __VLS_264 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
    data: (__VLS_ctx.alertRules),
    stripe: true,
    maxHeight: "300",
}));
const __VLS_266 = __VLS_265({
    data: (__VLS_ctx.alertRules),
    stripe: true,
    maxHeight: "300",
}, ...__VLS_functionalComponentArgsRest(__VLS_265));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingRules) }, null, null);
__VLS_267.slots.default;
const __VLS_268 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
    prop: "rule_name",
    label: "规则名称",
    minWidth: "140",
}));
const __VLS_270 = __VLS_269({
    prop: "rule_name",
    label: "规则名称",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_269));
const __VLS_272 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
    label: "类型",
    width: "140",
}));
const __VLS_274 = __VLS_273({
    label: "类型",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_273));
__VLS_275.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_275.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_276 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        size: "small",
    }));
    const __VLS_278 = __VLS_277({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    __VLS_279.slots.default;
    (__VLS_ctx.ruleTypeLabel(row.rule_type));
    var __VLS_279;
}
var __VLS_275;
const __VLS_280 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
    label: "阈值",
    width: "120",
}));
const __VLS_282 = __VLS_281({
    label: "阈值",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_281));
__VLS_283.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_283.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.threshold_value);
    (row.threshold_unit === 'percent' ? '%' : row.threshold_unit === 'ms' ? 'ms' : '');
}
var __VLS_283;
const __VLS_284 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
    label: "通知",
    minWidth: "140",
}));
const __VLS_286 = __VLS_285({
    label: "通知",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_285));
__VLS_287.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_287.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.notify_channels || '—');
}
var __VLS_287;
const __VLS_288 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
    label: "冷却",
    width: "100",
}));
const __VLS_290 = __VLS_289({
    label: "冷却",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_289));
__VLS_291.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_291.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.cooldown_minutes);
}
var __VLS_291;
const __VLS_292 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
    label: "状态",
    width: "80",
}));
const __VLS_294 = __VLS_293({
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_293));
__VLS_295.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_295.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_296 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
        ...{ 'onChange': {} },
        modelValue: (!!row.is_active),
        size: "small",
    }));
    const __VLS_298 = __VLS_297({
        ...{ 'onChange': {} },
        modelValue: (!!row.is_active),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
    let __VLS_300;
    let __VLS_301;
    let __VLS_302;
    const __VLS_303 = {
        onChange: (...[$event]) => {
            __VLS_ctx.toggleAlertRule(row);
        }
    };
    var __VLS_299;
}
var __VLS_295;
const __VLS_304 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
    label: "操作",
    width: "100",
}));
const __VLS_306 = __VLS_305({
    label: "操作",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_305));
__VLS_307.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_307.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_308 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_310 = __VLS_309({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    let __VLS_312;
    let __VLS_313;
    let __VLS_314;
    const __VLS_315 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openAlertRuleDialog(row);
        }
    };
    __VLS_311.slots.default;
    var __VLS_311;
    const __VLS_316 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }));
    const __VLS_318 = __VLS_317({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_317));
    let __VLS_320;
    let __VLS_321;
    let __VLS_322;
    const __VLS_323 = {
        onClick: (...[$event]) => {
            __VLS_ctx.deleteAlertRule(row);
        }
    };
    __VLS_319.slots.default;
    var __VLS_319;
}
var __VLS_307;
var __VLS_267;
var __VLS_247;
const __VLS_324 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
    modelValue: (__VLS_ctx.alertRuleDialogVisible),
    title: (__VLS_ctx.editingAlertRule ? '编辑告警规则' : '新建告警规则'),
    width: "560px",
    closeOnClickModal: (false),
}));
const __VLS_326 = __VLS_325({
    modelValue: (__VLS_ctx.alertRuleDialogVisible),
    title: (__VLS_ctx.editingAlertRule ? '编辑告警规则' : '新建告警规则'),
    width: "560px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_325));
__VLS_327.slots.default;
const __VLS_328 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
    model: (__VLS_ctx.alertRuleForm),
    labelWidth: "100px",
}));
const __VLS_330 = __VLS_329({
    model: (__VLS_ctx.alertRuleForm),
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_329));
__VLS_331.slots.default;
const __VLS_332 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
    label: "规则编码",
    required: true,
}));
const __VLS_334 = __VLS_333({
    label: "规则编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_333));
__VLS_335.slots.default;
const __VLS_336 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
    modelValue: (__VLS_ctx.alertRuleForm.rule_code),
    disabled: (!!__VLS_ctx.editingAlertRule),
    placeholder: "如 fail_rate_gt_20",
}));
const __VLS_338 = __VLS_337({
    modelValue: (__VLS_ctx.alertRuleForm.rule_code),
    disabled: (!!__VLS_ctx.editingAlertRule),
    placeholder: "如 fail_rate_gt_20",
}, ...__VLS_functionalComponentArgsRest(__VLS_337));
var __VLS_335;
const __VLS_340 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
    label: "规则名称",
    required: true,
}));
const __VLS_342 = __VLS_341({
    label: "规则名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_341));
__VLS_343.slots.default;
const __VLS_344 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
    modelValue: (__VLS_ctx.alertRuleForm.rule_name),
    placeholder: "如 失败率超过20%",
}));
const __VLS_346 = __VLS_345({
    modelValue: (__VLS_ctx.alertRuleForm.rule_name),
    placeholder: "如 失败率超过20%",
}, ...__VLS_functionalComponentArgsRest(__VLS_345));
var __VLS_343;
const __VLS_348 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
    label: "规则类型",
}));
const __VLS_350 = __VLS_349({
    label: "规则类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_349));
__VLS_351.slots.default;
const __VLS_352 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
    modelValue: (__VLS_ctx.alertRuleForm.rule_type),
    ...{ style: {} },
}));
const __VLS_354 = __VLS_353({
    modelValue: (__VLS_ctx.alertRuleForm.rule_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_353));
__VLS_355.slots.default;
const __VLS_356 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
    label: "失败率",
    value: "FAIL_RATE",
}));
const __VLS_358 = __VLS_357({
    label: "失败率",
    value: "FAIL_RATE",
}, ...__VLS_functionalComponentArgsRest(__VLS_357));
const __VLS_360 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
    label: "连续失败",
    value: "CONSECUTIVE_FAIL",
}));
const __VLS_362 = __VLS_361({
    label: "连续失败",
    value: "CONSECUTIVE_FAIL",
}, ...__VLS_functionalComponentArgsRest(__VLS_361));
const __VLS_364 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
    label: "平均耗时",
    value: "DURATION",
}));
const __VLS_366 = __VLS_365({
    label: "平均耗时",
    value: "DURATION",
}, ...__VLS_functionalComponentArgsRest(__VLS_365));
const __VLS_368 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
    label: "死信数量",
    value: "DEAD_LETTER_COUNT",
}));
const __VLS_370 = __VLS_369({
    label: "死信数量",
    value: "DEAD_LETTER_COUNT",
}, ...__VLS_functionalComponentArgsRest(__VLS_369));
var __VLS_355;
var __VLS_351;
const __VLS_372 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
    label: "阈值",
}));
const __VLS_374 = __VLS_373({
    label: "阈值",
}, ...__VLS_functionalComponentArgsRest(__VLS_373));
__VLS_375.slots.default;
const __VLS_376 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
    modelValue: (__VLS_ctx.alertRuleForm.threshold_value),
    min: (0),
    ...{ style: {} },
}));
const __VLS_378 = __VLS_377({
    modelValue: (__VLS_ctx.alertRuleForm.threshold_value),
    min: (0),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_377));
const __VLS_380 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
    modelValue: (__VLS_ctx.alertRuleForm.threshold_unit),
    ...{ style: {} },
    clearable: true,
}));
const __VLS_382 = __VLS_381({
    modelValue: (__VLS_ctx.alertRuleForm.threshold_unit),
    ...{ style: {} },
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_381));
__VLS_383.slots.default;
const __VLS_384 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
    label: "百分比",
    value: "percent",
}));
const __VLS_386 = __VLS_385({
    label: "百分比",
    value: "percent",
}, ...__VLS_functionalComponentArgsRest(__VLS_385));
const __VLS_388 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
    label: "次数",
    value: "count",
}));
const __VLS_390 = __VLS_389({
    label: "次数",
    value: "count",
}, ...__VLS_functionalComponentArgsRest(__VLS_389));
const __VLS_392 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
    label: "毫秒",
    value: "ms",
}));
const __VLS_394 = __VLS_393({
    label: "毫秒",
    value: "ms",
}, ...__VLS_functionalComponentArgsRest(__VLS_393));
var __VLS_383;
var __VLS_375;
const __VLS_396 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
    label: "通知渠道",
}));
const __VLS_398 = __VLS_397({
    label: "通知渠道",
}, ...__VLS_functionalComponentArgsRest(__VLS_397));
__VLS_399.slots.default;
const __VLS_400 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
    modelValue: (__VLS_ctx.alertRuleForm.notify_channels),
    placeholder: "feishu,email",
}));
const __VLS_402 = __VLS_401({
    modelValue: (__VLS_ctx.alertRuleForm.notify_channels),
    placeholder: "feishu,email",
}, ...__VLS_functionalComponentArgsRest(__VLS_401));
var __VLS_399;
const __VLS_404 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
    label: "冷却时间(分)",
}));
const __VLS_406 = __VLS_405({
    label: "冷却时间(分)",
}, ...__VLS_functionalComponentArgsRest(__VLS_405));
__VLS_407.slots.default;
const __VLS_408 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
    modelValue: (__VLS_ctx.alertRuleForm.cooldown_minutes),
    min: (1),
    max: (1440),
}));
const __VLS_410 = __VLS_409({
    modelValue: (__VLS_ctx.alertRuleForm.cooldown_minutes),
    min: (1),
    max: (1440),
}, ...__VLS_functionalComponentArgsRest(__VLS_409));
var __VLS_407;
const __VLS_412 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_413 = __VLS_asFunctionalComponent(__VLS_412, new __VLS_412({
    label: "描述",
}));
const __VLS_414 = __VLS_413({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_413));
__VLS_415.slots.default;
const __VLS_416 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
    modelValue: (__VLS_ctx.alertRuleForm.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_418 = __VLS_417({
    modelValue: (__VLS_ctx.alertRuleForm.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_417));
var __VLS_415;
var __VLS_331;
{
    const { footer: __VLS_thisSlot } = __VLS_327.slots;
    const __VLS_420 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
        ...{ 'onClick': {} },
    }));
    const __VLS_422 = __VLS_421({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_421));
    let __VLS_424;
    let __VLS_425;
    let __VLS_426;
    const __VLS_427 = {
        onClick: (...[$event]) => {
            __VLS_ctx.alertRuleDialogVisible = false;
        }
    };
    __VLS_423.slots.default;
    var __VLS_423;
    const __VLS_428 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_429 = __VLS_asFunctionalComponent(__VLS_428, new __VLS_428({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_430 = __VLS_429({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_429));
    let __VLS_432;
    let __VLS_433;
    let __VLS_434;
    const __VLS_435 = {
        onClick: (__VLS_ctx.saveAlertRule)
    };
    __VLS_431.slots.default;
    var __VLS_431;
}
var __VLS_327;
/** @type {__VLS_StyleScopedClasses['monitor-dashboard-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-success']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-error']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card-mini']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card-mini']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card-mini']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card-mini']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mini-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-error']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-row']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-container']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['pie-container']} */ ;
/** @type {__VLS_StyleScopedClasses['pie-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-row']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-bar-row']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-name']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-bar-success']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-bar-failed']} */ ;
/** @type {__VLS_StyleScopedClasses['pipe-count']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['run-id']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Refresh: Refresh,
            Plus: Plus,
            hours: hours,
            summary: summary,
            trend: trend,
            recentRuns: recentRuns,
            alerts: alerts,
            pipeStats: pipeStats,
            loadingSummary: loadingSummary,
            loadingTrend: loadingTrend,
            loadingStatus: loadingStatus,
            loadingRecent: loadingRecent,
            loadingAlerts: loadingAlerts,
            loadingPipes: loadingPipes,
            chartW: chartW,
            chartH: chartH,
            marginX: marginX,
            marginY: marginY,
            loadAll: loadAll,
            xPos: xPos,
            yPos: yPos,
            totalLinePoints: totalLinePoints,
            successLinePoints: successLinePoints,
            failedLinePoints: failedLinePoints,
            shortBucket: shortBucket,
            statusColor: statusColor,
            statusList: statusList,
            totalCount: totalCount,
            pieSlices: pieSlices,
            formatMs: formatMs,
            statusTagType: statusTagType,
            failRateClass: failRateClass,
            alertRules: alertRules,
            loadingRules: loadingRules,
            alertRuleDialogVisible: alertRuleDialogVisible,
            editingAlertRule: editingAlertRule,
            alertRuleForm: alertRuleForm,
            ruleTypeLabel: ruleTypeLabel,
            openAlertRuleDialog: openAlertRuleDialog,
            saveAlertRule: saveAlertRule,
            toggleAlertRule: toggleAlertRule,
            deleteAlertRule: deleteAlertRule,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
