/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, RefreshRight, Document, Tickets, View } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import { formatDateTime } from '@/utils/datetime';
import PermissionButton from '@/components/PermissionButton.vue';
const MENU_CODE = 'ucp.executions';
const route = useRoute();
const router = useRouter();
const runId = String(route.params.id);
const detail = ref(null);
const failedItems = ref([]);
const loadingDetail = ref(false);
const loadingFailed = ref(false);
const showFailedPanel = ref(false);
// Phase 2-6: 步骤详情抽屉
const stepDrawer = ref(false);
const activeStep = ref(null);
const stepItems = ref([]);
const loadingStepItems = ref(false);
// Phase 2-6: 执行日志
const logs = ref([]);
const loadingLogs = ref(false);
const showLogsPanel = ref(false);
// Phase 2-6: 视图模式切换：表格 / 时间线
const viewMode = ref('table');
function statusType(s) {
    if (s === 'SUCCESS')
        return 'success';
    if (s === 'FAILED')
        return 'danger';
    if (s === 'PARTIAL_SUCCESS')
        return 'warning';
    if (s === 'RUNNING')
        return '';
    if (s === 'PENDING')
        return 'info';
    return 'info';
}
function statusLabel(s) {
    if (s === 'SUCCESS')
        return '成功';
    if (s === 'FAILED')
        return '失败';
    if (s === 'PARTIAL_SUCCESS')
        return '部分成功';
    if (s === 'RUNNING')
        return '运行中';
    if (s === 'PENDING')
        return '待执行';
    return s;
}
function stepTypeLabel(t) {
    if (t === 'CONNECTOR')
        return '资源拉取';
    if (t === 'CONNECTOR_LOOP')
        return '逐条拉取';
    if (t === 'TRANSFORM')
        return '数据转换';
    if (t === 'NOTIFY')
        return '通知推送';
    return t;
}
function formatDuration(ms) {
    if (ms === null)
        return '—';
    if (ms < 1000)
        return `${ms}ms`;
    if (ms < 60_000)
        return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
function stepStepType(s) {
    if (s === 'SUCCESS')
        return 'success';
    if (s === 'FAILED')
        return 'danger';
    if (s === 'PARTIAL_SUCCESS')
        return 'warning';
    return 'info';
}
// Phase 2-3：PARTIAL 严重度辅助函数
function getPipelineSeverity() {
    if (!detail.value || detail.value.status !== 'PARTIAL_SUCCESS')
        return null;
    const ctx = detail.value.context_summary;
    if (!ctx || !ctx.partial_severity)
        return null;
    return ctx.partial_severity;
}
function getStepSeverity(step) {
    if (step.status !== 'PARTIAL_SUCCESS' || !step.output_snapshot)
        return null;
    return step.output_snapshot.partial_detail || null;
}
function severityTagType(sev) {
    if (sev === 'CRITICAL')
        return 'danger';
    if (sev === 'WARNING')
        return 'warning';
    return 'success';
}
function severityLabel(sev) {
    if (sev === 'CRITICAL')
        return '严重失败';
    if (sev === 'WARNING')
        return '部分失败';
    return '正常';
}
// Phase 2-6: JSON 格式化展示
function prettyJson(obj) {
    if (obj === null || obj === undefined)
        return '—';
    try {
        return JSON.stringify(obj, null, 2);
    }
    catch {
        return String(obj);
    }
}
async function loadDetail() {
    loadingDetail.value = true;
    try {
        const res = await ucpApi.executionDetail(runId);
        // Merge steps into the execution object for template convenience
        detail.value = { ...res.execution, steps: res.steps };
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载执行详情失败');
    }
    finally {
        loadingDetail.value = false;
    }
}
async function loadFailed() {
    if (!showFailedPanel.value)
        return;
    loadingFailed.value = true;
    try {
        const res = await ucpApi.failedItems(runId);
        failedItems.value = res.items;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败项失败');
    }
    finally {
        loadingFailed.value = false;
    }
}
async function loadLogs() {
    if (!showLogsPanel.value)
        return;
    loadingLogs.value = true;
    try {
        const res = await ucpApi.executionLogs(runId, 200);
        logs.value = res.items;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载执行日志失败');
    }
    finally {
        loadingLogs.value = false;
    }
}
async function retryFailed() {
    try {
        await ElMessageBox.confirm(`确认重试 ${failedItems.value.length} 条失败项？\n将按 step 分组重新调用资源。`, '重试失败项', { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    loadingFailed.value = true;
    try {
        const result = await ucpApi.retryFailed(runId);
        const msg = result.message || `成功 ${result.success_count}/${result.total}`;
        if (result.failed_count > 0) {
            ElMessage.warning(`${msg}，仍有 ${result.failed_count} 条失败`);
        }
        else {
            ElMessage.success(msg);
        }
        await loadDetail();
        if (showFailedPanel.value)
            await loadFailed();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '重试失败');
    }
    finally {
        loadingFailed.value = false;
    }
}
const retryingItemId = ref(null);
async function retryItem(item) {
    try {
        await ElMessageBox.confirm(`确认重试失败项 "${item.item_key}"？`, '单项重试', { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    retryingItemId.value = item.id;
    try {
        const result = await ucpApi.retryItem(runId, item.id);
        if (result.status === 'SUCCESS') {
            ElMessage.success(`Item "${item.item_key}" 重试成功`);
        }
        else {
            ElMessage.warning(`重试失败: ${result.error || '未知错误'}`);
        }
        await loadFailed();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '重试失败');
    }
    finally {
        retryingItemId.value = null;
    }
}
async function retryStep(step) {
    try {
        await ElMessageBox.confirm(`确认重试步骤 "${step.step_id}"？\n这将重新执行该步骤（不影响其他步骤）。`, '重试步骤', { type: 'warning', confirmButtonText: '确认重试', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    try {
        const result = await ucpApi.retryStep(runId, step.step_run_id);
        if (result.step.status === 'SUCCESS') {
            ElMessage.success(`步骤重试成功（重试 ${result.step.retry_count} 次）`);
        }
        else if (result.step.status === 'PARTIAL_SUCCESS') {
            ElMessage.warning(`步骤部分成功（重试 ${result.step.retry_count} 次）`);
        }
        else {
            ElMessage.error(`步骤重试仍失败: ${result.step.error_message || '未知错误'}`);
        }
        await loadDetail();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || '步骤重试失败');
    }
}
function toggleFailedPanel() {
    showFailedPanel.value = !showFailedPanel.value;
    if (showFailedPanel.value)
        loadFailed();
}
function toggleLogsPanel() {
    showLogsPanel.value = !showLogsPanel.value;
    if (showLogsPanel.value)
        loadLogs();
}
// Phase 2-6: 打开步骤详情抽屉
async function openStepDetail(step) {
    activeStep.value = step;
    stepDrawer.value = true;
    stepItems.value = [];
    // CONNECTOR_LOOP 步骤才有循环项明细
    if (step.step_type === 'CONNECTOR_LOOP') {
        loadingStepItems.value = true;
        try {
            const res = await ucpApi.stepItems(runId, step.step_run_id, { limit: 200 });
            stepItems.value = res.items;
        }
        catch (e) {
            ElMessage.error(e?.response?.data?.detail || '加载步骤项明细失败');
        }
        finally {
            loadingStepItems.value = false;
        }
    }
}
// 时间线节点颜色
function timelineColor(status) {
    if (status === 'SUCCESS')
        return '#67c23a';
    if (status === 'FAILED')
        return '#f56c6c';
    if (status === 'PARTIAL_SUCCESS')
        return '#e6a23c';
    return '#909399';
}
const totalDuration = computed(() => detail.value?.duration_ms ?? 0);
async function backToList() {
    const target = router.resolve({ name: 'UcpRuns' });
    const failure = await router.replace(target);
    if (failure || router.currentRoute.value.name !== 'UcpRuns') {
        window.location.assign(target.href);
    }
}
onMounted(loadDetail);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingDetail) }, null, null);
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.ArrowLeft),
        size: "small",
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.ArrowLeft),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (__VLS_ctx.backToList)
    };
    __VLS_7.slots.default;
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.runId);
    const __VLS_12 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        onClick: (__VLS_ctx.loadDetail)
    };
    __VLS_15.slots.default;
    const __VLS_20 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ style: {} },
    }));
    const __VLS_22 = __VLS_21({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.RefreshRight;
    /** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
    const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
    var __VLS_23;
    var __VLS_15;
}
if (__VLS_ctx.detail) {
    const __VLS_28 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        column: (4),
        border: true,
        ...{ style: {} },
    }));
    const __VLS_30 = __VLS_29({
        column: (4),
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        label: "Pipeline",
    }));
    const __VLS_34 = __VLS_33({
        label: "Pipeline",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    (__VLS_ctx.detail.pipeline_code);
    var __VLS_35;
    const __VLS_36 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        label: "Template version",
    }));
    const __VLS_38 = __VLS_37({
        label: "Template version",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    (__VLS_ctx.detail.template_version || '-');
    var __VLS_39;
    const __VLS_40 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        label: "Trace ID",
    }));
    const __VLS_42 = __VLS_41({
        label: "Trace ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    (__VLS_ctx.detail.trace_id);
    var __VLS_43;
    const __VLS_44 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        label: "状态",
    }));
    const __VLS_46 = __VLS_45({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_48 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        type: (__VLS_ctx.statusType(__VLS_ctx.detail.status)),
        size: "small",
    }));
    const __VLS_50 = __VLS_49({
        type: (__VLS_ctx.statusType(__VLS_ctx.detail.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (__VLS_ctx.statusLabel(__VLS_ctx.detail.status));
    var __VLS_51;
    if (__VLS_ctx.getPipelineSeverity()) {
        const __VLS_52 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            type: (__VLS_ctx.severityTagType(__VLS_ctx.getPipelineSeverity().severity)),
            size: "small",
            effect: "dark",
        }));
        const __VLS_54 = __VLS_53({
            type: (__VLS_ctx.severityTagType(__VLS_ctx.getPipelineSeverity().severity)),
            size: "small",
            effect: "dark",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        (__VLS_ctx.severityLabel(__VLS_ctx.getPipelineSeverity().severity));
        (__VLS_ctx.getPipelineSeverity().label);
        var __VLS_55;
    }
    var __VLS_47;
    const __VLS_56 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        label: "触发方式",
    }));
    const __VLS_58 = __VLS_57({
        label: "触发方式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    (__VLS_ctx.detail.trigger_type);
    var __VLS_59;
    const __VLS_60 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        label: "开始时间",
    }));
    const __VLS_62 = __VLS_61({
        label: "开始时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.detail.started_at));
    var __VLS_63;
    const __VLS_64 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        label: "结束时间",
    }));
    const __VLS_66 = __VLS_65({
        label: "结束时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.detail.ended_at));
    var __VLS_67;
    const __VLS_68 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        label: "耗时",
    }));
    const __VLS_70 = __VLS_69({
        label: "耗时",
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    (__VLS_ctx.formatDuration(__VLS_ctx.detail.duration_ms));
    var __VLS_71;
    const __VLS_72 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        label: "步骤结果",
    }));
    const __VLS_74 = __VLS_73({
        label: "步骤结果",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    (__VLS_ctx.detail.success_steps);
    (__VLS_ctx.detail.total_steps);
    if (__VLS_ctx.detail.failed_steps) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.detail.failed_steps);
    }
    var __VLS_75;
    var __VLS_31;
    if (__VLS_ctx.detail.source_event) {
        const __VLS_76 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            type: "info",
            closable: (false),
            ...{ style: {} },
        }));
        const __VLS_78 = __VLS_77({
            type: "info",
            closable: (false),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_79.slots;
        }
        const __VLS_80 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_82 = __VLS_81({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        let __VLS_84;
        let __VLS_85;
        let __VLS_86;
        const __VLS_87 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.detail))
                    return;
                if (!(__VLS_ctx.detail.source_event))
                    return;
                __VLS_ctx.router.push(__VLS_ctx.detail.source_event.href);
            }
        };
        __VLS_83.slots.default;
        (__VLS_ctx.detail.source_event.event_type);
        (__VLS_ctx.detail.source_event.event_id);
        var __VLS_83;
        if (__VLS_ctx.detail.source_event.matched_trigger_code) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.detail.source_event.matched_trigger_code);
        }
        var __VLS_79;
    }
    if (__VLS_ctx.getPipelineSeverity() && __VLS_ctx.getPipelineSeverity().severity === 'CRITICAL') {
        const __VLS_88 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            title: "严重部分失败：失败率超过 50%，建议立即检查",
            type: "error",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_90 = __VLS_89({
            title: "严重部分失败：失败率超过 50%，建议立即检查",
            type: "error",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_91.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.getPipelineSeverity().label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (__VLS_ctx.getPipelineSeverity().total_failed);
            (__VLS_ctx.getPipelineSeverity().total);
            if (__VLS_ctx.getPipelineSeverity().step_severities?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                for (const [s, i] of __VLS_getVForSourceType((__VLS_ctx.getPipelineSeverity().step_severities))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        key: (i),
                        ...{ style: {} },
                    });
                    (i + 1);
                    (s.label);
                }
            }
        }
        var __VLS_91;
    }
    else if (__VLS_ctx.getPipelineSeverity()) {
        const __VLS_92 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            title: (`部分成功（${__VLS_ctx.getPipelineSeverity().label}）`),
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_94 = __VLS_93({
            title: (`部分成功（${__VLS_ctx.getPipelineSeverity().label}）`),
            type: "warning",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ style: {} },
    });
    const __VLS_96 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        modelValue: (__VLS_ctx.viewMode),
        size: "small",
    }));
    const __VLS_98 = __VLS_97({
        modelValue: (__VLS_ctx.viewMode),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    const __VLS_100 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        value: "table",
    }));
    const __VLS_102 = __VLS_101({
        value: "table",
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    var __VLS_103;
    const __VLS_104 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        value: "timeline",
    }));
    const __VLS_106 = __VLS_105({
        value: "timeline",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    var __VLS_107;
    var __VLS_99;
    if (__VLS_ctx.viewMode === 'table') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_108 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            data: (__VLS_ctx.detail.steps),
            stripe: true,
            ...{ style: {} },
            maxHeight: "400",
        }));
        const __VLS_110 = __VLS_109({
            data: (__VLS_ctx.detail.steps),
            stripe: true,
            ...{ style: {} },
            maxHeight: "400",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        __VLS_111.slots.default;
        const __VLS_112 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            label: "步骤 ID",
            minWidth: "160",
            prop: "step_id",
        }));
        const __VLS_114 = __VLS_113({
            label: "步骤 ID",
            minWidth: "160",
            prop: "step_id",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        const __VLS_116 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            label: "类型",
            width: "120",
        }));
        const __VLS_118 = __VLS_117({
            label: "类型",
            width: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_119.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_120 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
                size: "small",
                effect: "plain",
            }));
            const __VLS_122 = __VLS_121({
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_121));
            __VLS_123.slots.default;
            (__VLS_ctx.stepTypeLabel(row.step_type));
            var __VLS_123;
        }
        var __VLS_119;
        const __VLS_124 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            label: "资源",
            minWidth: "140",
            prop: "resource_code",
            showOverflowTooltip: true,
        }));
        const __VLS_126 = __VLS_125({
            label: "资源",
            minWidth: "140",
            prop: "resource_code",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_127.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.resource_code || '—');
        }
        var __VLS_127;
        const __VLS_128 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            label: "状态",
            width: "170",
        }));
        const __VLS_130 = __VLS_129({
            label: "状态",
            width: "170",
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        __VLS_131.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_131.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_132 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                type: (__VLS_ctx.stepStepType(row.status)),
                size: "small",
            }));
            const __VLS_134 = __VLS_133({
                type: (__VLS_ctx.stepStepType(row.status)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            __VLS_135.slots.default;
            (row.status);
            var __VLS_135;
            if (__VLS_ctx.getStepSeverity(row)) {
                const __VLS_136 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                    type: (__VLS_ctx.severityTagType(__VLS_ctx.getStepSeverity(row).severity)),
                    size: "small",
                    effect: "dark",
                    ...{ style: {} },
                }));
                const __VLS_138 = __VLS_137({
                    type: (__VLS_ctx.severityTagType(__VLS_ctx.getStepSeverity(row).severity)),
                    size: "small",
                    effect: "dark",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_137));
                __VLS_139.slots.default;
                (__VLS_ctx.getStepSeverity(row).label);
                var __VLS_139;
            }
        }
        var __VLS_131;
        const __VLS_140 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            label: "条目",
            width: "110",
        }));
        const __VLS_142 = __VLS_141({
            label: "条目",
            width: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_143.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.total_items) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (row.success_items);
                (row.total_items);
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            }
        }
        var __VLS_143;
        const __VLS_144 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            label: "耗时",
            width: "90",
        }));
        const __VLS_146 = __VLS_145({
            label: "耗时",
            width: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        __VLS_147.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_147.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.formatDuration(row.duration_ms));
        }
        var __VLS_147;
        const __VLS_148 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            label: "重试",
            width: "70",
            prop: "retry_count",
        }));
        const __VLS_150 = __VLS_149({
            label: "重试",
            width: "70",
            prop: "retry_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        const __VLS_152 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            label: "操作",
            width: "200",
            fixed: "right",
        }));
        const __VLS_154 = __VLS_153({
            label: "操作",
            width: "200",
            fixed: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_155.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_156 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
                link: true,
            }));
            const __VLS_158 = __VLS_157({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_157));
            let __VLS_160;
            let __VLS_161;
            let __VLS_162;
            const __VLS_163 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.detail))
                        return;
                    if (!(__VLS_ctx.viewMode === 'table'))
                        return;
                    __VLS_ctx.openStepDetail(row);
                }
            };
            __VLS_159.slots.default;
            const __VLS_164 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                ...{ style: {} },
            }));
            const __VLS_166 = __VLS_165({
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_165));
            __VLS_167.slots.default;
            const __VLS_168 = {}.View;
            /** @type {[typeof __VLS_components.View, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({}));
            const __VLS_170 = __VLS_169({}, ...__VLS_functionalComponentArgsRest(__VLS_169));
            var __VLS_167;
            var __VLS_159;
            if (row.status === 'FAILED' || row.status === 'PARTIAL_SUCCESS') {
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_172 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: (__VLS_ctx.MENU_CODE),
                    op: "U",
                    type: "warning",
                    size: "small",
                    link: true,
                }));
                const __VLS_173 = __VLS_172({
                    ...{ 'onClick': {} },
                    menu: (__VLS_ctx.MENU_CODE),
                    op: "U",
                    type: "warning",
                    size: "small",
                    link: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_172));
                let __VLS_175;
                let __VLS_176;
                let __VLS_177;
                const __VLS_178 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.detail))
                            return;
                        if (!(__VLS_ctx.viewMode === 'table'))
                            return;
                        if (!(row.status === 'FAILED' || row.status === 'PARTIAL_SUCCESS'))
                            return;
                        __VLS_ctx.retryStep(row);
                    }
                };
                __VLS_174.slots.default;
                const __VLS_179 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({
                    ...{ style: {} },
                }));
                const __VLS_181 = __VLS_180({
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_180));
                __VLS_182.slots.default;
                const __VLS_183 = {}.RefreshRight;
                /** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
                // @ts-ignore
                const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({}));
                const __VLS_185 = __VLS_184({}, ...__VLS_functionalComponentArgsRest(__VLS_184));
                var __VLS_182;
                var __VLS_174;
            }
        }
        var __VLS_155;
        var __VLS_111;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_187 = {}.ElTimeline;
        /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
        // @ts-ignore
        const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({}));
        const __VLS_189 = __VLS_188({}, ...__VLS_functionalComponentArgsRest(__VLS_188));
        __VLS_190.slots.default;
        for (const [step] of __VLS_getVForSourceType((__VLS_ctx.detail.steps))) {
            const __VLS_191 = {}.ElTimelineItem;
            /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
            // @ts-ignore
            const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
                key: (step.step_run_id),
                timestamp: (__VLS_ctx.formatDateTime(step.started_at)),
                placement: "top",
                color: (__VLS_ctx.timelineColor(step.status)),
            }));
            const __VLS_193 = __VLS_192({
                key: (step.step_run_id),
                timestamp: (__VLS_ctx.formatDateTime(step.started_at)),
                placement: "top",
                color: (__VLS_ctx.timelineColor(step.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_192));
            __VLS_194.slots.default;
            const __VLS_195 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
                ...{ 'onClick': {} },
                shadow: "hover",
                ...{ style: {} },
            }));
            const __VLS_197 = __VLS_196({
                ...{ 'onClick': {} },
                shadow: "hover",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_196));
            let __VLS_199;
            let __VLS_200;
            let __VLS_201;
            const __VLS_202 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.detail))
                        return;
                    if (!!(__VLS_ctx.viewMode === 'table'))
                        return;
                    __VLS_ctx.openStepDetail(step);
                }
            };
            __VLS_198.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            const __VLS_203 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
                type: (__VLS_ctx.stepStepType(step.status)),
                size: "small",
            }));
            const __VLS_205 = __VLS_204({
                type: (__VLS_ctx.stepStepType(step.status)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_204));
            __VLS_206.slots.default;
            (step.status);
            var __VLS_206;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (step.step_id);
            const __VLS_207 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
                size: "small",
                effect: "plain",
                ...{ style: {} },
            }));
            const __VLS_209 = __VLS_208({
                size: "small",
                effect: "plain",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_208));
            __VLS_210.slots.default;
            (__VLS_ctx.stepTypeLabel(step.step_type));
            var __VLS_210;
            if (step.resource_code) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (step.resource_code);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            if (step.total_items) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (step.success_items);
                (step.total_items);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatDuration(step.duration_ms));
            if (step.retry_count > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (step.retry_count);
            }
            if (step.error_message) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                (step.error_message);
            }
            var __VLS_198;
            var __VLS_194;
        }
        var __VLS_190;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ style: {} },
    });
    const __VLS_211 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
        ...{ style: {} },
    }));
    const __VLS_213 = __VLS_212({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_212));
    __VLS_214.slots.default;
    const __VLS_215 = {}.Tickets;
    /** @type {[typeof __VLS_components.Tickets, ]} */ ;
    // @ts-ignore
    const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({}));
    const __VLS_217 = __VLS_216({}, ...__VLS_functionalComponentArgsRest(__VLS_216));
    var __VLS_214;
    const __VLS_219 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_221 = __VLS_220({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_220));
    let __VLS_223;
    let __VLS_224;
    let __VLS_225;
    const __VLS_226 = {
        onClick: (__VLS_ctx.toggleLogsPanel)
    };
    __VLS_222.slots.default;
    (__VLS_ctx.showLogsPanel ? '收起' : '展开');
    var __VLS_222;
    if (__VLS_ctx.showLogsPanel) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_227 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
            data: (__VLS_ctx.logs),
            stripe: true,
            ...{ style: {} },
            maxHeight: "320",
        }));
        const __VLS_229 = __VLS_228({
            data: (__VLS_ctx.logs),
            stripe: true,
            ...{ style: {} },
            maxHeight: "320",
        }, ...__VLS_functionalComponentArgsRest(__VLS_228));
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingLogs) }, null, null);
        __VLS_230.slots.default;
        const __VLS_231 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
            label: "时间",
            width: "170",
        }));
        const __VLS_233 = __VLS_232({
            label: "时间",
            width: "170",
        }, ...__VLS_functionalComponentArgsRest(__VLS_232));
        __VLS_234.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_234.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.formatDateTime(row.created_at));
        }
        var __VLS_234;
        const __VLS_235 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
            label: "资源",
            minWidth: "140",
            prop: "resource_code",
            showOverflowTooltip: true,
        }));
        const __VLS_237 = __VLS_236({
            label: "资源",
            minWidth: "140",
            prop: "resource_code",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_236));
        __VLS_238.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_238.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.resource_code || row.executor);
        }
        var __VLS_238;
        const __VLS_239 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
            label: "触发",
            width: "120",
            prop: "trigger_type",
        }));
        const __VLS_241 = __VLS_240({
            label: "触发",
            width: "120",
            prop: "trigger_type",
        }, ...__VLS_functionalComponentArgsRest(__VLS_240));
        const __VLS_243 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
            label: "状态",
            width: "100",
        }));
        const __VLS_245 = __VLS_244({
            label: "状态",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_244));
        __VLS_246.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_246.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_247 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
                type: (__VLS_ctx.stepStepType(row.status)),
                size: "small",
            }));
            const __VLS_249 = __VLS_248({
                type: (__VLS_ctx.stepStepType(row.status)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_248));
            __VLS_250.slots.default;
            (row.status);
            var __VLS_250;
        }
        var __VLS_246;
        const __VLS_251 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
            label: "记录数",
            width: "90",
        }));
        const __VLS_253 = __VLS_252({
            label: "记录数",
            width: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_252));
        __VLS_254.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_254.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.record_count ?? '—');
        }
        var __VLS_254;
        const __VLS_255 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
            label: "耗时",
            width: "90",
        }));
        const __VLS_257 = __VLS_256({
            label: "耗时",
            width: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_256));
        __VLS_258.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_258.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.formatDuration(row.duration_ms));
        }
        var __VLS_258;
        const __VLS_259 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
            label: "错误信息",
            minWidth: "240",
            showOverflowTooltip: true,
        }));
        const __VLS_261 = __VLS_260({
            label: "错误信息",
            minWidth: "240",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_260));
        __VLS_262.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_262.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.error_message) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (row.error_message);
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            }
        }
        var __VLS_262;
        var __VLS_230;
    }
    if (__VLS_ctx.detail.status === 'PARTIAL_SUCCESS' || __VLS_ctx.detail.status === 'FAILED') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_263 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.MENU_CODE),
            op: "U",
            type: "warning",
            size: "small",
        }));
        const __VLS_264 = __VLS_263({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.MENU_CODE),
            op: "U",
            type: "warning",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_263));
        let __VLS_266;
        let __VLS_267;
        let __VLS_268;
        const __VLS_269 = {
            onClick: (__VLS_ctx.retryFailed)
        };
        __VLS_265.slots.default;
        const __VLS_270 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
            ...{ style: {} },
        }));
        const __VLS_272 = __VLS_271({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_271));
        __VLS_273.slots.default;
        const __VLS_274 = {}.RefreshRight;
        /** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
        // @ts-ignore
        const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({}));
        const __VLS_276 = __VLS_275({}, ...__VLS_functionalComponentArgsRest(__VLS_275));
        var __VLS_273;
        var __VLS_265;
        const __VLS_278 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_280 = __VLS_279({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_279));
        let __VLS_282;
        let __VLS_283;
        let __VLS_284;
        const __VLS_285 = {
            onClick: (__VLS_ctx.toggleFailedPanel)
        };
        __VLS_281.slots.default;
        (__VLS_ctx.showFailedPanel ? '收起' : '展开');
        var __VLS_281;
        if (__VLS_ctx.showFailedPanel) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_286 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
                data: (__VLS_ctx.failedItems),
                stripe: true,
                ...{ style: {} },
                maxHeight: "300",
            }));
            const __VLS_288 = __VLS_287({
                data: (__VLS_ctx.failedItems),
                stripe: true,
                ...{ style: {} },
                maxHeight: "300",
            }, ...__VLS_functionalComponentArgsRest(__VLS_287));
            __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingFailed) }, null, null);
            __VLS_289.slots.default;
            const __VLS_290 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
                label: "Item Key",
                minWidth: "180",
                prop: "item_key",
                showOverflowTooltip: true,
            }));
            const __VLS_292 = __VLS_291({
                label: "Item Key",
                minWidth: "180",
                prop: "item_key",
                showOverflowTooltip: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_291));
            const __VLS_294 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
                label: "资源",
                minWidth: "160",
                prop: "resource_code",
            }));
            const __VLS_296 = __VLS_295({
                label: "资源",
                minWidth: "160",
                prop: "resource_code",
            }, ...__VLS_functionalComponentArgsRest(__VLS_295));
            const __VLS_298 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
                label: "状态",
                width: "120",
                prop: "status",
            }));
            const __VLS_300 = __VLS_299({
                label: "状态",
                width: "120",
                prop: "status",
            }, ...__VLS_functionalComponentArgsRest(__VLS_299));
            const __VLS_302 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
                label: "错误码",
                minWidth: "140",
                prop: "error_code",
                showOverflowTooltip: true,
            }));
            const __VLS_304 = __VLS_303({
                label: "错误码",
                minWidth: "140",
                prop: "error_code",
                showOverflowTooltip: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_303));
            const __VLS_306 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
                label: "可重试",
                width: "80",
            }));
            const __VLS_308 = __VLS_307({
                label: "可重试",
                width: "80",
            }, ...__VLS_functionalComponentArgsRest(__VLS_307));
            __VLS_309.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_309.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_310 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
                    type: (row.is_retryable ? 'success' : 'danger'),
                    size: "small",
                }));
                const __VLS_312 = __VLS_311({
                    type: (row.is_retryable ? 'success' : 'danger'),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_311));
                __VLS_313.slots.default;
                (row.is_retryable ? '是' : '否');
                var __VLS_313;
            }
            var __VLS_309;
            const __VLS_314 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
                label: "操作",
                width: "80",
                fixed: "right",
            }));
            const __VLS_316 = __VLS_315({
                label: "操作",
                width: "80",
                fixed: "right",
            }, ...__VLS_functionalComponentArgsRest(__VLS_315));
            __VLS_317.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_317.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                if (row.is_retryable) {
                    const __VLS_318 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
                        ...{ 'onClick': {} },
                        size: "small",
                        link: true,
                        type: "warning",
                        loading: (__VLS_ctx.retryingItemId === row.id),
                    }));
                    const __VLS_320 = __VLS_319({
                        ...{ 'onClick': {} },
                        size: "small",
                        link: true,
                        type: "warning",
                        loading: (__VLS_ctx.retryingItemId === row.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_319));
                    let __VLS_322;
                    let __VLS_323;
                    let __VLS_324;
                    const __VLS_325 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.detail))
                                return;
                            if (!(__VLS_ctx.detail.status === 'PARTIAL_SUCCESS' || __VLS_ctx.detail.status === 'FAILED'))
                                return;
                            if (!(__VLS_ctx.showFailedPanel))
                                return;
                            if (!(row.is_retryable))
                                return;
                            __VLS_ctx.retryItem(row);
                        }
                    };
                    __VLS_321.slots.default;
                    var __VLS_321;
                }
            }
            var __VLS_317;
            var __VLS_289;
        }
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
var __VLS_3;
const __VLS_326 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
    modelValue: (__VLS_ctx.stepDrawer),
    title: (`步骤详情: ${__VLS_ctx.activeStep?.step_id ?? ''}`),
    size: "60%",
}));
const __VLS_328 = __VLS_327({
    modelValue: (__VLS_ctx.stepDrawer),
    title: (`步骤详情: ${__VLS_ctx.activeStep?.step_id ?? ''}`),
    size: "60%",
}, ...__VLS_functionalComponentArgsRest(__VLS_327));
__VLS_329.slots.default;
if (__VLS_ctx.activeStep) {
    const __VLS_330 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_331 = __VLS_asFunctionalComponent(__VLS_330, new __VLS_330({
        column: (2),
        border: true,
        ...{ style: {} },
    }));
    const __VLS_332 = __VLS_331({
        column: (2),
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_331));
    __VLS_333.slots.default;
    const __VLS_334 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
        label: "步骤类型",
    }));
    const __VLS_336 = __VLS_335({
        label: "步骤类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_335));
    __VLS_337.slots.default;
    (__VLS_ctx.stepTypeLabel(__VLS_ctx.activeStep.step_type));
    var __VLS_337;
    const __VLS_338 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
        label: "资源",
    }));
    const __VLS_340 = __VLS_339({
        label: "资源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_339));
    __VLS_341.slots.default;
    (__VLS_ctx.activeStep.resource_code || '—');
    var __VLS_341;
    const __VLS_342 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
        label: "状态",
    }));
    const __VLS_344 = __VLS_343({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_343));
    __VLS_345.slots.default;
    const __VLS_346 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
        type: (__VLS_ctx.stepStepType(__VLS_ctx.activeStep.status)),
        size: "small",
    }));
    const __VLS_348 = __VLS_347({
        type: (__VLS_ctx.stepStepType(__VLS_ctx.activeStep.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_347));
    __VLS_349.slots.default;
    (__VLS_ctx.activeStep.status);
    var __VLS_349;
    var __VLS_345;
    const __VLS_350 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
        label: "重试次数",
    }));
    const __VLS_352 = __VLS_351({
        label: "重试次数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_351));
    __VLS_353.slots.default;
    (__VLS_ctx.activeStep.retry_count);
    var __VLS_353;
    const __VLS_354 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
        label: "开始",
    }));
    const __VLS_356 = __VLS_355({
        label: "开始",
    }, ...__VLS_functionalComponentArgsRest(__VLS_355));
    __VLS_357.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.activeStep.started_at));
    var __VLS_357;
    const __VLS_358 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_359 = __VLS_asFunctionalComponent(__VLS_358, new __VLS_358({
        label: "结束",
    }));
    const __VLS_360 = __VLS_359({
        label: "结束",
    }, ...__VLS_functionalComponentArgsRest(__VLS_359));
    __VLS_361.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.activeStep.ended_at));
    var __VLS_361;
    const __VLS_362 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
        label: "耗时",
    }));
    const __VLS_364 = __VLS_363({
        label: "耗时",
    }, ...__VLS_functionalComponentArgsRest(__VLS_363));
    __VLS_365.slots.default;
    (__VLS_ctx.formatDuration(__VLS_ctx.activeStep.duration_ms));
    var __VLS_365;
    const __VLS_366 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_367 = __VLS_asFunctionalComponent(__VLS_366, new __VLS_366({
        label: "条目",
    }));
    const __VLS_368 = __VLS_367({
        label: "条目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_367));
    __VLS_369.slots.default;
    if (__VLS_ctx.activeStep.total_items) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.activeStep.success_items);
        (__VLS_ctx.activeStep.total_items);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_369;
    var __VLS_333;
    if (__VLS_ctx.activeStep.error_message) {
        const __VLS_370 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_371 = __VLS_asFunctionalComponent(__VLS_370, new __VLS_370({
            title: "步骤错误信息",
            type: "error",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_372 = __VLS_371({
            title: "步骤错误信息",
            type: "error",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_371));
        __VLS_373.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
            ...{ style: {} },
        });
        (__VLS_ctx.activeStep.error_message);
        var __VLS_373;
    }
    const __VLS_374 = {}.ElCollapse;
    /** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
    // @ts-ignore
    const __VLS_375 = __VLS_asFunctionalComponent(__VLS_374, new __VLS_374({
        ...{ style: {} },
    }));
    const __VLS_376 = __VLS_375({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_375));
    __VLS_377.slots.default;
    const __VLS_378 = {}.ElCollapseItem;
    /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
    // @ts-ignore
    const __VLS_379 = __VLS_asFunctionalComponent(__VLS_378, new __VLS_378({
        title: "输入定义（数据血缘）",
        name: "input",
    }));
    const __VLS_380 = __VLS_379({
        title: "输入定义（数据血缘）",
        name: "input",
    }, ...__VLS_functionalComponentArgsRest(__VLS_379));
    __VLS_381.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ style: {} },
    });
    (__VLS_ctx.prettyJson(__VLS_ctx.activeStep.input_snapshot));
    var __VLS_381;
    const __VLS_382 = {}.ElCollapseItem;
    /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
    // @ts-ignore
    const __VLS_383 = __VLS_asFunctionalComponent(__VLS_382, new __VLS_382({
        title: "输出快照（脱敏样本）",
        name: "output",
    }));
    const __VLS_384 = __VLS_383({
        title: "输出快照（脱敏样本）",
        name: "output",
    }, ...__VLS_functionalComponentArgsRest(__VLS_383));
    __VLS_385.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ style: {} },
    });
    (__VLS_ctx.prettyJson(__VLS_ctx.activeStep.output_snapshot));
    var __VLS_385;
    var __VLS_377;
    if (__VLS_ctx.activeStep.step_type === 'CONNECTOR_LOOP') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ style: {} },
        });
        const __VLS_386 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_387 = __VLS_asFunctionalComponent(__VLS_386, new __VLS_386({
            ...{ style: {} },
        }));
        const __VLS_388 = __VLS_387({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_387));
        __VLS_389.slots.default;
        const __VLS_390 = {}.Document;
        /** @type {[typeof __VLS_components.Document, ]} */ ;
        // @ts-ignore
        const __VLS_391 = __VLS_asFunctionalComponent(__VLS_390, new __VLS_390({}));
        const __VLS_392 = __VLS_391({}, ...__VLS_functionalComponentArgsRest(__VLS_391));
        var __VLS_389;
        const __VLS_394 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_395 = __VLS_asFunctionalComponent(__VLS_394, new __VLS_394({
            data: (__VLS_ctx.stepItems),
            stripe: true,
            ...{ style: {} },
            maxHeight: "400",
        }));
        const __VLS_396 = __VLS_395({
            data: (__VLS_ctx.stepItems),
            stripe: true,
            ...{ style: {} },
            maxHeight: "400",
        }, ...__VLS_functionalComponentArgsRest(__VLS_395));
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingStepItems) }, null, null);
        __VLS_397.slots.default;
        const __VLS_398 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_399 = __VLS_asFunctionalComponent(__VLS_398, new __VLS_398({
            label: "Item Key",
            minWidth: "160",
            prop: "item_key",
            showOverflowTooltip: true,
        }));
        const __VLS_400 = __VLS_399({
            label: "Item Key",
            minWidth: "160",
            prop: "item_key",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_399));
        const __VLS_402 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_403 = __VLS_asFunctionalComponent(__VLS_402, new __VLS_402({
            label: "状态",
            width: "120",
        }));
        const __VLS_404 = __VLS_403({
            label: "状态",
            width: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_403));
        __VLS_405.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_405.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_406 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_407 = __VLS_asFunctionalComponent(__VLS_406, new __VLS_406({
                type: (__VLS_ctx.stepStepType(row.status)),
                size: "small",
            }));
            const __VLS_408 = __VLS_407({
                type: (__VLS_ctx.stepStepType(row.status)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_407));
            __VLS_409.slots.default;
            (row.status);
            var __VLS_409;
        }
        var __VLS_405;
        const __VLS_410 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_411 = __VLS_asFunctionalComponent(__VLS_410, new __VLS_410({
            label: "错误码",
            minWidth: "140",
            prop: "error_code",
            showOverflowTooltip: true,
        }));
        const __VLS_412 = __VLS_411({
            label: "错误码",
            minWidth: "140",
            prop: "error_code",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_411));
        const __VLS_414 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_415 = __VLS_asFunctionalComponent(__VLS_414, new __VLS_414({
            label: "重试",
            width: "70",
            prop: "retry_count",
        }));
        const __VLS_416 = __VLS_415({
            label: "重试",
            width: "70",
            prop: "retry_count",
        }, ...__VLS_functionalComponentArgsRest(__VLS_415));
        const __VLS_418 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_419 = __VLS_asFunctionalComponent(__VLS_418, new __VLS_418({
            label: "可重试",
            width: "80",
        }));
        const __VLS_420 = __VLS_419({
            label: "可重试",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_419));
        __VLS_421.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_421.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_422 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_423 = __VLS_asFunctionalComponent(__VLS_422, new __VLS_422({
                type: (row.is_retryable ? 'success' : 'danger'),
                size: "small",
            }));
            const __VLS_424 = __VLS_423({
                type: (row.is_retryable ? 'success' : 'danger'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_423));
            __VLS_425.slots.default;
            (row.is_retryable ? '是' : '否');
            var __VLS_425;
        }
        var __VLS_421;
        var __VLS_397;
    }
}
var __VLS_329;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            RefreshRight: RefreshRight,
            Document: Document,
            Tickets: Tickets,
            View: View,
            formatDateTime: formatDateTime,
            PermissionButton: PermissionButton,
            MENU_CODE: MENU_CODE,
            router: router,
            runId: runId,
            detail: detail,
            failedItems: failedItems,
            loadingDetail: loadingDetail,
            loadingFailed: loadingFailed,
            showFailedPanel: showFailedPanel,
            stepDrawer: stepDrawer,
            activeStep: activeStep,
            stepItems: stepItems,
            loadingStepItems: loadingStepItems,
            logs: logs,
            loadingLogs: loadingLogs,
            showLogsPanel: showLogsPanel,
            viewMode: viewMode,
            statusType: statusType,
            statusLabel: statusLabel,
            stepTypeLabel: stepTypeLabel,
            formatDuration: formatDuration,
            stepStepType: stepStepType,
            getPipelineSeverity: getPipelineSeverity,
            getStepSeverity: getStepSeverity,
            severityTagType: severityTagType,
            severityLabel: severityLabel,
            prettyJson: prettyJson,
            loadDetail: loadDetail,
            retryFailed: retryFailed,
            retryingItemId: retryingItemId,
            retryItem: retryItem,
            retryStep: retryStep,
            toggleFailedPanel: toggleFailedPanel,
            toggleLogsPanel: toggleLogsPanel,
            openStepDetail: openStepDetail,
            timelineColor: timelineColor,
            backToList: backToList,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
