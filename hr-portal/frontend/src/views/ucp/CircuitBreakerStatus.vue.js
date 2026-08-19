/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
const activeTab = ref('circuits');
const circuits = ref([]);
const rateLimits = ref([]);
const loadingCircuits = ref(false);
const loadingRateLimits = ref(false);
const savingConfig = ref(false);
const configDialogVisible = ref(false);
const currentCircuit = ref(null);
const configForm = ref({
    enabled: false,
    failure_threshold: 5,
    open_duration_seconds: 300,
    half_open_max_calls: 1,
    success_threshold: 3,
});
const openCount = computed(() => circuits.value.filter((c) => c.state === 'OPEN').length);
const halfOpenCount = computed(() => circuits.value.filter((c) => c.state === 'HALF_OPEN').length);
function circuitStateLabel(s) {
    return { CLOSED: '关闭', OPEN: '打开', HALF_OPEN: '半开' }[s] || s;
}
function circuitStateTagType(s) {
    if (s === 'CLOSED')
        return 'success';
    if (s === 'OPEN')
        return 'danger';
    if (s === 'HALF_OPEN')
        return 'warning';
    return 'info';
}
function formatTime(epoch) {
    if (!epoch)
        return '-';
    // 简单本地时间
    return new Date(epoch * 1000).toLocaleTimeString('zh-CN');
}
async function loadCircuits() {
    loadingCircuits.value = true;
    try {
        const res = await ucpApi.listCircuits();
        circuits.value = res.circuits || [];
    }
    catch (e) {
        ElMessage.error(`加载熔断器列表失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
    finally {
        loadingCircuits.value = false;
    }
}
async function loadRateLimits() {
    loadingRateLimits.value = true;
    try {
        const res = await ucpApi.listRateLimits();
        rateLimits.value = res.buckets || [];
    }
    catch (e) {
        ElMessage.error(`加载限流桶列表失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
    finally {
        loadingRateLimits.value = false;
    }
}
async function openConfigDialog(row) {
    currentCircuit.value = row;
    // 拉取最新配置
    try {
        const res = await ucpApi.getCircuit(row.resource_code);
        const cfg = res.config || {};
        configForm.value = {
            enabled: !!cfg.enabled,
            failure_threshold: cfg.failure_threshold || 5,
            open_duration_seconds: cfg.open_duration_seconds || 300,
            half_open_max_calls: cfg.half_open_max_calls || 1,
            success_threshold: cfg.success_threshold || 3,
        };
        configDialogVisible.value = true;
    }
    catch (e) {
        ElMessage.error(`加载配置失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
}
async function handleSaveConfig() {
    if (!currentCircuit.value)
        return;
    savingConfig.value = true;
    try {
        await ucpApi.updateCircuitConfig(currentCircuit.value.resource_code, configForm.value);
        ElMessage.success('保存成功');
        configDialogVisible.value = false;
        await loadCircuits();
    }
    catch (e) {
        ElMessage.error(`保存失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
    finally {
        savingConfig.value = false;
    }
}
async function handleReset(row) {
    try {
        await ElMessageBox.confirm(`确认重置资源「${row.resource_code}」的熔断器？`, '重置确认', { type: 'warning' });
        await ucpApi.resetCircuit(row.resource_code);
        ElMessage.success('已重置');
        await loadCircuits();
    }
    catch (e) {
        if (e === 'cancel')
            return;
        ElMessage.error(`重置失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
}
async function handleResetBucket(row) {
    try {
        await ElMessageBox.confirm(`确认重置限流桶「${row.key}」？`, '重置确认', { type: 'warning' });
        await ucpApi.resetRateLimit(row.key);
        ElMessage.success('已重置');
        await loadRateLimits();
    }
    catch (e) {
        if (e === 'cancel')
            return;
        ElMessage.error(`重置失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
}
onMounted(() => {
    loadCircuits();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "circuit-breaker-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
const __VLS_0 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.activeTab),
    type: "border-card",
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.activeTab),
    type: "border-card",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    label: "熔断器状态",
    name: "circuits",
}));
const __VLS_6 = __VLS_5({
    label: "熔断器状态",
    name: "circuits",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-actions" },
});
const __VLS_8 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.loadCircuits)
};
__VLS_11.slots.default;
var __VLS_11;
const __VLS_16 = {}.ElText;
/** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    type: "info",
    size: "small",
}));
const __VLS_18 = __VLS_17({
    type: "info",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
(__VLS_ctx.circuits.length);
(__VLS_ctx.openCount);
(__VLS_ctx.halfOpenCount);
var __VLS_19;
const __VLS_20 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    data: (__VLS_ctx.circuits),
    stripe: true,
    size: "small",
    emptyText: "暂无熔断器记录",
}));
const __VLS_22 = __VLS_21({
    data: (__VLS_ctx.circuits),
    stripe: true,
    size: "small",
    emptyText: "暂无熔断器记录",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingCircuits) }, null, null);
__VLS_23.slots.default;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    prop: "resource_code",
    label: "资源编码",
    minWidth: "180",
}));
const __VLS_26 = __VLS_25({
    prop: "resource_code",
    label: "资源编码",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "熔断状态",
    width: "140",
}));
const __VLS_30 = __VLS_29({
    label: "熔断状态",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_32 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        type: (__VLS_ctx.circuitStateTagType(row.state)),
        size: "small",
    }));
    const __VLS_34 = __VLS_33({
        type: (__VLS_ctx.circuitStateTagType(row.state)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    (__VLS_ctx.circuitStateLabel(row.state));
    var __VLS_35;
    if (row.state === 'OPEN' && row.open_remaining_seconds > 0) {
        const __VLS_36 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            type: "info",
            size: "small",
            effect: "plain",
            ...{ class: "ml-8" },
        }));
        const __VLS_38 = __VLS_37({
            type: "info",
            size: "small",
            effect: "plain",
            ...{ class: "ml-8" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        __VLS_39.slots.default;
        (row.open_remaining_seconds);
        var __VLS_39;
    }
}
var __VLS_31;
const __VLS_40 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    prop: "consecutive_failures",
    label: "连续失败",
    width: "100",
    align: "center",
}));
const __VLS_42 = __VLS_41({
    prop: "consecutive_failures",
    label: "连续失败",
    width: "100",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    prop: "consecutive_successes",
    label: "连续成功",
    width: "100",
    align: "center",
}));
const __VLS_46 = __VLS_45({
    prop: "consecutive_successes",
    label: "连续成功",
    width: "100",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
const __VLS_48 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    prop: "half_open_calls",
    label: "试探调用",
    width: "100",
    align: "center",
}));
const __VLS_50 = __VLS_49({
    prop: "half_open_calls",
    label: "试探调用",
    width: "100",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    prop: "last_error_code",
    label: "最近错误码",
    width: "160",
}));
const __VLS_54 = __VLS_53({
    prop: "last_error_code",
    label: "最近错误码",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_error_code) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.last_error_code);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
var __VLS_55;
const __VLS_56 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    prop: "last_error_message",
    label: "最近错误信息",
    minWidth: "200",
    showOverflowTooltip: true,
}));
const __VLS_58 = __VLS_57({
    prop: "last_error_message",
    label: "最近错误信息",
    minWidth: "200",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "操作",
    width: "220",
    fixed: "right",
}));
const __VLS_62 = __VLS_61({
    label: "操作",
    width: "220",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_63.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_64 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openConfigDialog(row);
        }
    };
    __VLS_67.slots.default;
    var __VLS_67;
    const __VLS_72 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onClick': {} },
        link: true,
        type: "warning",
        size: "small",
        disabled: (row.state === 'CLOSED'),
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onClick': {} },
        link: true,
        type: "warning",
        size: "small",
        disabled: (row.state === 'CLOSED'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleReset(row);
        }
    };
    __VLS_75.slots.default;
    var __VLS_75;
}
var __VLS_63;
var __VLS_23;
if (__VLS_ctx.circuits.length === 0 && !__VLS_ctx.loadingCircuits) {
    const __VLS_80 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        type: "info",
        closable: (false),
        title: "暂无熔断记录",
        description: "资源在执行过程中产生失败/成功计数后会自动出现在此列表。当连续失败达到配置的阈值时会自动进入 OPEN 状态。",
    }));
    const __VLS_82 = __VLS_81({
        type: "info",
        closable: (false),
        title: "暂无熔断记录",
        description: "资源在执行过程中产生失败/成功计数后会自动出现在此列表。当连续失败达到配置的阈值时会自动进入 OPEN 状态。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
}
var __VLS_7;
const __VLS_84 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "限流桶状态",
    name: "rate-limits",
}));
const __VLS_86 = __VLS_85({
    label: "限流桶状态",
    name: "rate-limits",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-actions" },
});
const __VLS_88 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_90 = __VLS_89({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onClick: (__VLS_ctx.loadRateLimits)
};
__VLS_91.slots.default;
var __VLS_91;
const __VLS_96 = {}.ElText;
/** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    type: "info",
    size: "small",
}));
const __VLS_98 = __VLS_97({
    type: "info",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
var __VLS_99;
const __VLS_100 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    data: (__VLS_ctx.rateLimits),
    stripe: true,
    size: "small",
    emptyText: "无限流活动",
}));
const __VLS_102 = __VLS_101({
    data: (__VLS_ctx.rateLimits),
    stripe: true,
    size: "small",
    emptyText: "无限流活动",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loadingRateLimits) }, null, null);
__VLS_103.slots.default;
const __VLS_104 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    prop: "key",
    label: "限流 Key",
    minWidth: "200",
}));
const __VLS_106 = __VLS_105({
    prop: "key",
    label: "限流 Key",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
const __VLS_108 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "近 1s 调用",
    width: "120",
    align: "center",
}));
const __VLS_110 = __VLS_109({
    label: "近 1s 调用",
    width: "120",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_111.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_112 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        type: (row.calls_in_last_second > 5 ? 'warning' : 'success'),
        size: "small",
    }));
    const __VLS_114 = __VLS_113({
        type: (row.calls_in_last_second > 5 ? 'warning' : 'success'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    (row.calls_in_last_second);
    var __VLS_115;
}
var __VLS_111;
const __VLS_116 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    label: "最近获取时间",
    width: "180",
}));
const __VLS_118 = __VLS_117({
    label: "最近获取时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_119.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_acquire > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatTime(row.last_acquire));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
var __VLS_119;
const __VLS_120 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "操作",
    width: "120",
    fixed: "right",
}));
const __VLS_122 = __VLS_121({
    label: "操作",
    width: "120",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_123.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_124 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onClick': {} },
        link: true,
        type: "warning",
        size: "small",
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
        link: true,
        type: "warning",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleResetBucket(row);
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
}
var __VLS_123;
var __VLS_103;
var __VLS_87;
var __VLS_3;
const __VLS_132 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    modelValue: (__VLS_ctx.configDialogVisible),
    title: (`熔断配置 - ${__VLS_ctx.currentCircuit?.resource_code || ''}`),
    width: "640",
    closeOnClickModal: (false),
}));
const __VLS_134 = __VLS_133({
    modelValue: (__VLS_ctx.configDialogVisible),
    title: (`熔断配置 - ${__VLS_ctx.currentCircuit?.resource_code || ''}`),
    width: "640",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
if (__VLS_ctx.currentCircuit) {
    const __VLS_136 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        model: (__VLS_ctx.configForm),
        labelWidth: "140px",
        size: "default",
    }));
    const __VLS_138 = __VLS_137({
        model: (__VLS_ctx.configForm),
        labelWidth: "140px",
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    __VLS_139.slots.default;
    const __VLS_140 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        label: "启用熔断",
    }));
    const __VLS_142 = __VLS_141({
        label: "启用熔断",
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    __VLS_143.slots.default;
    const __VLS_144 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        modelValue: (__VLS_ctx.configForm.enabled),
    }));
    const __VLS_146 = __VLS_145({
        modelValue: (__VLS_ctx.configForm.enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    const __VLS_148 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }));
    const __VLS_150 = __VLS_149({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    __VLS_151.slots.default;
    var __VLS_151;
    var __VLS_143;
    const __VLS_152 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        label: "失败阈值",
    }));
    const __VLS_154 = __VLS_153({
        label: "失败阈值",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_155.slots.default;
    const __VLS_156 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        modelValue: (__VLS_ctx.configForm.failure_threshold),
        min: (1),
        max: (100),
    }));
    const __VLS_158 = __VLS_157({
        modelValue: (__VLS_ctx.configForm.failure_threshold),
        min: (1),
        max: (100),
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    const __VLS_160 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }));
    const __VLS_162 = __VLS_161({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    var __VLS_163;
    var __VLS_155;
    const __VLS_164 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        label: "熔断持续时间",
    }));
    const __VLS_166 = __VLS_165({
        label: "熔断持续时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    const __VLS_168 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        modelValue: (__VLS_ctx.configForm.open_duration_seconds),
        min: (10),
        max: (86400),
        step: (30),
    }));
    const __VLS_170 = __VLS_169({
        modelValue: (__VLS_ctx.configForm.open_duration_seconds),
        min: (10),
        max: (86400),
        step: (30),
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "unit" },
    });
    var __VLS_167;
    const __VLS_172 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "半开试探上限",
    }));
    const __VLS_174 = __VLS_173({
        label: "半开试探上限",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    const __VLS_176 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        modelValue: (__VLS_ctx.configForm.half_open_max_calls),
        min: (1),
        max: (10),
    }));
    const __VLS_178 = __VLS_177({
        modelValue: (__VLS_ctx.configForm.half_open_max_calls),
        min: (1),
        max: (10),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    const __VLS_180 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }));
    const __VLS_182 = __VLS_181({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
    __VLS_183.slots.default;
    var __VLS_183;
    var __VLS_175;
    const __VLS_184 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        label: "恢复成功阈值",
    }));
    const __VLS_186 = __VLS_185({
        label: "恢复成功阈值",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    const __VLS_188 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        modelValue: (__VLS_ctx.configForm.success_threshold),
        min: (1),
        max: (20),
    }));
    const __VLS_190 = __VLS_189({
        modelValue: (__VLS_ctx.configForm.success_threshold),
        min: (1),
        max: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    const __VLS_192 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }));
    const __VLS_194 = __VLS_193({
        size: "small",
        type: "info",
        ...{ class: "ml-8" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    var __VLS_195;
    var __VLS_187;
    var __VLS_139;
}
{
    const { footer: __VLS_thisSlot } = __VLS_135.slots;
    const __VLS_196 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        ...{ 'onClick': {} },
    }));
    const __VLS_198 = __VLS_197({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    let __VLS_200;
    let __VLS_201;
    let __VLS_202;
    const __VLS_203 = {
        onClick: (...[$event]) => {
            __VLS_ctx.configDialogVisible = false;
        }
    };
    __VLS_199.slots.default;
    var __VLS_199;
    const __VLS_204 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.savingConfig),
    }));
    const __VLS_206 = __VLS_205({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.savingConfig),
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    let __VLS_208;
    let __VLS_209;
    let __VLS_210;
    const __VLS_211 = {
        onClick: (__VLS_ctx.handleSaveConfig)
    };
    __VLS_207.slots.default;
    var __VLS_207;
}
var __VLS_135;
/** @type {__VLS_StyleScopedClasses['circuit-breaker-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-8']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-8']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-8']} */ ;
/** @type {__VLS_StyleScopedClasses['unit']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-8']} */ ;
/** @type {__VLS_StyleScopedClasses['ml-8']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            activeTab: activeTab,
            circuits: circuits,
            rateLimits: rateLimits,
            loadingCircuits: loadingCircuits,
            loadingRateLimits: loadingRateLimits,
            savingConfig: savingConfig,
            configDialogVisible: configDialogVisible,
            currentCircuit: currentCircuit,
            configForm: configForm,
            openCount: openCount,
            halfOpenCount: halfOpenCount,
            circuitStateLabel: circuitStateLabel,
            circuitStateTagType: circuitStateTagType,
            formatTime: formatTime,
            loadCircuits: loadCircuits,
            loadRateLimits: loadRateLimits,
            openConfigDialog: openConfigDialog,
            handleSaveConfig: handleSaveConfig,
            handleReset: handleReset,
            handleResetBucket: handleResetBucket,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
