/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, VideoPlay, CaretRight } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import { formatDateTime } from '@/utils/datetime';
import PermissionButton from '@/components/PermissionButton.vue';
import ManualTriggerDialog from './ManualTriggerDialog.vue';
const MENU_CODE = 'ucp.executions';
const router = useRouter();
const total = ref(0);
const kpiToday = ref(0);
const kpiRunning = ref(0);
const kpiFailed = ref(0);
const kpiRetryable = ref(0);
const list = ref([]);
const loading = ref(false);
// Phase 2-4: 手动触发对话框
const triggerDialogVisible = ref(false);
const triggerDialogCode = ref('');
const filterPipeline = ref('');
const filterStatus = ref('');
const filterTrigger = ref('');
const STATUS_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'SUCCESS', label: '成功' },
    { value: 'PARTIAL_SUCCESS', label: '部分成功' },
    { value: 'FAILED', label: '失败' },
    { value: 'RUNNING', label: '运行中' },
    { value: 'PENDING', label: '待执行' },
];
const TRIGGER_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'cron', label: '定时调度' },
    { value: 'manual', label: '手动触发' },
    { value: 'event', label: '事件触发' },
];
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
function getPartialSeverity(row) {
    const ctx = row.context_summary;
    if (row.status !== 'PARTIAL_SUCCESS' || !ctx || !ctx.partial_severity)
        return null;
    return ctx.partial_severity;
}
function severityType(sev) {
    if (sev === 'CRITICAL')
        return 'danger';
    if (sev === 'WARNING')
        return 'warning';
    return 'success';
}
function severityLabel(sev) {
    if (sev === 'CRITICAL')
        return '严重';
    if (sev === 'WARNING')
        return '警告';
    return '正常';
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
function triggerLabel(t) {
    if (t === 'cron')
        return '定时调度';
    if (t === 'manual')
        return '手动触发';
    if (t === 'event')
        return '事件触发';
    return t;
}
async function load() {
    loading.value = true;
    try {
        const params = { limit: 100 };
        if (filterPipeline.value)
            params.pipeline_code = filterPipeline.value;
        if (filterStatus.value)
            params.status = filterStatus.value;
        if (filterTrigger.value)
            params.trigger_type = filterTrigger.value;
        const res = await ucpApi.executions(params);
        total.value = res.total;
        list.value = res.items;
        const items = res.items || [];
        kpiToday.value = items.filter((x) => x.started_at && x.started_at.startsWith(new Date().toISOString().slice(0, 10))).length;
        kpiRunning.value = items.filter((x) => x.status === 'RUNNING').length;
        kpiFailed.value = items.filter((x) => x.status === 'FAILED').length;
        kpiRetryable.value = items.filter((x) => x.status === 'FAILED' || x.status === 'PARTIAL_SUCCESS').length;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载执行列表失败');
    }
    finally {
        loading.value = false;
    }
}
function viewDetail(row) {
    router.push({ name: 'UcpRunDetail', params: { id: row.pipeline_run_id } });
}
async function triggerOfferSync() {
    triggerDialogCode.value = 'offer_sync';
    triggerDialogVisible.value = true;
}
async function onTriggerDialogSubmit(params, resolve, reject) {
    try {
        const result = await ucpApi.runPipeline(triggerDialogCode.value, params);
        await load();
        resolve(result);
    }
    catch (e) {
        reject(e);
    }
}
async function seedOfferSync() {
    try {
        await ElMessageBox.confirm('将初始化 Offer 同步 Pipeline 配置（创建凭据、系统、Pipeline、调度任务），确认继续？此操作幂等，已有配置不会被覆盖。', '初始化 Offer 同步配置', { type: 'info', confirmButtonText: '确认初始化', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    loading.value = true;
    try {
        const result = await ucpApi.seedOfferSync();
        ElMessage.success(`初始化完成：凭据 ${result.created.credentials} 个、系统 ${result.created.resources} 个、Pipeline ${result.created.pipelines} 个、调度 Job #${result.created.scheduler_job_id}`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '初始化失败');
    }
    finally {
        loading.value = false;
    }
}
watch([filterPipeline, filterStatus, filterTrigger], load);
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.total);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU_CODE),
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU_CODE),
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onClick: (__VLS_ctx.triggerOfferSync)
    };
    __VLS_6.slots.default;
    const __VLS_11 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
        ...{ style: {} },
    }));
    const __VLS_13 = __VLS_12({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_14.slots.default;
    const __VLS_15 = {}.VideoPlay;
    /** @type {[typeof __VLS_components.VideoPlay, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
    const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
    var __VLS_14;
    var __VLS_6;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU_CODE),
        op: "C",
        plain: true,
    }));
    const __VLS_20 = __VLS_19({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU_CODE),
        op: "C",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    let __VLS_22;
    let __VLS_23;
    let __VLS_24;
    const __VLS_25 = {
        onClick: (__VLS_ctx.seedOfferSync)
    };
    __VLS_21.slots.default;
    const __VLS_26 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
        ...{ style: {} },
    }));
    const __VLS_28 = __VLS_27({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    __VLS_29.slots.default;
    const __VLS_30 = {}.CaretRight;
    /** @type {[typeof __VLS_components.CaretRight, ]} */ ;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({}));
    const __VLS_32 = __VLS_31({}, ...__VLS_functionalComponentArgsRest(__VLS_31));
    var __VLS_29;
    var __VLS_21;
    const __VLS_34 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
        ...{ 'onClick': {} },
    }));
    const __VLS_36 = __VLS_35({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_35));
    let __VLS_38;
    let __VLS_39;
    let __VLS_40;
    const __VLS_41 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_37.slots.default;
    const __VLS_42 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent(__VLS_42, new __VLS_42({
        ...{ style: {} },
    }));
    const __VLS_44 = __VLS_43({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    __VLS_45.slots.default;
    const __VLS_46 = {}.Refresh;
    /** @type {[typeof __VLS_components.Refresh, ]} */ ;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent(__VLS_46, new __VLS_46({}));
    const __VLS_48 = __VLS_47({}, ...__VLS_functionalComponentArgsRest(__VLS_47));
    var __VLS_45;
    var __VLS_37;
}
const __VLS_50 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
    title: "UCP Pipeline 执行记录 · 含定时调度、手动触发与事件触发",
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_52 = __VLS_51({
    title: "UCP Pipeline 执行记录 · 含定时调度、手动触发与事件触发",
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_51));
__VLS_53.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
var __VLS_53;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-value" },
});
(__VLS_ctx.kpiToday);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-value text-warning" },
});
(__VLS_ctx.kpiRunning);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-value text-danger" },
});
(__VLS_ctx.kpiFailed);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "exec-kpi-value" },
});
(__VLS_ctx.kpiRetryable);
const __VLS_54 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent(__VLS_54, new __VLS_54({
    inline: true,
    ...{ style: {} },
}));
const __VLS_56 = __VLS_55({
    inline: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
__VLS_57.slots.default;
const __VLS_58 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({
    label: "Pipeline",
}));
const __VLS_60 = __VLS_59({
    label: "Pipeline",
}, ...__VLS_functionalComponentArgsRest(__VLS_59));
__VLS_61.slots.default;
const __VLS_62 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({
    modelValue: (__VLS_ctx.filterPipeline),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_64 = __VLS_63({
    modelValue: (__VLS_ctx.filterPipeline),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_63));
__VLS_65.slots.default;
const __VLS_66 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
    label: "Offer 同步",
    value: "offer_sync",
}));
const __VLS_68 = __VLS_67({
    label: "Offer 同步",
    value: "offer_sync",
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
var __VLS_65;
var __VLS_61;
const __VLS_70 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_71 = __VLS_asFunctionalComponent(__VLS_70, new __VLS_70({
    label: "状态",
}));
const __VLS_72 = __VLS_71({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_71));
__VLS_73.slots.default;
const __VLS_74 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_76 = __VLS_75({
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_75));
__VLS_77.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.STATUS_OPTIONS))) {
    const __VLS_78 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({
        key: (s.value),
        label: (s.label),
        value: (s.value),
    }));
    const __VLS_80 = __VLS_79({
        key: (s.value),
        label: (s.label),
        value: (s.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_79));
}
var __VLS_77;
var __VLS_73;
const __VLS_82 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
    label: "触发方式",
}));
const __VLS_84 = __VLS_83({
    label: "触发方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_83));
__VLS_85.slots.default;
const __VLS_86 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_87 = __VLS_asFunctionalComponent(__VLS_86, new __VLS_86({
    modelValue: (__VLS_ctx.filterTrigger),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_88 = __VLS_87({
    modelValue: (__VLS_ctx.filterTrigger),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_87));
__VLS_89.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.TRIGGER_OPTIONS))) {
    const __VLS_90 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }));
    const __VLS_92 = __VLS_91({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
}
var __VLS_89;
var __VLS_85;
var __VLS_57;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_94 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_96 = __VLS_95({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_95));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_97.slots.default;
const __VLS_98 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
    label: "Pipeline",
    minWidth: "160",
}));
const __VLS_100 = __VLS_99({
    label: "Pipeline",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
__VLS_101.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_101.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (row.pipeline_code);
}
var __VLS_101;
const __VLS_102 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_103 = __VLS_asFunctionalComponent(__VLS_102, new __VLS_102({
    label: "Trace ID",
    minWidth: "140",
    showOverflowTooltip: true,
}));
const __VLS_104 = __VLS_103({
    label: "Trace ID",
    minWidth: "140",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_103));
__VLS_105.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_105.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (row.trace_id);
}
var __VLS_105;
const __VLS_106 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_107 = __VLS_asFunctionalComponent(__VLS_106, new __VLS_106({
    label: "状态",
    width: "160",
}));
const __VLS_108 = __VLS_107({
    label: "状态",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_107));
__VLS_109.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_109.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_110 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_111 = __VLS_asFunctionalComponent(__VLS_110, new __VLS_110({
        type: (__VLS_ctx.statusType(row.status)),
        size: "small",
    }));
    const __VLS_112 = __VLS_111({
        type: (__VLS_ctx.statusType(row.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_111));
    __VLS_113.slots.default;
    (__VLS_ctx.statusLabel(row.status));
    var __VLS_113;
    if (__VLS_ctx.getPartialSeverity(row)) {
        const __VLS_114 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_115 = __VLS_asFunctionalComponent(__VLS_114, new __VLS_114({
            type: (__VLS_ctx.severityType(__VLS_ctx.getPartialSeverity(row).severity)),
            size: "small",
            effect: "dark",
            ...{ style: {} },
        }));
        const __VLS_116 = __VLS_115({
            type: (__VLS_ctx.severityType(__VLS_ctx.getPartialSeverity(row).severity)),
            size: "small",
            effect: "dark",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_115));
        __VLS_117.slots.default;
        (__VLS_ctx.severityLabel(__VLS_ctx.getPartialSeverity(row).severity));
        (__VLS_ctx.getPartialSeverity(row).total_failed);
        (__VLS_ctx.getPartialSeverity(row).total);
        var __VLS_117;
    }
}
var __VLS_109;
const __VLS_118 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_119 = __VLS_asFunctionalComponent(__VLS_118, new __VLS_118({
    label: "步骤",
    width: "100",
}));
const __VLS_120 = __VLS_119({
    label: "步骤",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_119));
__VLS_121.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_121.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.success_steps);
    (row.total_steps);
    if (row.failed_steps) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (row.failed_steps);
    }
}
var __VLS_121;
const __VLS_122 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_123 = __VLS_asFunctionalComponent(__VLS_122, new __VLS_122({
    label: "开始时间",
    minWidth: "180",
}));
const __VLS_124 = __VLS_123({
    label: "开始时间",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_123));
__VLS_125.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_125.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.started_at));
}
var __VLS_125;
const __VLS_126 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_127 = __VLS_asFunctionalComponent(__VLS_126, new __VLS_126({
    label: "耗时",
    width: "100",
}));
const __VLS_128 = __VLS_127({
    label: "耗时",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_127));
__VLS_129.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_129.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDuration(row.duration_ms));
}
var __VLS_129;
const __VLS_130 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_131 = __VLS_asFunctionalComponent(__VLS_130, new __VLS_130({
    label: "触发方式",
    width: "120",
}));
const __VLS_132 = __VLS_131({
    label: "触发方式",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_131));
__VLS_133.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_133.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.trigger_type === 'cron') {
        const __VLS_134 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
            size: "small",
            effect: "plain",
        }));
        const __VLS_136 = __VLS_135({
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_135));
        __VLS_137.slots.default;
        var __VLS_137;
    }
    else if (row.trigger_type === 'manual') {
        const __VLS_138 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_139 = __VLS_asFunctionalComponent(__VLS_138, new __VLS_138({
            size: "small",
            type: "info",
            effect: "plain",
        }));
        const __VLS_140 = __VLS_139({
            size: "small",
            type: "info",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_139));
        __VLS_141.slots.default;
        var __VLS_141;
    }
    else {
        const __VLS_142 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
            size: "small",
            type: "warning",
            effect: "plain",
        }));
        const __VLS_144 = __VLS_143({
            size: "small",
            type: "warning",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_143));
        __VLS_145.slots.default;
        (__VLS_ctx.triggerLabel(row.trigger_type));
        var __VLS_145;
    }
}
var __VLS_133;
const __VLS_146 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
    label: "操作",
    width: "200",
    fixed: "right",
}));
const __VLS_148 = __VLS_147({
    label: "操作",
    width: "200",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_147));
__VLS_149.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_149.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU_CODE),
        op: "V",
        size: "small",
    }));
    const __VLS_151 = __VLS_150({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU_CODE),
        op: "V",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    let __VLS_153;
    let __VLS_154;
    let __VLS_155;
    const __VLS_156 = {
        onClick: (...[$event]) => {
            __VLS_ctx.viewDetail(row);
        }
    };
    __VLS_152.slots.default;
    var __VLS_152;
    if (row.status === 'PARTIAL_SUCCESS' || row.status === 'FAILED') {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.MENU_CODE),
            op: "U",
            size: "small",
            type: "warning",
        }));
        const __VLS_158 = __VLS_157({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.MENU_CODE),
            op: "U",
            size: "small",
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        let __VLS_160;
        let __VLS_161;
        let __VLS_162;
        const __VLS_163 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'PARTIAL_SUCCESS' || row.status === 'FAILED'))
                    return;
                __VLS_ctx.viewDetail(row);
            }
        };
        __VLS_159.slots.default;
        var __VLS_159;
    }
}
var __VLS_149;
{
    const { empty: __VLS_thisSlot } = __VLS_97.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
var __VLS_97;
var __VLS_3;
/** @type {[typeof ManualTriggerDialog, ]} */ ;
// @ts-ignore
const __VLS_164 = __VLS_asFunctionalComponent(ManualTriggerDialog, new ManualTriggerDialog({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.triggerDialogVisible),
    pipelineCode: (__VLS_ctx.triggerDialogCode),
}));
const __VLS_165 = __VLS_164({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.triggerDialogVisible),
    pipelineCode: (__VLS_ctx.triggerDialogCode),
}, ...__VLS_functionalComponentArgsRest(__VLS_164));
let __VLS_167;
let __VLS_168;
let __VLS_169;
const __VLS_170 = {
    onSubmit: (__VLS_ctx.onTriggerDialogSubmit)
};
var __VLS_166;
/** @type {__VLS_StyleScopedClasses['exec-kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-kpi-value']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            VideoPlay: VideoPlay,
            CaretRight: CaretRight,
            formatDateTime: formatDateTime,
            PermissionButton: PermissionButton,
            ManualTriggerDialog: ManualTriggerDialog,
            MENU_CODE: MENU_CODE,
            total: total,
            kpiToday: kpiToday,
            kpiRunning: kpiRunning,
            kpiFailed: kpiFailed,
            kpiRetryable: kpiRetryable,
            list: list,
            loading: loading,
            triggerDialogVisible: triggerDialogVisible,
            triggerDialogCode: triggerDialogCode,
            filterPipeline: filterPipeline,
            filterStatus: filterStatus,
            filterTrigger: filterTrigger,
            STATUS_OPTIONS: STATUS_OPTIONS,
            TRIGGER_OPTIONS: TRIGGER_OPTIONS,
            statusType: statusType,
            statusLabel: statusLabel,
            getPartialSeverity: getPartialSeverity,
            severityType: severityType,
            severityLabel: severityLabel,
            formatDuration: formatDuration,
            triggerLabel: triggerLabel,
            load: load,
            viewDetail: viewDetail,
            triggerOfferSync: triggerOfferSync,
            onTriggerDialogSubmit: onTriggerDialogSubmit,
            seedOfferSync: seedOfferSync,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
