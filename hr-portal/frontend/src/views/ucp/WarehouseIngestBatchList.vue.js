/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ucpApi } from '@/api/ucp';
const props = defineProps();
const systems = ref([]);
const items = ref([]), loading = ref(false), detailVisible = ref(false), detail = ref(null);
const filters = reactive({ system_id: undefined, status: '', target_asset: '', period_value: '' });
const statuses = ['RECEIVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER'];
const detailKeys = ['batch_id', 'event_id', 'target_asset', 'period_value', 'status', 'received_rows', 'written_rows', 'pipeline_run_id', 'trace_id', 'received_at', 'processed_at'];
function statusType(s) { return s === 'SUCCEEDED' ? 'success' : ['FAILED', 'DEAD_LETTER'].includes(s) ? 'danger' : s === 'PROCESSING' ? 'warning' : 'info'; }
async function load() { loading.value = true; try {
    const res = await ucpApi.ingestBatches({ ...filters, resource_id: props.resourceId || undefined });
    items.value = res.items || [];
}
finally {
    loading.value = false;
} }
async function view(row) { detail.value = await ucpApi.ingestBatchDetail(String(row.resource_code || row.resource_id), row.batch_id).catch(() => row); detailVisible.value = true; }
async function replay(row) { try {
    await ElMessageBox.confirm(`确认重放批次「${row.batch_id}」？系统将只重放原始事件，不允许编辑内容。`, '重放确认', { type: 'warning' });
    await ucpApi.ingestBatchReplay(String(row.resource_code || row.resource_id), row.batch_id);
    ElMessage.success('批次已提交重放');
    await load();
}
catch (error) {
    if (error !== 'cancel')
        ElMessage.error(error?.response?.data?.detail || '重放失败');
} }
onMounted(async () => { systems.value = (await ucpApi.systems()).items || []; await load(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['batch-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-toolbar']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "batch-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "batch-toolbar" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.system_id),
    clearable: true,
    placeholder: "业务系统",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.system_id),
    clearable: true,
    placeholder: "业务系统",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.load)
};
__VLS_3.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (item.id),
        label: (item.system_name),
        value: (item.id),
    }));
    const __VLS_10 = __VLS_9({
        key: (item.id),
        label: (item.system_name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_3;
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onChange: (__VLS_ctx.load)
};
__VLS_15.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.statuses))) {
    const __VLS_20 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_22 = __VLS_21({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
var __VLS_15;
const __VLS_24 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.target_asset),
    clearable: true,
    placeholder: "目标资产",
}));
const __VLS_26 = __VLS_25({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.target_asset),
    clearable: true,
    placeholder: "目标资产",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onKeyup: (__VLS_ctx.load)
};
var __VLS_27;
const __VLS_32 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.period_value),
    clearable: true,
    placeholder: "期间",
}));
const __VLS_34 = __VLS_33({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.period_value),
    clearable: true,
    placeholder: "期间",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onKeyup: (__VLS_ctx.load)
};
var __VLS_35;
const __VLS_40 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_42 = __VLS_41({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onClick: (__VLS_ctx.load)
};
__VLS_43.slots.default;
var __VLS_43;
const __VLS_48 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_50 = __VLS_49({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_51.slots.default;
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    prop: "batch_id",
    label: "批次",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_54 = __VLS_53({
    prop: "batch_id",
    label: "批次",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
const __VLS_56 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    prop: "target_asset",
    label: "目标资产",
    minWidth: "170",
}));
const __VLS_58 = __VLS_57({
    prop: "target_asset",
    label: "目标资产",
    minWidth: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
const __VLS_60 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    prop: "period_value",
    label: "期间",
    width: "100",
}));
const __VLS_62 = __VLS_61({
    prop: "period_value",
    label: "期间",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
const __VLS_64 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    prop: "status",
    label: "状态",
    width: "140",
}));
const __VLS_66 = __VLS_65({
    prop: "status",
    label: "状态",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_67.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_68 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        type: (__VLS_ctx.statusType(row.status)),
    }));
    const __VLS_70 = __VLS_69({
        type: (__VLS_ctx.statusType(row.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    (row.status);
    var __VLS_71;
}
var __VLS_67;
const __VLS_72 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    label: "行数",
    width: "120",
}));
const __VLS_74 = __VLS_73({
    label: "行数",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_75.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.written_rows);
    (row.received_rows);
}
var __VLS_75;
const __VLS_76 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    prop: "trace_id",
    label: "Trace",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_78 = __VLS_77({
    prop: "trace_id",
    label: "Trace",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "操作",
    width: "150",
}));
const __VLS_82 = __VLS_81({
    label: "操作",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_83.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_84 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_86 = __VLS_85({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    let __VLS_88;
    let __VLS_89;
    let __VLS_90;
    const __VLS_91 = {
        onClick: (...[$event]) => {
            __VLS_ctx.view(row);
        }
    };
    __VLS_87.slots.default;
    var __VLS_87;
    if (['FAILED', 'DEAD_LETTER'].includes(row.status)) {
        const __VLS_92 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ 'onClick': {} },
            link: true,
            type: "warning",
        }));
        const __VLS_94 = __VLS_93({
            ...{ 'onClick': {} },
            link: true,
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        let __VLS_96;
        let __VLS_97;
        let __VLS_98;
        const __VLS_99 = {
            onClick: (...[$event]) => {
                if (!(['FAILED', 'DEAD_LETTER'].includes(row.status)))
                    return;
                __VLS_ctx.replay(row);
            }
        };
        __VLS_95.slots.default;
        var __VLS_95;
    }
}
var __VLS_83;
var __VLS_51;
const __VLS_100 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.detailVisible),
    title: "入仓批次详情",
    size: "480px",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.detailVisible),
    title: "入仓批次详情",
    size: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
if (__VLS_ctx.detail) {
    const __VLS_104 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        column: (1),
        border: true,
    }));
    const __VLS_106 = __VLS_105({
        column: (1),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    for (const [key] of __VLS_getVForSourceType((__VLS_ctx.detailKeys))) {
        const __VLS_108 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            key: (key),
            label: (key),
        }));
        const __VLS_110 = __VLS_109({
            key: (key),
            label: (key),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        __VLS_111.slots.default;
        (__VLS_ctx.detail[key] || '—');
        var __VLS_111;
    }
    var __VLS_107;
}
if (__VLS_ctx.detail?.error_summary) {
    const __VLS_112 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        type: "error",
        closable: (false),
        title: (__VLS_ctx.detail.error_summary),
        ...{ style: {} },
    }));
    const __VLS_114 = __VLS_113({
        type: "error",
        closable: (false),
        title: (__VLS_ctx.detail.error_summary),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
}
var __VLS_103;
/** @type {__VLS_StyleScopedClasses['batch-list']} */ ;
/** @type {__VLS_StyleScopedClasses['batch-toolbar']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            systems: systems,
            items: items,
            loading: loading,
            detailVisible: detailVisible,
            detail: detail,
            filters: filters,
            statuses: statuses,
            detailKeys: detailKeys,
            statusType: statusType,
            load: load,
            view: view,
            replay: replay,
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
