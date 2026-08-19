/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import EventIngestDialog from './EventIngestDialog.vue';
const router = useRouter();
const SOURCES = ['FEISHU', 'BEISEN', 'INTERNAL', 'GENERIC'];
const EVENT_TYPES = [
    'EMPLOYEE_ONBOARDING', 'OFFER_STATUS_CHANGE', 'CONTACT_UPDATE',
    'ORG_CHANGE', 'TIMECARD_SUBMIT', 'LEAVE_APPLY', 'GENERIC',
];
const STATUSES = [
    { value: 'RECEIVED', label: '已接收' },
    { value: 'MATCHED', label: '已匹配' },
    { value: 'DISPATCHED', label: '已派发' },
    { value: 'COMPLETED', label: '已完成' },
    { value: 'FAILED', label: '失败' },
    { value: 'DEAD_LETTER', label: '死信' },
    { value: 'NO_MATCH', label: '未匹配' },
];
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const filters = reactive({});
const stats = reactive({ todayCount: 0, dispatchedCount: 0, noMatchCount: 0, failedCount: 0 });
const ingestDialogVisible = ref(false);
async function loadList() {
    loading.value = true;
    try {
        const res = await ucpApi.listEvents({
            source: filters.source,
            event_type: filters.event_type,
            status: filters.status,
            limit: pageSize.value,
            offset: (page.value - 1) * pageSize.value,
        });
        items.value = res.items || [];
        total.value = res.total || 0;
        await loadStats();
    }
    finally {
        loading.value = false;
    }
}
async function loadStats() {
    // 稳健实现：分批拉取，每次 200 条，最多拉 1000 条做统计
    // 避免单次 limit 过大触发后端参数校验失败
    try {
        let all = [];
        const batchSize = 200;
        const maxRows = 1000;
        let offset = 0;
        while (offset < maxRows) {
            const res = await ucpApi.listEvents({ limit: batchSize, offset });
            const items = res.items || [];
            all = all.concat(items);
            if (items.length < batchSize)
                break; // 已拉完
            offset += batchSize;
        }
        const today = new Date().toISOString().slice(0, 10);
        stats.todayCount = all.filter((e) => (e.received_at || '').slice(0, 10) === today).length;
        stats.dispatchedCount = all.filter((e) => ['DISPATCHED', 'COMPLETED'].includes(e.status)).length;
        stats.noMatchCount = all.filter((e) => e.status === 'NO_MATCH').length;
        stats.failedCount = all.filter((e) => ['FAILED', 'DEAD_LETTER'].includes(e.status)).length;
    }
    catch {
        // 静默：统计失败不影响主列表
    }
}
function openIngestDialog() {
    ingestDialogVisible.value = true;
}
function onIngested() {
    page.value = 1;
    loadList();
}
function goDetail(row) {
    router.push({ name: 'UcpEventDetail', params: { eventId: String(row.id) } });
}
const __VLS_exposed = { loadList };
defineExpose(__VLS_exposed);
async function manualDispatch(row) {
    await ElMessageBox.confirm(`确认对事件 ${row.event_id} 重新匹配并派发？`, '手动派发', { type: 'warning' });
    try {
        const res = await ucpApi.manualDispatchEvent(String(row.id));
        ElMessage.success(`已派发：${res.status} / ${res.matched_trigger_code || '无匹配'}`);
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '派发失败');
    }
}
function statusTagType(s) {
    switch (s) {
        case 'COMPLETED': return 'success';
        case 'DISPATCHED': return 'success';
        case 'MATCHED': return 'info';
        case 'RECEIVED': return 'info';
        case 'FAILED': return 'danger';
        case 'DEAD_LETTER': return 'danger';
        case 'NO_MATCH': return 'warning';
        default: return '';
    }
}
function statusLabel(s) {
    return STATUSES.find((x) => x.value === s)?.label || s;
}
function sourceTagType(s) {
    switch (s) {
        case 'FEISHU': return 'success';
        case 'BEISEN': return 'warning';
        case 'INTERNAL': return 'info';
        default: return '';
    }
}
function formatTime(t) {
    if (!t)
        return '-';
    return formatDateTime(t);
}
onMounted(loadList);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "event-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.source),
    placeholder: "来源",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.source),
    placeholder: "来源",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.loadList)
};
__VLS_3.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.SOURCES))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (s),
        label: (s),
        value: (s),
    }));
    const __VLS_10 = __VLS_9({
        key: (s),
        label: (s),
        value: (s),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_3;
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.event_type),
    placeholder: "事件类型",
    clearable: true,
    filterable: true,
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.event_type),
    placeholder: "事件类型",
    clearable: true,
    filterable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onChange: (__VLS_ctx.loadList)
};
__VLS_15.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.EVENT_TYPES))) {
    const __VLS_20 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        key: (t),
        label: (t),
        value: (t),
    }));
    const __VLS_22 = __VLS_21({
        key: (t),
        label: (t),
        value: (t),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
var __VLS_15;
const __VLS_24 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.status),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_26 = __VLS_25({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.status),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onChange: (__VLS_ctx.loadList)
};
__VLS_27.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.STATUSES))) {
    const __VLS_32 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        key: (s.value),
        label: (s.label),
        value: (s.value),
    }));
    const __VLS_34 = __VLS_33({
        key: (s.value),
        label: (s.label),
        value: (s.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
var __VLS_27;
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (__VLS_ctx.loadList)
};
__VLS_39.slots.default;
var __VLS_39;
const __VLS_44 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
}));
const __VLS_46 = __VLS_45({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onClick: (__VLS_ctx.openIngestDialog)
};
__VLS_47.slots.default;
var __VLS_47;
const __VLS_52 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_54 = __VLS_53({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_55.slots.default;
const __VLS_56 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    prop: "id",
    label: "DB ID",
    width: "80",
}));
const __VLS_58 = __VLS_57({
    prop: "id",
    label: "DB ID",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    prop: "event_id",
    label: "Event ID",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_62 = __VLS_61({
    prop: "event_id",
    label: "Event ID",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_63.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_64 = {}.ElLink;
    /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (...[$event]) => {
            __VLS_ctx.goDetail(row);
        }
    };
    __VLS_67.slots.default;
    (row.event_id);
    var __VLS_67;
}
var __VLS_63;
const __VLS_72 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    prop: "event_type",
    label: "事件类型",
    width: "160",
}));
const __VLS_74 = __VLS_73({
    prop: "event_type",
    label: "事件类型",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_75.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_76 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        size: "small",
        effect: "plain",
    }));
    const __VLS_78 = __VLS_77({
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    (row.event_type);
    var __VLS_79;
}
var __VLS_75;
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    prop: "source",
    label: "来源",
    width: "100",
}));
const __VLS_82 = __VLS_81({
    prop: "source",
    label: "来源",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_83.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_84 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        type: (__VLS_ctx.sourceTagType(row.source)),
        size: "small",
    }));
    const __VLS_86 = __VLS_85({
        type: (__VLS_ctx.sourceTagType(row.source)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    (row.source);
    var __VLS_87;
}
var __VLS_83;
const __VLS_88 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    label: "状态",
    width: "130",
}));
const __VLS_90 = __VLS_89({
    label: "状态",
    width: "130",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_91.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_92 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        type: (__VLS_ctx.statusTagType(row.status)),
        size: "small",
    }));
    const __VLS_94 = __VLS_93({
        type: (__VLS_ctx.statusTagType(row.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    (__VLS_ctx.statusLabel(row.status));
    var __VLS_95;
}
var __VLS_91;
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    prop: "matched_trigger_code",
    label: "命中触发器",
    minWidth: "160",
    showOverflowTooltip: true,
}));
const __VLS_98 = __VLS_97({
    prop: "matched_trigger_code",
    label: "命中触发器",
    minWidth: "160",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_99.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.matched_trigger_code) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.matched_trigger_code);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
}
var __VLS_99;
const __VLS_100 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    prop: "pipeline_run_id",
    label: "Pipeline Run",
    minWidth: "200",
    showOverflowTooltip: true,
}));
const __VLS_102 = __VLS_101({
    prop: "pipeline_run_id",
    label: "Pipeline Run",
    minWidth: "200",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_103.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.pipeline_run_id) {
        const __VLS_104 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_106 = __VLS_105({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        let __VLS_108;
        let __VLS_109;
        let __VLS_110;
        const __VLS_111 = {
            onClick: (...[$event]) => {
                if (!(row.pipeline_run_id))
                    return;
                __VLS_ctx.router.push(`/ucp/executions/${row.pipeline_run_id}`);
            }
        };
        __VLS_107.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.pipeline_run_id);
        var __VLS_107;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
}
var __VLS_103;
const __VLS_112 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    prop: "retry_count",
    label: "重试",
    width: "70",
    align: "center",
}));
const __VLS_114 = __VLS_113({
    prop: "retry_count",
    label: "重试",
    width: "70",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
const __VLS_116 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    prop: "received_at",
    label: "接收时间",
    width: "170",
}));
const __VLS_118 = __VLS_117({
    prop: "received_at",
    label: "接收时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_119.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.received_at));
}
var __VLS_119;
const __VLS_120 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "操作",
    width: "180",
    fixed: "right",
}));
const __VLS_122 = __VLS_121({
    label: "操作",
    width: "180",
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
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            __VLS_ctx.goDetail(row);
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
    if (['RECEIVED', 'NO_MATCH', 'FAILED'].includes(row.status)) {
        const __VLS_132 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            ...{ 'onClick': {} },
            size: "small",
            link: true,
            type: "warning",
        }));
        const __VLS_134 = __VLS_133({
            ...{ 'onClick': {} },
            size: "small",
            link: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        let __VLS_136;
        let __VLS_137;
        let __VLS_138;
        const __VLS_139 = {
            onClick: (...[$event]) => {
                if (!(['RECEIVED', 'NO_MATCH', 'FAILED'].includes(row.status)))
                    return;
                __VLS_ctx.manualDispatch(row);
            }
        };
        __VLS_135.slots.default;
        var __VLS_135;
    }
}
var __VLS_123;
var __VLS_55;
const __VLS_140 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100, 200]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_142 = __VLS_141({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100, 200]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
let __VLS_144;
let __VLS_145;
let __VLS_146;
const __VLS_147 = {
    onCurrentChange: (__VLS_ctx.loadList)
};
const __VLS_148 = {
    onSizeChange: (__VLS_ctx.loadList)
};
var __VLS_143;
/** @type {[typeof EventIngestDialog, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(EventIngestDialog, new EventIngestDialog({
    ...{ 'onUpdate:visible': {} },
    ...{ 'onSuccess': {} },
    visible: (__VLS_ctx.ingestDialogVisible),
}));
const __VLS_150 = __VLS_149({
    ...{ 'onUpdate:visible': {} },
    ...{ 'onSuccess': {} },
    visible: (__VLS_ctx.ingestDialogVisible),
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
let __VLS_152;
let __VLS_153;
let __VLS_154;
const __VLS_155 = {
    'onUpdate:visible': ((v) => (__VLS_ctx.ingestDialogVisible = v))
};
const __VLS_156 = {
    onSuccess: (__VLS_ctx.onIngested)
};
var __VLS_151;
/** @type {__VLS_StyleScopedClasses['event-list']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Refresh: Refresh,
            EventIngestDialog: EventIngestDialog,
            router: router,
            SOURCES: SOURCES,
            EVENT_TYPES: EVENT_TYPES,
            STATUSES: STATUSES,
            items: items,
            total: total,
            page: page,
            pageSize: pageSize,
            loading: loading,
            filters: filters,
            ingestDialogVisible: ingestDialogVisible,
            loadList: loadList,
            openIngestDialog: openIngestDialog,
            onIngested: onIngested,
            goDetail: goDetail,
            manualDispatch: manualDispatch,
            statusTagType: statusTagType,
            statusLabel: statusLabel,
            sourceTagType: sourceTagType,
            formatTime: formatTime,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
});
; /* PartiallyEnd: #4569/main.vue */
