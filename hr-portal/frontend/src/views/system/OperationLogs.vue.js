/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Refresh, Search, View } from '@element-plus/icons-vue';
import { api } from '@/api/client';
import { formatDateTime } from '@/utils/datetime';
const LOG_TYPES = [
    { value: 'compensation_calc', label: '补偿金计算' },
    { value: 'automation_notification', label: '自动通知' },
    { value: 'report_access', label: '报表操作' },
];
const REPORT_ACTIONS = [
    { value: 'create', label: '新建' },
    { value: 'update', label: '修改' },
    { value: 'delete', label: '删除' },
    { value: 'view_data', label: '查看数据' },
    { value: 'export_csv', label: '导出 CSV' },
    { value: 'export_xlsx', label: '导出 Excel' },
    { value: 'push', label: '推送' },
    { value: 'access_denied', label: '访问拒绝' },
];
const ACTION_LABELS = Object.fromEntries(REPORT_ACTIONS.map((item) => [item.value, item.label]));
const PAGE_SIZE = 20;
const loading = ref(false);
const loadError = ref('');
const rows = ref([]);
const total = ref(0);
const page = ref(1);
const logType = ref('compensation_calc');
const action = ref('');
const statusFilter = ref('');
const operator = ref('');
const keyword = ref('');
const dateRange = ref([]);
const selectedLog = ref(null);
const mergeDetails = ref([]);
const mergeDetailTotal = ref(0);
const mergeDetailPage = ref(1);
const mergeDetailLoading = ref(false);
const mergeDetailError = ref('');
let debounceTimer;
let requestSequence = 0;
const isReportAccess = computed(() => logType.value === 'report_access');
const detailFields = computed(() => selectedLog.value?.metadata_json?.content?.fields || []);
const detailFilters = computed(() => selectedLog.value?.metadata_json?.content?.filters || []);
const detailTargets = computed(() => selectedLog.value?.metadata_json?.content?.targets || []);
const detailOpen = computed({
    get: () => selectedLog.value !== null,
    set: (open) => {
        if (!open)
            selectedLog.value = null;
    },
});
function actionLabel(value) {
    return ACTION_LABELS[value] || value || '—';
}
function statusType(value) {
    if (value === 'success')
        return 'success';
    if (value === 'failed')
        return 'danger';
    if (value === 'denied')
        return 'warning';
    return 'info';
}
function statusLabel(value) {
    return value === 'success' ? '成功' : value === 'failed' ? '失败' : value === 'denied' ? '拒绝' : value;
}
function auditValueLabel(value) {
    if (value && typeof value === 'object' && value.value_hmac)
        return `${value.display || '******'}（${shortHash(value.value_hmac)}）`;
    if (value === null)
        return '（NULL）';
    if (value === '')
        return '（空字符串）';
    return String(value ?? '—');
}
function detailChangeLabel(value) {
    return {
        rule_added: '新增规则',
        rule_removed: '删除规则',
        source_added: '新增来源',
        source_removed: '移除来源',
        target_changed: '修改结果',
        rule_renamed: '规则重命名',
    }[value] || value;
}
async function loadMergeDetails() {
    const log = selectedLog.value;
    if (!log?.metadata_json?.dimension_merge_diff?.detail_count) {
        mergeDetails.value = [];
        mergeDetailTotal.value = 0;
        return;
    }
    mergeDetailLoading.value = true;
    mergeDetailError.value = '';
    try {
        const result = await api.get(`/system-logs/${log.id}/details`, {
            params: {
                detail_type: 'report_dimension_merge_diff',
                page: mergeDetailPage.value,
                page_size: 50,
            },
        }).then((response) => response.data);
        mergeDetails.value = result.items;
        mergeDetailTotal.value = result.total;
    }
    catch (error) {
        mergeDetails.value = [];
        mergeDetailTotal.value = 0;
        mergeDetailError.value = error?.response?.data?.detail || '加载归并规则差异失败';
    }
    finally {
        mergeDetailLoading.value = false;
    }
}
function shortHash(value) {
    return value ? `${value.slice(0, 12)}…` : '—';
}
async function load() {
    const sequence = ++requestSequence;
    loading.value = true;
    loadError.value = '';
    try {
        const params = {
            category: logType.value,
            paged: true,
            page: page.value,
            page_size: PAGE_SIZE,
            action: action.value || undefined,
            status: statusFilter.value || undefined,
            operator: operator.value.trim() || undefined,
            keyword: keyword.value.trim() || undefined,
            start_at: dateRange.value[0]?.toISOString(),
            end_at: dateRange.value[1]?.toISOString(),
        };
        const result = await api.get('/system-logs', { params }).then((response) => response.data);
        if (sequence !== requestSequence)
            return;
        rows.value = result.items;
        total.value = result.total;
        if (page.value > Math.max(1, Math.ceil(result.total / PAGE_SIZE))) {
            page.value = 1;
        }
    }
    catch (error) {
        if (sequence !== requestSequence)
            return;
        rows.value = [];
        total.value = 0;
        loadError.value = error?.response?.data?.detail || '加载日志失败';
    }
    finally {
        if (sequence === requestSequence)
            loading.value = false;
    }
}
function reloadFromFirstPage() {
    if (page.value === 1) {
        void load();
    }
    else {
        page.value = 1;
    }
}
function scheduleLoad() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(reloadFromFirstPage, 300);
}
function changeLogType() {
    action.value = '';
    statusFilter.value = '';
    operator.value = '';
    keyword.value = '';
    dateRange.value = [];
    reloadFromFirstPage();
}
watch([operator, keyword], scheduleLoad);
watch(page, () => void load());
watch(selectedLog, () => {
    mergeDetailPage.value = 1;
    void loadMergeDetails();
});
watch(mergeDetailPage, () => void loadMergeDetails());
onMounted(load);
onBeforeUnmount(() => window.clearTimeout(debounceTimer));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-value']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-value']} */ ;
/** @type {__VLS_StyleScopedClasses['operation-log-page']} */ ;
/** @type {__VLS_StyleScopedClasses['date-filter']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "operation-log-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "log-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "log-filters" },
    role: "search",
    'aria-label': "筛选操作日志",
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.logType),
    ...{ class: "type-filter" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.logType),
    ...{ class: "type-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.changeLogType)
};
__VLS_3.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.LOG_TYPES))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_10 = __VLS_9({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_3;
const __VLS_12 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.dateRange),
    type: "datetimerange",
    rangeSeparator: "至",
    startPlaceholder: "开始时间",
    endPlaceholder: "结束时间",
    ...{ class: "date-filter" },
}));
const __VLS_14 = __VLS_13({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.dateRange),
    type: "datetimerange",
    rangeSeparator: "至",
    startPlaceholder: "开始时间",
    endPlaceholder: "结束时间",
    ...{ class: "date-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onChange: (__VLS_ctx.reloadFromFirstPage)
};
var __VLS_15;
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.operator),
    clearable: true,
    placeholder: "操作人",
    ...{ class: "operator-filter" },
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.operator),
    clearable: true,
    placeholder: "操作人",
    ...{ class: "operator-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
if (__VLS_ctx.isReportAccess) {
    const __VLS_24 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.action),
        clearable: true,
        placeholder: "全部动作",
        ...{ class: "action-filter" },
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.action),
        clearable: true,
        placeholder: "全部动作",
        ...{ class: "action-filter" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onChange: (__VLS_ctx.reloadFromFirstPage)
    };
    __VLS_27.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.REPORT_ACTIONS))) {
        const __VLS_32 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_34 = __VLS_33({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    }
    var __VLS_27;
}
const __VLS_36 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    modelValue: (__VLS_ctx.keyword),
    clearable: true,
    placeholder: (__VLS_ctx.isReportAccess ? '搜索报表' : '搜索操作对象'),
    ...{ class: "keyword-filter" },
}));
const __VLS_38 = __VLS_37({
    modelValue: (__VLS_ctx.keyword),
    clearable: true,
    placeholder: (__VLS_ctx.isReportAccess ? '搜索报表' : '搜索操作对象'),
    ...{ class: "keyword-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_39.slots;
    const __VLS_40 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    const __VLS_44 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
    const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
    var __VLS_43;
}
var __VLS_39;
const __VLS_48 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.statusFilter),
    clearable: true,
    placeholder: "全部状态",
    ...{ class: "status-filter" },
}));
const __VLS_50 = __VLS_49({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.statusFilter),
    clearable: true,
    placeholder: "全部状态",
    ...{ class: "status-filter" },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onChange: (__VLS_ctx.reloadFromFirstPage)
};
__VLS_51.slots.default;
const __VLS_56 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "成功",
    value: "success",
}));
const __VLS_58 = __VLS_57({
    label: "成功",
    value: "success",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "失败",
    value: "failed",
}));
const __VLS_62 = __VLS_61({
    label: "失败",
    value: "failed",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
const __VLS_64 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "拒绝",
    value: "denied",
}));
const __VLS_66 = __VLS_65({
    label: "拒绝",
    value: "denied",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_51;
const __VLS_68 = {}.ElTooltip;
/** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    content: "刷新日志",
    placement: "top",
}));
const __VLS_70 = __VLS_69({
    content: "刷新日志",
    placement: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onClick': {} },
    circle: true,
    'aria-label': "刷新日志",
    loading: (__VLS_ctx.loading),
}));
const __VLS_74 = __VLS_73({
    ...{ 'onClick': {} },
    circle: true,
    'aria-label': "刷新日志",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onClick: (__VLS_ctx.load)
};
__VLS_75.slots.default;
const __VLS_80 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
const __VLS_84 = {}.Refresh;
/** @type {[typeof __VLS_components.Refresh, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
var __VLS_83;
var __VLS_75;
var __VLS_71;
if (__VLS_ctx.loadError && !__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "log-error" },
        role: "alert",
    });
    const __VLS_88 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        description: (__VLS_ctx.loadError),
    }));
    const __VLS_90 = __VLS_89({
        description: (__VLS_ctx.loadError),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    const __VLS_92 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_94 = __VLS_93({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    let __VLS_96;
    let __VLS_97;
    let __VLS_98;
    const __VLS_99 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_95.slots.default;
    var __VLS_95;
    var __VLS_91;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "log-table-region" },
    });
    const __VLS_100 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        data: (__VLS_ctx.rows),
        stripe: true,
        height: "100%",
    }));
    const __VLS_102 = __VLS_101({
        data: (__VLS_ctx.rows),
        stripe: true,
        height: "100%",
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_103.slots.default;
    const __VLS_104 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        label: "操作时间",
        minWidth: "170",
    }));
    const __VLS_106 = __VLS_105({
        label: "操作时间",
        minWidth: "170",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_107.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.created_at));
    }
    var __VLS_107;
    const __VLS_108 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        label: "操作人",
        minWidth: "130",
    }));
    const __VLS_110 = __VLS_109({
        label: "操作人",
        minWidth: "130",
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_111.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.user_display_name || row.metadata_json?.actor?.display_name || (row.user_id ? `用户#${row.user_id}` : '系统'));
    }
    var __VLS_111;
    if (__VLS_ctx.isReportAccess) {
        const __VLS_112 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            label: "动作",
            minWidth: "110",
        }));
        const __VLS_114 = __VLS_113({
            label: "动作",
            minWidth: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        __VLS_115.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_115.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.actionLabel(row.action));
        }
        var __VLS_115;
        const __VLS_116 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            label: "报表",
            minWidth: "180",
            showOverflowTooltip: true,
        }));
        const __VLS_118 = __VLS_117({
            label: "报表",
            minWidth: "180",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_119.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.report?.name || row.request_summary || '—');
        }
        var __VLS_119;
        const __VLS_120 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            label: "字段数",
            width: "90",
            align: "center",
        }));
        const __VLS_122 = __VLS_121({
            label: "字段数",
            width: "90",
            align: "center",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        __VLS_123.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_123.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.content?.field_count ?? '—');
        }
        var __VLS_123;
        const __VLS_124 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
            label: "行数",
            width: "100",
            align: "right",
        }));
        const __VLS_126 = __VLS_125({
            label: "行数",
            width: "100",
            align: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_125));
        __VLS_127.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_127.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.content?.row_count ?? '—');
        }
        var __VLS_127;
        const __VLS_128 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            label: "格式",
            width: "90",
            align: "center",
        }));
        const __VLS_130 = __VLS_129({
            label: "格式",
            width: "90",
            align: "center",
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        __VLS_131.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_131.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.content?.format?.toUpperCase() || '—');
        }
        var __VLS_131;
    }
    else if (__VLS_ctx.logType === 'automation_notification') {
        const __VLS_132 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
            label: "规则名称",
            minWidth: "160",
            showOverflowTooltip: true,
        }));
        const __VLS_134 = __VLS_133({
            label: "规则名称",
            minWidth: "160",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_133));
        __VLS_135.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_135.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.rule_name || '—');
        }
        var __VLS_135;
        const __VLS_136 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            label: "触发类型",
            minWidth: "130",
        }));
        const __VLS_138 = __VLS_137({
            label: "触发类型",
            minWidth: "130",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_139.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.trigger_type || '—');
        }
        var __VLS_139;
        const __VLS_140 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            label: "业务范围",
            minWidth: "140",
            showOverflowTooltip: true,
        }));
        const __VLS_142 = __VLS_141({
            label: "业务范围",
            minWidth: "140",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_143.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.biz_type || '—');
        }
        var __VLS_143;
        const __VLS_144 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            label: "摘要",
            minWidth: "220",
            showOverflowTooltip: true,
        }));
        const __VLS_146 = __VLS_145({
            label: "摘要",
            minWidth: "220",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        __VLS_147.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_147.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.response_summary || '—');
        }
        var __VLS_147;
    }
    else {
        const __VLS_148 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            label: "被查员工",
            minWidth: "140",
        }));
        const __VLS_150 = __VLS_149({
            label: "被查员工",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        __VLS_151.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_151.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.employee_name || '—');
        }
        var __VLS_151;
        const __VLS_152 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            label: "工号",
            minWidth: "110",
        }));
        const __VLS_154 = __VLS_153({
            label: "工号",
            minWidth: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_155.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.employee_no || '—');
        }
        var __VLS_155;
        const __VLS_156 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
            label: "公司",
            minWidth: "160",
            showOverflowTooltip: true,
        }));
        const __VLS_158 = __VLS_157({
            label: "公司",
            minWidth: "160",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        __VLS_159.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_159.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.metadata_json?.company || '—');
        }
        var __VLS_159;
        const __VLS_160 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            label: "结果摘要",
            minWidth: "200",
            showOverflowTooltip: true,
        }));
        const __VLS_162 = __VLS_161({
            label: "结果摘要",
            minWidth: "200",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        __VLS_163.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_163.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.response_summary || '—');
        }
        var __VLS_163;
    }
    const __VLS_164 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        label: "状态",
        width: "90",
        align: "center",
    }));
    const __VLS_166 = __VLS_165({
        label: "状态",
        width: "90",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_167.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_168 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            type: (__VLS_ctx.statusType(row.status)),
            size: "small",
            effect: "plain",
        }));
        const __VLS_170 = __VLS_169({
            type: (__VLS_ctx.statusType(row.status)),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        __VLS_171.slots.default;
        (__VLS_ctx.statusLabel(row.status));
        var __VLS_171;
    }
    var __VLS_167;
    const __VLS_172 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "操作",
        width: "80",
        fixed: "right",
        align: "center",
    }));
    const __VLS_174 = __VLS_173({
        label: "操作",
        width: "80",
        fixed: "right",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_175.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_176 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            ...{ 'onClick': {} },
            link: true,
            size: "small",
            'aria-label': "查看日志详情",
        }));
        const __VLS_178 = __VLS_177({
            ...{ 'onClick': {} },
            link: true,
            size: "small",
            'aria-label': "查看日志详情",
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        let __VLS_180;
        let __VLS_181;
        let __VLS_182;
        const __VLS_183 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loadError && !__VLS_ctx.loading))
                    return;
                __VLS_ctx.selectedLog = row;
            }
        };
        __VLS_179.slots.default;
        const __VLS_184 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({}));
        const __VLS_186 = __VLS_185({}, ...__VLS_functionalComponentArgsRest(__VLS_185));
        __VLS_187.slots.default;
        const __VLS_188 = {}.View;
        /** @type {[typeof __VLS_components.View, ]} */ ;
        // @ts-ignore
        const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({}));
        const __VLS_190 = __VLS_189({}, ...__VLS_functionalComponentArgsRest(__VLS_189));
        var __VLS_187;
        var __VLS_179;
    }
    var __VLS_175;
    {
        const { empty: __VLS_thisSlot } = __VLS_103.slots;
        const __VLS_192 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            description: "暂无符合条件的操作日志",
        }));
        const __VLS_194 = __VLS_193({
            description: "暂无符合条件的操作日志",
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    }
    var __VLS_103;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "log-pagination" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.total);
    if (__VLS_ctx.total > __VLS_ctx.PAGE_SIZE) {
        const __VLS_196 = {}.ElPagination;
        /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            currentPage: (__VLS_ctx.page),
            pageSize: (__VLS_ctx.PAGE_SIZE),
            total: (__VLS_ctx.total),
            layout: "prev, pager, next",
            background: true,
        }));
        const __VLS_198 = __VLS_197({
            currentPage: (__VLS_ctx.page),
            pageSize: (__VLS_ctx.PAGE_SIZE),
            total: (__VLS_ctx.total),
            layout: "prev, pager, next",
            background: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    }
}
const __VLS_200 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    modelValue: (__VLS_ctx.detailOpen),
    title: "操作日志详情",
    size: "min(720px, 92vw)",
    appendToBody: true,
}));
const __VLS_202 = __VLS_201({
    modelValue: (__VLS_ctx.detailOpen),
    title: "操作日志详情",
    size: "min(720px, 92vw)",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
if (__VLS_ctx.selectedLog) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "detail-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    const __VLS_204 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        column: (2),
        border: true,
    }));
    const __VLS_206 = __VLS_205({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    const __VLS_208 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        label: "操作时间",
    }));
    const __VLS_210 = __VLS_209({
        label: "操作时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.selectedLog.created_at));
    var __VLS_211;
    const __VLS_212 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        label: "操作人",
    }));
    const __VLS_214 = __VLS_213({
        label: "操作人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    __VLS_215.slots.default;
    (__VLS_ctx.selectedLog.user_display_name || __VLS_ctx.selectedLog.metadata_json?.actor?.display_name || '系统');
    var __VLS_215;
    const __VLS_216 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
        label: "动作",
    }));
    const __VLS_218 = __VLS_217({
        label: "动作",
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    __VLS_219.slots.default;
    (__VLS_ctx.actionLabel(__VLS_ctx.selectedLog.action));
    var __VLS_219;
    const __VLS_220 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        label: "状态",
    }));
    const __VLS_222 = __VLS_221({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    __VLS_223.slots.default;
    (__VLS_ctx.statusLabel(__VLS_ctx.selectedLog.status));
    var __VLS_223;
    const __VLS_224 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        label: "报表",
    }));
    const __VLS_226 = __VLS_225({
        label: "报表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_227.slots.default;
    (__VLS_ctx.selectedLog.metadata_json?.report?.name || '—');
    var __VLS_227;
    const __VLS_228 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        label: "数据集 ID",
    }));
    const __VLS_230 = __VLS_229({
        label: "数据集 ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    __VLS_231.slots.default;
    (__VLS_ctx.selectedLog.metadata_json?.report?.dataset_id || '—');
    var __VLS_231;
    const __VLS_232 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
        label: "权限范围",
    }));
    const __VLS_234 = __VLS_233({
        label: "权限范围",
    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    __VLS_235.slots.default;
    (__VLS_ctx.selectedLog.metadata_json?.report?.scope_strategy || '—');
    var __VLS_235;
    const __VLS_236 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        label: "行数",
    }));
    const __VLS_238 = __VLS_237({
        label: "行数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    __VLS_239.slots.default;
    (__VLS_ctx.selectedLog.metadata_json?.content?.row_count ?? '—');
    var __VLS_239;
    var __VLS_207;
    if (__VLS_ctx.detailFields.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_240 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
            data: (__VLS_ctx.detailFields),
            size: "small",
            maxHeight: "280",
        }));
        const __VLS_242 = __VLS_241({
            data: (__VLS_ctx.detailFields),
            size: "small",
            maxHeight: "280",
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
        __VLS_243.slots.default;
        const __VLS_244 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
            prop: "label",
            label: "字段名称",
            minWidth: "160",
        }));
        const __VLS_246 = __VLS_245({
            prop: "label",
            label: "字段名称",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_245));
        const __VLS_248 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
            prop: "code",
            label: "字段编码",
            minWidth: "180",
            showOverflowTooltip: true,
        }));
        const __VLS_250 = __VLS_249({
            prop: "code",
            label: "字段编码",
            minWidth: "180",
            showOverflowTooltip: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_249));
        const __VLS_252 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
            prop: "data_type",
            label: "类型",
            width: "100",
        }));
        const __VLS_254 = __VLS_253({
            prop: "data_type",
            label: "类型",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_253));
        const __VLS_256 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            label: "敏感",
            width: "80",
            align: "center",
        }));
        const __VLS_258 = __VLS_257({
            label: "敏感",
            width: "80",
            align: "center",
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        __VLS_259.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_259.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.is_sensitive) {
                const __VLS_260 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
                    type: "danger",
                    size: "small",
                }));
                const __VLS_262 = __VLS_261({
                    type: "danger",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_261));
                __VLS_263.slots.default;
                var __VLS_263;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            }
        }
        var __VLS_259;
        var __VLS_243;
    }
    if (__VLS_ctx.detailFilters.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_264 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            data: (__VLS_ctx.detailFilters),
            size: "small",
            maxHeight: "220",
        }));
        const __VLS_266 = __VLS_265({
            data: (__VLS_ctx.detailFilters),
            size: "small",
            maxHeight: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        __VLS_267.slots.default;
        const __VLS_268 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
            prop: "source",
            label: "来源",
            width: "100",
        }));
        const __VLS_270 = __VLS_269({
            prop: "source",
            label: "来源",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_269));
        const __VLS_272 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
            prop: "column",
            label: "字段",
            minWidth: "160",
        }));
        const __VLS_274 = __VLS_273({
            prop: "column",
            label: "字段",
            minWidth: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_273));
        const __VLS_276 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
            prop: "op",
            label: "条件",
            width: "100",
        }));
        const __VLS_278 = __VLS_277({
            prop: "op",
            label: "条件",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_277));
        const __VLS_280 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
            label: "值指纹",
            minWidth: "150",
        }));
        const __VLS_282 = __VLS_281({
            label: "值指纹",
            minWidth: "150",
        }, ...__VLS_functionalComponentArgsRest(__VLS_281));
        __VLS_283.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_283.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (__VLS_ctx.shortHash(row.value_hmac));
        }
        var __VLS_283;
        var __VLS_267;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "privacy-note" },
        });
    }
    if (__VLS_ctx.detailTargets.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_284 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
            data: (__VLS_ctx.detailTargets),
            size: "small",
            maxHeight: "220",
        }));
        const __VLS_286 = __VLS_285({
            data: (__VLS_ctx.detailTargets),
            size: "small",
            maxHeight: "220",
        }, ...__VLS_functionalComponentArgsRest(__VLS_285));
        __VLS_287.slots.default;
        const __VLS_288 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
            prop: "name",
            label: "目标名称",
            minWidth: "180",
        }));
        const __VLS_290 = __VLS_289({
            prop: "name",
            label: "目标名称",
            minWidth: "180",
        }, ...__VLS_functionalComponentArgsRest(__VLS_289));
        const __VLS_292 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
            prop: "id",
            label: "目标 ID",
            width: "100",
        }));
        const __VLS_294 = __VLS_293({
            prop: "id",
            label: "目标 ID",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_293));
        const __VLS_296 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
            prop: "rows",
            label: "行数",
            width: "100",
            align: "right",
        }));
        const __VLS_298 = __VLS_297({
            prop: "rows",
            label: "行数",
            width: "100",
            align: "right",
        }, ...__VLS_functionalComponentArgsRest(__VLS_297));
        const __VLS_300 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
            label: "状态",
            width: "90",
            align: "center",
        }));
        const __VLS_302 = __VLS_301({
            label: "状态",
            width: "90",
            align: "center",
        }, ...__VLS_functionalComponentArgsRest(__VLS_301));
        __VLS_303.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_303.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_304 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
                type: (row.ok ? 'success' : 'danger'),
                size: "small",
                effect: "plain",
            }));
            const __VLS_306 = __VLS_305({
                type: (row.ok ? 'success' : 'danger'),
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_305));
            __VLS_307.slots.default;
            (row.ok ? '成功' : '失败');
            var __VLS_307;
        }
        var __VLS_303;
        var __VLS_287;
    }
    if (__VLS_ctx.selectedLog.metadata_json?.dimension_merge_diff) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "detail-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        const __VLS_308 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
            column: (2),
            border: true,
        }));
        const __VLS_310 = __VLS_309({
            column: (2),
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_309));
        __VLS_311.slots.default;
        const __VLS_312 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            label: "新增规则",
        }));
        const __VLS_314 = __VLS_313({
            label: "新增规则",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
        __VLS_315.slots.default;
        (__VLS_ctx.selectedLog.metadata_json.dimension_merge_diff.rules_added || 0);
        var __VLS_315;
        const __VLS_316 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
            label: "删除规则",
        }));
        const __VLS_318 = __VLS_317({
            label: "删除规则",
        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
        __VLS_319.slots.default;
        (__VLS_ctx.selectedLog.metadata_json.dimension_merge_diff.rules_removed || 0);
        var __VLS_319;
        const __VLS_320 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
            label: "修改规则",
        }));
        const __VLS_322 = __VLS_321({
            label: "修改规则",
        }, ...__VLS_functionalComponentArgsRest(__VLS_321));
        __VLS_323.slots.default;
        (__VLS_ctx.selectedLog.metadata_json.dimension_merge_diff.rules_modified || 0);
        var __VLS_323;
        const __VLS_324 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            label: "差异明细",
        }));
        const __VLS_326 = __VLS_325({
            label: "差异明细",
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        __VLS_327.slots.default;
        (__VLS_ctx.selectedLog.metadata_json.dimension_merge_diff.detail_count || 0);
        var __VLS_327;
        var __VLS_311;
        if (__VLS_ctx.mergeDetailError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "detail-load-error" },
                role: "alert",
            });
            (__VLS_ctx.mergeDetailError);
            const __VLS_328 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }));
            const __VLS_330 = __VLS_329({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_329));
            let __VLS_332;
            let __VLS_333;
            let __VLS_334;
            const __VLS_335 = {
                onClick: (__VLS_ctx.loadMergeDetails)
            };
            __VLS_331.slots.default;
            var __VLS_331;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_336 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
                data: (__VLS_ctx.mergeDetails),
                stripe: true,
                ...{ style: {} },
                maxHeight: "600",
            }));
            const __VLS_338 = __VLS_337({
                data: (__VLS_ctx.mergeDetails),
                stripe: true,
                ...{ style: {} },
                maxHeight: "600",
            }, ...__VLS_functionalComponentArgsRest(__VLS_337));
            __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.mergeDetailLoading) }, null, null);
            __VLS_339.slots.default;
            const __VLS_340 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
                label: "变化",
                width: "110",
            }));
            const __VLS_342 = __VLS_341({
                label: "变化",
                width: "110",
            }, ...__VLS_functionalComponentArgsRest(__VLS_341));
            __VLS_343.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_343.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (__VLS_ctx.detailChangeLabel(row.payload_json.change_type));
            }
            var __VLS_343;
            const __VLS_344 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
                label: "规则",
                minWidth: "150",
            }));
            const __VLS_346 = __VLS_345({
                label: "规则",
                minWidth: "150",
            }, ...__VLS_functionalComponentArgsRest(__VLS_345));
            __VLS_347.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_347.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.payload_json.rule_name || row.payload_json.after_name || row.payload_json.rule_id);
            }
            var __VLS_347;
            const __VLS_348 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
                label: "来源组合",
                minWidth: "240",
            }));
            const __VLS_350 = __VLS_349({
                label: "来源组合",
                minWidth: "240",
            }, ...__VLS_functionalComponentArgsRest(__VLS_349));
            __VLS_351.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_351.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                for (const [value, field] of __VLS_getVForSourceType(((row.payload_json.source || {})))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (field),
                        ...{ class: "diff-value" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (field);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (__VLS_ctx.auditValueLabel(value));
                }
                if (!row.payload_json.source) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
            }
            var __VLS_351;
            const __VLS_352 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
                label: "结果变化",
                minWidth: "260",
            }));
            const __VLS_354 = __VLS_353({
                label: "结果变化",
                minWidth: "260",
            }, ...__VLS_functionalComponentArgsRest(__VLS_353));
            __VLS_355.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_355.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                for (const [value, field] of __VLS_getVForSourceType(((row.payload_json.after_target || row.payload_json.target || {})))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (field),
                        ...{ class: "diff-value" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (field);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                    (__VLS_ctx.auditValueLabel(value));
                }
                if (!row.payload_json.after_target && !row.payload_json.target) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                }
            }
            var __VLS_355;
            var __VLS_339;
        }
        if (__VLS_ctx.mergeDetailTotal > 50) {
            const __VLS_356 = {}.ElPagination;
            /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
            // @ts-ignore
            const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
                currentPage: (__VLS_ctx.mergeDetailPage),
                pageSize: (50),
                total: (__VLS_ctx.mergeDetailTotal),
                layout: "prev, pager, next",
                ...{ style: {} },
            }));
            const __VLS_358 = __VLS_357({
                currentPage: (__VLS_ctx.mergeDetailPage),
                pageSize: (50),
                total: (__VLS_ctx.mergeDetailTotal),
                layout: "prev, pager, next",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_357));
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "detail-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    const __VLS_360 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
        column: (1),
        border: true,
    }));
    const __VLS_362 = __VLS_361({
        column: (1),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
    __VLS_363.slots.default;
    const __VLS_364 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
        label: "配置 Hash",
    }));
    const __VLS_366 = __VLS_365({
        label: "配置 Hash",
    }, ...__VLS_functionalComponentArgsRest(__VLS_365));
    __VLS_367.slots.default;
    (__VLS_ctx.selectedLog.input_hash || __VLS_ctx.selectedLog.metadata_json?.report?.config_hash || '—');
    var __VLS_367;
    const __VLS_368 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        label: "结果 Hash",
    }));
    const __VLS_370 = __VLS_369({
        label: "结果 Hash",
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
    __VLS_371.slots.default;
    (__VLS_ctx.selectedLog.output_hash || '—');
    var __VLS_371;
    const __VLS_372 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
        label: "Trace ID",
    }));
    const __VLS_374 = __VLS_373({
        label: "Trace ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_373));
    __VLS_375.slots.default;
    (__VLS_ctx.selectedLog.trace_id || '—');
    var __VLS_375;
    const __VLS_376 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
        label: "客户端 IP",
    }));
    const __VLS_378 = __VLS_377({
        label: "客户端 IP",
    }, ...__VLS_functionalComponentArgsRest(__VLS_377));
    __VLS_379.slots.default;
    (__VLS_ctx.selectedLog.metadata_json?.client?.ip || '—');
    var __VLS_379;
    const __VLS_380 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
        label: "User-Agent",
    }));
    const __VLS_382 = __VLS_381({
        label: "User-Agent",
    }, ...__VLS_functionalComponentArgsRest(__VLS_381));
    __VLS_383.slots.default;
    (__VLS_ctx.selectedLog.metadata_json?.client?.user_agent || '—');
    var __VLS_383;
    if (__VLS_ctx.selectedLog.error) {
        const __VLS_384 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
            label: "失败原因",
        }));
        const __VLS_386 = __VLS_385({
            label: "失败原因",
        }, ...__VLS_functionalComponentArgsRest(__VLS_385));
        __VLS_387.slots.default;
        (__VLS_ctx.selectedLog.error);
        var __VLS_387;
    }
    var __VLS_363;
}
var __VLS_203;
/** @type {__VLS_StyleScopedClasses['operation-log-page']} */ ;
/** @type {__VLS_StyleScopedClasses['log-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['log-filters']} */ ;
/** @type {__VLS_StyleScopedClasses['type-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['date-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['action-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['keyword-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['status-filter']} */ ;
/** @type {__VLS_StyleScopedClasses['log-error']} */ ;
/** @type {__VLS_StyleScopedClasses['log-table-region']} */ ;
/** @type {__VLS_StyleScopedClasses['log-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['privacy-note']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-load-error']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-value']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-value']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-section']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            Search: Search,
            View: View,
            formatDateTime: formatDateTime,
            LOG_TYPES: LOG_TYPES,
            REPORT_ACTIONS: REPORT_ACTIONS,
            PAGE_SIZE: PAGE_SIZE,
            loading: loading,
            loadError: loadError,
            rows: rows,
            total: total,
            page: page,
            logType: logType,
            action: action,
            statusFilter: statusFilter,
            operator: operator,
            keyword: keyword,
            dateRange: dateRange,
            selectedLog: selectedLog,
            mergeDetails: mergeDetails,
            mergeDetailTotal: mergeDetailTotal,
            mergeDetailPage: mergeDetailPage,
            mergeDetailLoading: mergeDetailLoading,
            mergeDetailError: mergeDetailError,
            isReportAccess: isReportAccess,
            detailFields: detailFields,
            detailFilters: detailFilters,
            detailTargets: detailTargets,
            detailOpen: detailOpen,
            actionLabel: actionLabel,
            statusType: statusType,
            statusLabel: statusLabel,
            auditValueLabel: auditValueLabel,
            detailChangeLabel: detailChangeLabel,
            loadMergeDetails: loadMergeDetails,
            shortHash: shortHash,
            load: load,
            reloadFromFirstPage: reloadFromFirstPage,
            changeLogType: changeLogType,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
