/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref, watch } from 'vue';
import MonitorDashboardView from '../MonitorDashboardView.vue';
import PipelineExecList from '../PipelineExecList.vue';
import ExternalAccountListView from '../ExternalAccountListView.vue';
import ApprovalInboxView from '../ApprovalInboxView.vue';
import OaSyncView from '../OaSyncView.vue';
import CircuitBreakerStatus from '../CircuitBreakerStatus.vue';
import WarehouseIngestBatchList from '../WarehouseIngestBatchList.vue';
import { monitorApi, ucpApi } from '@/api/ucp';
const __VLS_props = defineProps();
const subTab = ref('monitor');
/* ── 顶部 KPI 统计 ── */
const kpi = ref({
    pipelineTotal: 0,
    pipelineSuccess: 0,
    pipelineFailed: 0,
    pipelinePartial: 0,
    pipelineRunning: 0,
    failRate: 0,
    successRate: 0,
    avgDurationMs: 0,
    alertCount: 0,
});
/* ── Phase 5-3: system / resource 过滤 ── */
const systems = ref([]);
const allResources = ref([]);
const filterSystemId = ref(null);
const filterResourceId = ref(null);
async function loadSystemsAndResources() {
    try {
        const [sysRes, resRes] = await Promise.all([
            ucpApi.systems(),
            ucpApi.resources({}),
        ]);
        systems.value = sysRes.items || [];
        allResources.value = resRes.items || [];
    }
    catch {
        // 静默
    }
}
function resourcesOf(systemId) {
    if (!systemId)
        return [];
    return allResources.value.filter((r) => r.system_id === systemId);
}
function onSystemFilterChange() {
    filterResourceId.value = null;
}
function clearFilter() {
    filterSystemId.value = null;
    filterResourceId.value = null;
}
async function loadKpi() {
    try {
        const params = { hours: 24 };
        if (filterResourceId.value)
            params.resource_id = filterResourceId.value;
        else if (filterSystemId.value)
            params.system_id = filterSystemId.value;
        const [summary, alerts] = await Promise.all([
            monitorApi.summaryRaw(params).catch(() => null),
            monitorApi.alertsRaw(50, params).catch(() => []),
        ]);
        if (summary) {
            kpi.value.pipelineTotal = summary.pipeline_total || 0;
            kpi.value.pipelineSuccess = summary.pipeline_success || 0;
            kpi.value.pipelineFailed = summary.pipeline_failed || 0;
            kpi.value.pipelinePartial = summary.pipeline_partial || 0;
            kpi.value.pipelineRunning = summary.pipeline_running || 0;
            kpi.value.failRate = summary.fail_rate ? Number((summary.fail_rate * 100).toFixed(1)) : 0;
            kpi.value.successRate = kpi.value.pipelineTotal > 0
                ? Number(((kpi.value.pipelineSuccess / kpi.value.pipelineTotal) * 100).toFixed(1))
                : 0;
            kpi.value.avgDurationMs = summary.avg_duration_ms || 0;
        }
        kpi.value.alertCount = alerts.length;
    }
    catch (_e) {
    }
}
watch([filterSystemId, filterResourceId], () => {
    loadKpi();
});
onMounted(() => {
    loadKpi();
    loadSystemsAndResources();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['monitor-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['monitor-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['monitor-tab']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "monitor-tab" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-success" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.kpi.successRate);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "pct" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
(__VLS_ctx.kpi.pipelineTotal);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-fail" },
    ...{ class: ({ 'kpi-warn': __VLS_ctx.kpi.failRate > 5 }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.kpi.failRate);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "pct" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
(__VLS_ctx.kpi.pipelineFailed);
(__VLS_ctx.kpi.pipelinePartial);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-running" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.kpi.pipelineRunning);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-alert" },
    ...{ class: ({ 'kpi-warn': __VLS_ctx.kpi.alertCount > 0 }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.kpi.alertCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-row" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterSystemId),
    placeholder: "按业务系统过滤",
    clearable: true,
    filterable: true,
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterSystemId),
    placeholder: "按业务系统过滤",
    clearable: true,
    filterable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.onSystemFilterChange)
};
__VLS_3.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (s.id),
        label: (`${s.system_name} (${s.system_code})`),
        value: (s.id),
    }));
    const __VLS_10 = __VLS_9({
        key: (s.id),
        label: (`${s.system_name} (${s.system_code})`),
        value: (s.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_3;
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.filterResourceId),
    placeholder: "按数据资源过滤",
    clearable: true,
    filterable: true,
    disabled: (!__VLS_ctx.filterSystemId),
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.filterResourceId),
    placeholder: "按数据资源过滤",
    clearable: true,
    filterable: true,
    disabled: (!__VLS_ctx.filterSystemId),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
for (const [r] of __VLS_getVForSourceType((__VLS_ctx.resourcesOf(__VLS_ctx.filterSystemId)))) {
    const __VLS_16 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        key: (r.id),
        label: (`${r.resource_name} (${r.resource_code})`),
        value: (r.id),
    }));
    const __VLS_18 = __VLS_17({
        key: (r.id),
        label: (`${r.resource_name} (${r.resource_code})`),
        value: (r.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
var __VLS_15;
if (__VLS_ctx.filterSystemId || __VLS_ctx.filterResourceId) {
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (__VLS_ctx.clearFilter)
    };
    __VLS_23.slots.default;
    var __VLS_23;
}
if (__VLS_ctx.filterSystemId || __VLS_ctx.filterResourceId) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "filter-hint" },
    });
    if (__VLS_ctx.filterResourceId) {
        (__VLS_ctx.filterResourceId);
    }
    else if (__VLS_ctx.filterSystemId) {
        (__VLS_ctx.filterSystemId);
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sub-tabs" },
});
const __VLS_28 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.subTab),
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.subTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "Circuit & Rate Limits",
    name: "circuits",
}));
const __VLS_34 = __VLS_33({
    label: "Circuit & Rate Limits",
    name: "circuits",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "运行监控",
    name: "monitor",
}));
const __VLS_38 = __VLS_37({
    label: "运行监控",
    name: "monitor",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "执行历史",
    name: "executions",
}));
const __VLS_42 = __VLS_41({
    label: "执行历史",
    name: "executions",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "外部账号",
    name: "external",
}));
const __VLS_46 = __VLS_45({
    label: "外部账号",
    name: "external",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
const __VLS_48 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "审批工作台",
    name: "approvals",
}));
const __VLS_50 = __VLS_49({
    label: "审批工作台",
    name: "approvals",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
const __VLS_52 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "OA 同步",
    name: "oa",
}));
const __VLS_54 = __VLS_53({
    label: "OA 同步",
    name: "oa",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
const __VLS_56 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "入仓批次",
    name: "batches",
}));
const __VLS_58 = __VLS_57({
    label: "入仓批次",
    name: "batches",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
var __VLS_31;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "sub-content" },
});
if (__VLS_ctx.subTab === 'monitor') {
    /** @type {[typeof MonitorDashboardView, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(MonitorDashboardView, new MonitorDashboardView({
        systemCode: (__VLS_ctx.currentSystemCode),
        systemId: (__VLS_ctx.filterSystemId),
        resourceId: (__VLS_ctx.filterResourceId),
    }));
    const __VLS_61 = __VLS_60({
        systemCode: (__VLS_ctx.currentSystemCode),
        systemId: (__VLS_ctx.filterSystemId),
        resourceId: (__VLS_ctx.filterResourceId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
}
else if (__VLS_ctx.subTab === 'executions') {
    /** @type {[typeof PipelineExecList, ]} */ ;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent(PipelineExecList, new PipelineExecList({}));
    const __VLS_64 = __VLS_63({}, ...__VLS_functionalComponentArgsRest(__VLS_63));
}
else if (__VLS_ctx.subTab === 'external') {
    /** @type {[typeof ExternalAccountListView, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(ExternalAccountListView, new ExternalAccountListView({}));
    const __VLS_67 = __VLS_66({}, ...__VLS_functionalComponentArgsRest(__VLS_66));
}
else if (__VLS_ctx.subTab === 'approvals') {
    /** @type {[typeof ApprovalInboxView, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(ApprovalInboxView, new ApprovalInboxView({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
}
else if (__VLS_ctx.subTab === 'oa') {
    /** @type {[typeof OaSyncView, ]} */ ;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent(OaSyncView, new OaSyncView({}));
    const __VLS_73 = __VLS_72({}, ...__VLS_functionalComponentArgsRest(__VLS_72));
}
else if (__VLS_ctx.subTab === 'circuits') {
    /** @type {[typeof CircuitBreakerStatus, ]} */ ;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent(CircuitBreakerStatus, new CircuitBreakerStatus({}));
    const __VLS_76 = __VLS_75({}, ...__VLS_functionalComponentArgsRest(__VLS_75));
}
else if (__VLS_ctx.subTab === 'batches') {
    /** @type {[typeof WarehouseIngestBatchList, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(WarehouseIngestBatchList, new WarehouseIngestBatchList({
        resourceId: (__VLS_ctx.filterResourceId),
    }));
    const __VLS_79 = __VLS_78({
        resourceId: (__VLS_ctx.filterResourceId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
}
/** @type {__VLS_StyleScopedClasses['monitor-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-success']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['pct']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-fail']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['pct']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-running']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-row']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MonitorDashboardView: MonitorDashboardView,
            PipelineExecList: PipelineExecList,
            ExternalAccountListView: ExternalAccountListView,
            ApprovalInboxView: ApprovalInboxView,
            OaSyncView: OaSyncView,
            CircuitBreakerStatus: CircuitBreakerStatus,
            WarehouseIngestBatchList: WarehouseIngestBatchList,
            subTab: subTab,
            kpi: kpi,
            systems: systems,
            filterSystemId: filterSystemId,
            filterResourceId: filterResourceId,
            resourcesOf: resourcesOf,
            onSystemFilterChange: onSystemFilterChange,
            clearFilter: clearFilter,
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
