/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh, VideoPlay } from '@element-plus/icons-vue';
import { oaSyncApi } from '@/api/ucp';
import PermissionButton from '@/components/PermissionButton.vue';
const router = useRouter();
const runs = ref([]);
const loading = ref(false);
const runDetailVisible = ref(false);
const currentRun = ref(null);
const records = ref([]);
const recordsLoading = ref(false);
const recordFilter = ref('');
const triggerVisible = ref(false);
const triggerSubmitting = ref(false);
const approverInput = ref('');
const triggerForm = ref({
    trigger_type: 'MANUAL',
    approval_mode: 'ANY',
    high_risk_approvers: [],
});
const totalApprovalPending = computed(() => runs.value.reduce((sum, r) => sum + (r.approval_pending_count || 0), 0));
const countByStatus = (s) => runs.value.filter((r) => r.status === s).length;
const statusTagType = (s) => {
    switch (s) {
        case 'SUCCESS': return 'success';
        case 'FAILED': return 'danger';
        case 'RUNNING': return 'warning';
        case 'PENDING': return 'info';
        default: return '';
    }
};
const triggerTagType = (s) => {
    switch (s) {
        case 'SCHEDULED': return 'primary';
        case 'EVENT': return 'warning';
        case 'MANUAL': return 'info';
        default: return '';
    }
};
const diffTagType = (s) => {
    switch (s) {
        case 'CREATED': return 'success';
        case 'UPDATED': return 'warning';
        case 'MOVED': return 'info';
        case 'DELETED': return 'danger';
        case 'UNCHANGED': return '';
        default: return '';
    }
};
const processTagType = (s) => {
    switch (s) {
        case 'SYNCED': return 'success';
        case 'FAILED': return 'danger';
        case 'APPROVAL_PENDING': return 'warning';
        case 'SKIPPED': return 'info';
        default: return '';
    }
};
const formatTime = (s) => (s ? formatDateTime(s) : '-');
const loadRuns = async () => {
    loading.value = true;
    try {
        const items = await oaSyncApi.listRuns({ limit: 50, offset: 0 });
        runs.value = items;
    }
    catch (e) {
        ElMessage.error('加载批次列表失败: ' + (e?.message || e));
    }
    finally {
        loading.value = false;
    }
};
const openRunDetail = async (row) => {
    currentRun.value = row;
    runDetailVisible.value = true;
    recordFilter.value = '';
    await loadRecords();
};
const loadRecords = async () => {
    if (!currentRun.value)
        return;
    recordsLoading.value = true;
    try {
        const items = await oaSyncApi.listRecords(currentRun.value.id, {
            diff_type: recordFilter.value || undefined,
            limit: 200,
            offset: 0,
        });
        records.value = items;
    }
    catch (e) {
        ElMessage.error('加载差异记录失败: ' + (e?.message || e));
    }
    finally {
        recordsLoading.value = false;
    }
};
const goApproval = (id) => {
    router.push({ name: 'UcpApprovalInbox' });
    ElMessage.info(`请在审批工作台查看 #${id}`);
};
const openTriggerDialog = () => {
    triggerForm.value = {
        trigger_type: 'MANUAL',
        approval_mode: 'ANY',
        high_risk_approvers: [],
    };
    approverInput.value = '';
    triggerVisible.value = true;
};
const addApprover = () => {
    const userId = approverInput.value.trim();
    if (!userId)
        return;
    triggerForm.value.high_risk_approvers.push({ user_id: userId });
    approverInput.value = '';
};
const removeApprover = (idx) => {
    triggerForm.value.high_risk_approvers.splice(idx, 1);
};
const onTrigger = async () => {
    if (triggerForm.value.high_risk_approvers.length === 0) {
        ElMessage.warning('请至少添加一个审批人');
        return;
    }
    triggerSubmitting.value = true;
    try {
        const result = await oaSyncApi.trigger({
            trigger_type: triggerForm.value.trigger_type,
            approval_mode: triggerForm.value.approval_mode,
            high_risk_approvers: triggerForm.value.high_risk_approvers,
        });
        const approvalCount = Object.keys(result.approvals || {}).length;
        ElMessage.success(`同步完成, 共 ${result.total_orgs} 个组织, 生成 ${approvalCount} 个审批请求`);
        triggerVisible.value = false;
        loadRuns();
    }
    catch (e) {
        ElMessage.error('触发失败: ' + (e?.response?.data?.detail?.error_message || e?.message || e));
    }
    finally {
        triggerSubmitting.value = false;
    }
};
onMounted(() => {
    loadRuns();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "oa-sync" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-row" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "stat-card" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value" },
});
(__VLS_ctx.runs.length);
var __VLS_3;
const __VLS_4 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ class: "stat-card" },
}));
const __VLS_6 = __VLS_5({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-success" },
});
(__VLS_ctx.countByStatus('SUCCESS'));
var __VLS_7;
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "stat-card" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-danger" },
});
(__VLS_ctx.countByStatus('FAILED'));
var __VLS_11;
const __VLS_12 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ class: "stat-card" },
}));
const __VLS_14 = __VLS_13({
    ...{ class: "stat-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-value text-warning" },
});
(__VLS_ctx.totalApprovalPending);
var __VLS_15;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.loadRuns)
};
__VLS_19.slots.default;
var __VLS_19;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    menu: "ucp.executions",
    op: "C",
    type: "primary",
    icon: (__VLS_ctx.VideoPlay),
}));
const __VLS_25 = __VLS_24({
    ...{ 'onClick': {} },
    menu: "ucp.executions",
    op: "C",
    type: "primary",
    icon: (__VLS_ctx.VideoPlay),
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
let __VLS_27;
let __VLS_28;
let __VLS_29;
const __VLS_30 = {
    onClick: (__VLS_ctx.openTriggerDialog)
};
__VLS_26.slots.default;
var __VLS_26;
const __VLS_31 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    data: (__VLS_ctx.runs),
    stripe: true,
    border: true,
}));
const __VLS_33 = __VLS_32({
    data: (__VLS_ctx.runs),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_34.slots.default;
const __VLS_35 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    prop: "id",
    label: "ID",
    width: "70",
}));
const __VLS_37 = __VLS_36({
    prop: "id",
    label: "ID",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
const __VLS_39 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    prop: "run_code",
    label: "批次号",
    minWidth: "180",
}));
const __VLS_41 = __VLS_40({
    prop: "run_code",
    label: "批次号",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
const __VLS_43 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    prop: "trigger_type",
    label: "触发",
    width: "100",
}));
const __VLS_45 = __VLS_44({
    prop: "trigger_type",
    label: "触发",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
__VLS_46.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_46.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_47 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        size: "small",
        type: (__VLS_ctx.triggerTagType(row.trigger_type)),
    }));
    const __VLS_49 = __VLS_48({
        size: "small",
        type: (__VLS_ctx.triggerTagType(row.trigger_type)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    __VLS_50.slots.default;
    (row.trigger_type);
    var __VLS_50;
}
var __VLS_46;
const __VLS_51 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    prop: "status",
    label: "状态",
    width: "100",
}));
const __VLS_53 = __VLS_52({
    prop: "status",
    label: "状态",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
__VLS_54.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_54.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_55 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
        size: "small",
        type: (__VLS_ctx.statusTagType(row.status)),
    }));
    const __VLS_57 = __VLS_56({
        size: "small",
        type: (__VLS_ctx.statusTagType(row.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    __VLS_58.slots.default;
    (row.status);
    var __VLS_58;
}
var __VLS_54;
const __VLS_59 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    label: "差异统计",
    width: "320",
}));
const __VLS_61 = __VLS_60({
    label: "差异统计",
    width: "320",
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_62.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_62.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "diff-summary" },
    });
    const __VLS_63 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
        size: "small",
        type: "success",
    }));
    const __VLS_65 = __VLS_64({
        size: "small",
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    __VLS_66.slots.default;
    (row.created_count);
    var __VLS_66;
    const __VLS_67 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
        size: "small",
        type: "warning",
    }));
    const __VLS_69 = __VLS_68({
        size: "small",
        type: "warning",
    }, ...__VLS_functionalComponentArgsRest(__VLS_68));
    __VLS_70.slots.default;
    (row.updated_count);
    var __VLS_70;
    const __VLS_71 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
        size: "small",
        type: "info",
    }));
    const __VLS_73 = __VLS_72({
        size: "small",
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    __VLS_74.slots.default;
    (row.moved_count);
    var __VLS_74;
    const __VLS_75 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        size: "small",
        type: "danger",
    }));
    const __VLS_77 = __VLS_76({
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    __VLS_78.slots.default;
    (row.deleted_count);
    var __VLS_78;
    const __VLS_79 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
        size: "small",
    }));
    const __VLS_81 = __VLS_80({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_80));
    __VLS_82.slots.default;
    (row.unchanged_count);
    var __VLS_82;
}
var __VLS_62;
const __VLS_83 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    prop: "approval_pending_count",
    label: "待审批",
    width: "80",
    align: "center",
}));
const __VLS_85 = __VLS_84({
    prop: "approval_pending_count",
    label: "待审批",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
__VLS_86.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_86.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.approval_pending_count > 0) {
        const __VLS_87 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
            size: "small",
            type: "warning",
        }));
        const __VLS_89 = __VLS_88({
            size: "small",
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        __VLS_90.slots.default;
        (row.approval_pending_count);
        var __VLS_90;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
var __VLS_86;
const __VLS_91 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    prop: "triggered_by",
    label: "触发人",
    width: "120",
}));
const __VLS_93 = __VLS_92({
    prop: "triggered_by",
    label: "触发人",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
const __VLS_95 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
    prop: "started_at",
    label: "开始时间",
    width: "170",
}));
const __VLS_97 = __VLS_96({
    prop: "started_at",
    label: "开始时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_96));
__VLS_98.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_98.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.started_at));
}
var __VLS_98;
const __VLS_99 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
    label: "操作",
    width: "120",
    fixed: "right",
}));
const __VLS_101 = __VLS_100({
    label: "操作",
    width: "120",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
__VLS_102.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_102.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_103 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_105 = __VLS_104({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    let __VLS_107;
    let __VLS_108;
    let __VLS_109;
    const __VLS_110 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openRunDetail(row);
        }
    };
    __VLS_106.slots.default;
    var __VLS_106;
}
var __VLS_102;
var __VLS_34;
const __VLS_111 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
    modelValue: (__VLS_ctx.runDetailVisible),
    title: (`同步批次详情 - ${__VLS_ctx.currentRun?.run_code || ''}`),
    width: "900px",
}));
const __VLS_113 = __VLS_112({
    modelValue: (__VLS_ctx.runDetailVisible),
    title: (`同步批次详情 - ${__VLS_ctx.currentRun?.run_code || ''}`),
    width: "900px",
}, ...__VLS_functionalComponentArgsRest(__VLS_112));
__VLS_114.slots.default;
if (__VLS_ctx.currentRun) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_115 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
        column: (3),
        border: true,
    }));
    const __VLS_117 = __VLS_116({
        column: (3),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
    __VLS_118.slots.default;
    const __VLS_119 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
        label: "批次号",
    }));
    const __VLS_121 = __VLS_120({
        label: "批次号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_120));
    __VLS_122.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (__VLS_ctx.currentRun.run_code);
    var __VLS_122;
    const __VLS_123 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
        label: "状态",
    }));
    const __VLS_125 = __VLS_124({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_124));
    __VLS_126.slots.default;
    const __VLS_127 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
        type: (__VLS_ctx.statusTagType(__VLS_ctx.currentRun.status)),
    }));
    const __VLS_129 = __VLS_128({
        type: (__VLS_ctx.statusTagType(__VLS_ctx.currentRun.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_128));
    __VLS_130.slots.default;
    (__VLS_ctx.currentRun.status);
    var __VLS_130;
    var __VLS_126;
    const __VLS_131 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
        label: "触发",
    }));
    const __VLS_133 = __VLS_132({
        label: "触发",
    }, ...__VLS_functionalComponentArgsRest(__VLS_132));
    __VLS_134.slots.default;
    (__VLS_ctx.currentRun.trigger_type);
    var __VLS_134;
    const __VLS_135 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
        label: "源系统",
    }));
    const __VLS_137 = __VLS_136({
        label: "源系统",
    }, ...__VLS_functionalComponentArgsRest(__VLS_136));
    __VLS_138.slots.default;
    (__VLS_ctx.currentRun.source_system);
    var __VLS_138;
    const __VLS_139 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
        label: "目标系统",
    }));
    const __VLS_141 = __VLS_140({
        label: "目标系统",
    }, ...__VLS_functionalComponentArgsRest(__VLS_140));
    __VLS_142.slots.default;
    (__VLS_ctx.currentRun.target_system);
    var __VLS_142;
    const __VLS_143 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
        label: "触发人",
    }));
    const __VLS_145 = __VLS_144({
        label: "触发人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_144));
    __VLS_146.slots.default;
    (__VLS_ctx.currentRun.triggered_by || '-');
    var __VLS_146;
    const __VLS_147 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
        label: "开始时间",
    }));
    const __VLS_149 = __VLS_148({
        label: "开始时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_148));
    __VLS_150.slots.default;
    (__VLS_ctx.formatTime(__VLS_ctx.currentRun.started_at));
    var __VLS_150;
    const __VLS_151 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
        label: "结束时间",
        span: (2),
    }));
    const __VLS_153 = __VLS_152({
        label: "结束时间",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_152));
    __VLS_154.slots.default;
    (__VLS_ctx.formatTime(__VLS_ctx.currentRun.ended_at));
    var __VLS_154;
    if (__VLS_ctx.currentRun.error_message) {
        const __VLS_155 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
            label: "错误",
            span: (3),
        }));
        const __VLS_157 = __VLS_156({
            label: "错误",
            span: (3),
        }, ...__VLS_functionalComponentArgsRest(__VLS_156));
        __VLS_158.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-danger" },
        });
        (__VLS_ctx.currentRun.error_message);
        var __VLS_158;
    }
    var __VLS_118;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "filter-row" },
    });
    const __VLS_159 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.recordFilter),
    }));
    const __VLS_161 = __VLS_160({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.recordFilter),
    }, ...__VLS_functionalComponentArgsRest(__VLS_160));
    let __VLS_163;
    let __VLS_164;
    let __VLS_165;
    const __VLS_166 = {
        onChange: (__VLS_ctx.loadRecords)
    };
    __VLS_162.slots.default;
    const __VLS_167 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({
        value: "",
    }));
    const __VLS_169 = __VLS_168({
        value: "",
    }, ...__VLS_functionalComponentArgsRest(__VLS_168));
    __VLS_170.slots.default;
    var __VLS_170;
    const __VLS_171 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({
        value: "CREATED",
    }));
    const __VLS_173 = __VLS_172({
        value: "CREATED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_172));
    __VLS_174.slots.default;
    var __VLS_174;
    const __VLS_175 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_176 = __VLS_asFunctionalComponent(__VLS_175, new __VLS_175({
        value: "UPDATED",
    }));
    const __VLS_177 = __VLS_176({
        value: "UPDATED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_176));
    __VLS_178.slots.default;
    var __VLS_178;
    const __VLS_179 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({
        value: "MOVED",
    }));
    const __VLS_181 = __VLS_180({
        value: "MOVED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_180));
    __VLS_182.slots.default;
    var __VLS_182;
    const __VLS_183 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({
        value: "DELETED",
    }));
    const __VLS_185 = __VLS_184({
        value: "DELETED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_184));
    __VLS_186.slots.default;
    var __VLS_186;
    const __VLS_187 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
        value: "UNCHANGED",
    }));
    const __VLS_189 = __VLS_188({
        value: "UNCHANGED",
    }, ...__VLS_functionalComponentArgsRest(__VLS_188));
    __VLS_190.slots.default;
    var __VLS_190;
    var __VLS_162;
    const __VLS_191 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
        data: (__VLS_ctx.records),
        stripe: true,
        size: "small",
        border: true,
    }));
    const __VLS_193 = __VLS_192({
        data: (__VLS_ctx.records),
        stripe: true,
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_192));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.recordsLoading) }, null, null);
    __VLS_194.slots.default;
    const __VLS_195 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
        prop: "org_code",
        label: "组织 Code",
        minWidth: "160",
        showOverflowTooltip: true,
    }));
    const __VLS_197 = __VLS_196({
        prop: "org_code",
        label: "组织 Code",
        minWidth: "160",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_196));
    const __VLS_199 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({
        prop: "org_name",
        label: "组织名称",
        minWidth: "160",
        showOverflowTooltip: true,
    }));
    const __VLS_201 = __VLS_200({
        prop: "org_name",
        label: "组织名称",
        minWidth: "160",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_200));
    const __VLS_203 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
        prop: "parent_org_code",
        label: "父组织",
        width: "140",
    }));
    const __VLS_205 = __VLS_204({
        prop: "parent_org_code",
        label: "父组织",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_204));
    __VLS_206.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_206.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.parent_org_code) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (row.parent_org_code);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "empty" },
            });
        }
    }
    var __VLS_206;
    const __VLS_207 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
        prop: "diff_type",
        label: "差异",
        width: "100",
    }));
    const __VLS_209 = __VLS_208({
        prop: "diff_type",
        label: "差异",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_208));
    __VLS_210.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_210.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_211 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
            size: "small",
            type: (__VLS_ctx.diffTagType(row.diff_type)),
        }));
        const __VLS_213 = __VLS_212({
            size: "small",
            type: (__VLS_ctx.diffTagType(row.diff_type)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_212));
        __VLS_214.slots.default;
        (row.diff_type);
        var __VLS_214;
    }
    var __VLS_210;
    const __VLS_215 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
        prop: "process_status",
        label: "处理",
        width: "140",
    }));
    const __VLS_217 = __VLS_216({
        prop: "process_status",
        label: "处理",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_216));
    __VLS_218.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_218.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_219 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
            size: "small",
            type: (__VLS_ctx.processTagType(row.process_status)),
        }));
        const __VLS_221 = __VLS_220({
            size: "small",
            type: (__VLS_ctx.processTagType(row.process_status)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_220));
        __VLS_222.slots.default;
        (row.process_status);
        var __VLS_222;
        if (row.approval_id) {
            const __VLS_223 = {}.ElLink;
            /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
            // @ts-ignore
            const __VLS_224 = __VLS_asFunctionalComponent(__VLS_223, new __VLS_223({
                ...{ 'onClick': {} },
                type: "warning",
                underline: "never",
                ...{ style: {} },
            }));
            const __VLS_225 = __VLS_224({
                ...{ 'onClick': {} },
                type: "warning",
                underline: "never",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_224));
            let __VLS_227;
            let __VLS_228;
            let __VLS_229;
            const __VLS_230 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.currentRun))
                        return;
                    if (!(row.approval_id))
                        return;
                    __VLS_ctx.goApproval(row.approval_id);
                }
            };
            __VLS_226.slots.default;
            (row.approval_id);
            var __VLS_226;
        }
    }
    var __VLS_218;
    const __VLS_231 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
        prop: "synced_at",
        label: "同步时间",
        width: "170",
    }));
    const __VLS_233 = __VLS_232({
        prop: "synced_at",
        label: "同步时间",
        width: "170",
    }, ...__VLS_functionalComponentArgsRest(__VLS_232));
    __VLS_234.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_234.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatTime(row.synced_at));
    }
    var __VLS_234;
    var __VLS_194;
}
var __VLS_114;
const __VLS_235 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
    modelValue: (__VLS_ctx.triggerVisible),
    title: "触发 OA 同步",
    width: "540px",
}));
const __VLS_237 = __VLS_236({
    modelValue: (__VLS_ctx.triggerVisible),
    title: "触发 OA 同步",
    width: "540px",
}, ...__VLS_functionalComponentArgsRest(__VLS_236));
__VLS_238.slots.default;
const __VLS_239 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_241 = __VLS_240({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_240));
__VLS_242.slots.default;
var __VLS_242;
const __VLS_243 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
    model: (__VLS_ctx.triggerForm),
    labelWidth: "100px",
}));
const __VLS_245 = __VLS_244({
    model: (__VLS_ctx.triggerForm),
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_244));
__VLS_246.slots.default;
const __VLS_247 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
    label: "触发类型",
}));
const __VLS_249 = __VLS_248({
    label: "触发类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_248));
__VLS_250.slots.default;
const __VLS_251 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
    modelValue: (__VLS_ctx.triggerForm.trigger_type),
    ...{ style: {} },
}));
const __VLS_253 = __VLS_252({
    modelValue: (__VLS_ctx.triggerForm.trigger_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_252));
__VLS_254.slots.default;
const __VLS_255 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
    label: "MANUAL (手动)",
    value: "MANUAL",
}));
const __VLS_257 = __VLS_256({
    label: "MANUAL (手动)",
    value: "MANUAL",
}, ...__VLS_functionalComponentArgsRest(__VLS_256));
const __VLS_259 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
    label: "SCHEDULED (定时)",
    value: "SCHEDULED",
}));
const __VLS_261 = __VLS_260({
    label: "SCHEDULED (定时)",
    value: "SCHEDULED",
}, ...__VLS_functionalComponentArgsRest(__VLS_260));
const __VLS_263 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
    label: "EVENT (事件)",
    value: "EVENT",
}));
const __VLS_265 = __VLS_264({
    label: "EVENT (事件)",
    value: "EVENT",
}, ...__VLS_functionalComponentArgsRest(__VLS_264));
var __VLS_254;
var __VLS_250;
const __VLS_267 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
    label: "审批模式",
}));
const __VLS_269 = __VLS_268({
    label: "审批模式",
}, ...__VLS_functionalComponentArgsRest(__VLS_268));
__VLS_270.slots.default;
const __VLS_271 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
    modelValue: (__VLS_ctx.triggerForm.approval_mode),
    ...{ style: {} },
}));
const __VLS_273 = __VLS_272({
    modelValue: (__VLS_ctx.triggerForm.approval_mode),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_272));
__VLS_274.slots.default;
const __VLS_275 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
    label: "SINGLE (单人)",
    value: "SINGLE",
}));
const __VLS_277 = __VLS_276({
    label: "SINGLE (单人)",
    value: "SINGLE",
}, ...__VLS_functionalComponentArgsRest(__VLS_276));
const __VLS_279 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
    label: "ANY (或签)",
    value: "ANY",
}));
const __VLS_281 = __VLS_280({
    label: "ANY (或签)",
    value: "ANY",
}, ...__VLS_functionalComponentArgsRest(__VLS_280));
const __VLS_283 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_284 = __VLS_asFunctionalComponent(__VLS_283, new __VLS_283({
    label: "ALL (会签)",
    value: "ALL",
}));
const __VLS_285 = __VLS_284({
    label: "ALL (会签)",
    value: "ALL",
}, ...__VLS_functionalComponentArgsRest(__VLS_284));
var __VLS_274;
var __VLS_270;
const __VLS_287 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
    label: "审批人",
}));
const __VLS_289 = __VLS_288({
    label: "审批人",
}, ...__VLS_functionalComponentArgsRest(__VLS_288));
__VLS_290.slots.default;
const __VLS_291 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.approverInput),
    placeholder: "user_id (回车添加)",
}));
const __VLS_293 = __VLS_292({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.approverInput),
    placeholder: "user_id (回车添加)",
}, ...__VLS_functionalComponentArgsRest(__VLS_292));
let __VLS_295;
let __VLS_296;
let __VLS_297;
const __VLS_298 = {
    onKeyup: (__VLS_ctx.addApprover)
};
var __VLS_294;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "approver-list" },
});
for (const [a, idx] of __VLS_getVForSourceType((__VLS_ctx.triggerForm.high_risk_approvers))) {
    const __VLS_299 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_300 = __VLS_asFunctionalComponent(__VLS_299, new __VLS_299({
        ...{ 'onClose': {} },
        key: (idx),
        closable: true,
        ...{ style: {} },
    }));
    const __VLS_301 = __VLS_300({
        ...{ 'onClose': {} },
        key: (idx),
        closable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_300));
    let __VLS_303;
    let __VLS_304;
    let __VLS_305;
    const __VLS_306 = {
        onClose: (...[$event]) => {
            __VLS_ctx.removeApprover(idx);
        }
    };
    __VLS_302.slots.default;
    (a.user_id);
    (a.user_name ? ` (${a.user_name})` : '');
    var __VLS_302;
}
var __VLS_290;
var __VLS_246;
{
    const { footer: __VLS_thisSlot } = __VLS_238.slots;
    const __VLS_307 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
        ...{ 'onClick': {} },
    }));
    const __VLS_309 = __VLS_308({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_308));
    let __VLS_311;
    let __VLS_312;
    let __VLS_313;
    const __VLS_314 = {
        onClick: (...[$event]) => {
            __VLS_ctx.triggerVisible = false;
        }
    };
    __VLS_310.slots.default;
    var __VLS_310;
    const __VLS_315 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_316 = __VLS_asFunctionalComponent(__VLS_315, new __VLS_315({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.triggerSubmitting),
    }));
    const __VLS_317 = __VLS_316({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.triggerSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_316));
    let __VLS_319;
    let __VLS_320;
    let __VLS_321;
    const __VLS_322 = {
        onClick: (__VLS_ctx.onTrigger)
    };
    __VLS_318.slots.default;
    var __VLS_318;
}
var __VLS_238;
/** @type {__VLS_StyleScopedClasses['oa-sync']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-row']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-success']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-value']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-row']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['approver-list']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            VideoPlay: VideoPlay,
            PermissionButton: PermissionButton,
            runs: runs,
            loading: loading,
            runDetailVisible: runDetailVisible,
            currentRun: currentRun,
            records: records,
            recordsLoading: recordsLoading,
            recordFilter: recordFilter,
            triggerVisible: triggerVisible,
            triggerSubmitting: triggerSubmitting,
            approverInput: approverInput,
            triggerForm: triggerForm,
            totalApprovalPending: totalApprovalPending,
            countByStatus: countByStatus,
            statusTagType: statusTagType,
            triggerTagType: triggerTagType,
            diffTagType: diffTagType,
            processTagType: processTagType,
            formatTime: formatTime,
            loadRuns: loadRuns,
            openRunDetail: openRunDetail,
            loadRecords: loadRecords,
            goApproval: goApproval,
            openTriggerDialog: openTriggerDialog,
            addApprover: addApprover,
            removeApprover: removeApprover,
            onTrigger: onTrigger,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
