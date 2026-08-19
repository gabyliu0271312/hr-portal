/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh, Check, Close, Promotion, VideoPlay, Clock, } from '@element-plus/icons-vue';
import { approvalApi, controlledWriteApi } from '@/api/ucp';
import PermissionButton from '@/components/PermissionButton.vue';
const items = ref([]);
const totalCount = ref(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const filterStatus = ref('');
const activeTab = ref('todo');
const todoCount = ref(0);
const detailVisible = ref(false);
const current = ref(null);
const actionComment = ref('');
const actionSubmitting = ref(false);
const confirmationToken = ref('');
const transferVisible = ref(false);
const transferForm = ref({ to_user_id: '', to_user_name: '', comment: '' });
let transferTarget = null;
const statusTagType = (s) => {
    switch (s) {
        case 'PENDING': return 'warning';
        case 'APPROVED': return 'success';
        case 'REJECTED': return 'danger';
        case 'CANCELLED': return 'info';
        case 'EXPIRED': return '';
        default: return '';
    }
};
const stepTypeColor = (s) => {
    switch (s) {
        case 'APPROVED': return 'success';
        case 'REJECTED': return 'danger';
        case 'SKIPPED': return 'info';
        default: return 'primary';
    }
};
const formatTime = (s) => (s ? formatDateTime(s) : '-');
const onTabChange = () => {
    page.value = 1;
    loadList();
};
const onFilterChange = () => {
    page.value = 1;
    loadList();
};
const loadList = async () => {
    loading.value = true;
    try {
        const params = {
            status: filterStatus.value || undefined,
            limit: pageSize.value,
            offset: (page.value - 1) * pageSize.value,
        };
        if (activeTab.value === 'todo') {
            // 后端需要知道当前用户 ID, 这里暂通过用户上下文透传
            params.approver_id = '__current__'; // 占位, 实际由后端解析 current_user
        }
        else if (activeTab.value === 'submitted') {
            params.triggered_by = '__current__';
        }
        const all = await approvalApi.list(params);
        items.value = all;
        totalCount.value = all.length;
    }
    catch (e) {
        ElMessage.error('加载审批列表失败: ' + (e?.message || e));
    }
    finally {
        loading.value = false;
    }
};
const loadTodoCount = async () => {
    try {
        const r = await approvalApi.myTodo();
        todoCount.value = r.count;
    }
    catch {
        todoCount.value = 0;
    }
};
const openDetail = async (row) => {
    try {
        current.value = await approvalApi.getDetail(row.id);
        detailVisible.value = true;
        actionComment.value = '';
        confirmationToken.value = '';
    }
    catch (e) {
        ElMessage.error('加载审批详情失败: ' + (e?.message || e));
    }
};
const canApprove = (req) => {
    if (req.status !== 'PENDING')
        return false;
    return req.steps?.some((s) => s.status === 'PENDING') || false;
};
const canWithdraw = (req) => req.status === 'PENDING';
const canExecute = (req) => req.status === 'APPROVED' && !req.executed_at;
const onApprove = async (req) => {
    actionSubmitting.value = true;
    try {
        current.value = await approvalApi.doAction(req.id, {
            action: 'APPROVE',
            comment: actionComment.value,
        });
        ElMessage.success('已同意');
        loadList();
        loadTodoCount();
    }
    catch (e) {
        ElMessage.error('同意失败: ' + (e?.response?.data?.detail?.message || e?.message));
    }
    finally {
        actionSubmitting.value = false;
    }
};
const onReject = async (req) => {
    try {
        await ElMessageBox.confirm('确定拒绝此审批请求吗?', '确认', { type: 'warning' });
    }
    catch {
        return;
    }
    actionSubmitting.value = true;
    try {
        current.value = await approvalApi.doAction(req.id, {
            action: 'REJECT',
            comment: actionComment.value,
        });
        ElMessage.success('已拒绝');
        loadList();
        loadTodoCount();
    }
    catch (e) {
        ElMessage.error('拒绝失败: ' + (e?.response?.data?.detail?.message || e?.message));
    }
    finally {
        actionSubmitting.value = false;
    }
};
const onTransfer = (req) => {
    transferTarget = req;
    transferForm.value = { to_user_id: '', to_user_name: '', comment: '' };
    transferVisible.value = true;
};
const submitTransfer = async () => {
    if (!transferForm.value.to_user_id) {
        ElMessage.warning('请填写转交对象');
        return;
    }
    if (!transferTarget)
        return;
    actionSubmitting.value = true;
    try {
        current.value = await approvalApi.doAction(transferTarget.id, {
            action: 'TRANSFER',
            comment: transferForm.value.comment,
            to_user_id: transferForm.value.to_user_id,
            to_user_name: transferForm.value.to_user_name,
        });
        ElMessage.success('已转交');
        transferVisible.value = false;
        loadList();
        loadTodoCount();
    }
    catch (e) {
        ElMessage.error('转交失败: ' + (e?.response?.data?.detail?.message || e?.message));
    }
    finally {
        actionSubmitting.value = false;
    }
};
const onWithdraw = async (req) => {
    try {
        await ElMessageBox.confirm('确定撤回此审批请求吗?', '确认', { type: 'warning' });
    }
    catch {
        return;
    }
    actionSubmitting.value = true;
    try {
        current.value = await approvalApi.doAction(req.id, {
            action: 'WITHDRAW',
            comment: actionComment.value,
        });
        ElMessage.success('已撤回');
        detailVisible.value = false;
        loadList();
    }
    catch (e) {
        ElMessage.error('撤回失败: ' + (e?.response?.data?.detail?.message || e?.message));
    }
    finally {
        actionSubmitting.value = false;
    }
};
const onExecute = async (req) => {
    if (req.confirmation_type === 'TOKEN' && !confirmationToken.value) {
        ElMessage.warning('请输入二次确认令牌');
        return;
    }
    actionSubmitting.value = true;
    try {
        const executed = req.business_type === 'UCP_WRITE'
            ? await controlledWriteApi.execute(req.id, confirmationToken.value || undefined)
            : await approvalApi.doAction(req.id, {
                action: 'EXECUTE',
                confirmation_token: confirmationToken.value || undefined,
            });
        current.value = executed;
        ElMessage.success(executed.execution_result === 'SUCCESS'
            ? '执行成功'
            : `执行失败: ${executed.execution_error}`);
        loadList();
    }
    catch (e) {
        ElMessage.error('执行失败: ' + (e?.response?.data?.detail?.message || e?.message));
    }
    finally {
        actionSubmitting.value = false;
    }
};
const onScanExpired = async () => {
    try {
        const r = await approvalApi.scanExpired();
        ElMessage.success(`已扫描, ${r.expired_count} 个审批标记为过期`);
        loadList();
    }
    catch (e) {
        ElMessage.error('扫描失败: ' + (e?.message || e));
    }
};
onMounted(() => {
    loadList();
    loadTodoCount();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "approval-inbox" },
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
    ...{ 'onTabChange': {} },
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onTabChange': {} },
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onTabChange: (__VLS_ctx.onTabChange)
};
__VLS_3.slots.default;
const __VLS_8 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    label: (`我的待办 (${__VLS_ctx.todoCount})`),
    name: "todo",
}));
const __VLS_10 = __VLS_9({
    label: (`我的待办 (${__VLS_ctx.todoCount})`),
    name: "todo",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
const __VLS_12 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    label: "我提交的",
    name: "submitted",
}));
const __VLS_14 = __VLS_13({
    label: "我提交的",
    name: "submitted",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "全部",
    name: "all",
}));
const __VLS_18 = __VLS_17({
    label: "全部",
    name: "all",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onChange: (__VLS_ctx.onFilterChange)
};
__VLS_23.slots.default;
const __VLS_28 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "PENDING",
    value: "PENDING",
}));
const __VLS_30 = __VLS_29({
    label: "PENDING",
    value: "PENDING",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
const __VLS_32 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "APPROVED",
    value: "APPROVED",
}));
const __VLS_34 = __VLS_33({
    label: "APPROVED",
    value: "APPROVED",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "REJECTED",
    value: "REJECTED",
}));
const __VLS_38 = __VLS_37({
    label: "REJECTED",
    value: "REJECTED",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "CANCELLED",
    value: "CANCELLED",
}));
const __VLS_42 = __VLS_41({
    label: "CANCELLED",
    value: "CANCELLED",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
const __VLS_44 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "EXPIRED",
    value: "EXPIRED",
}));
const __VLS_46 = __VLS_45({
    label: "EXPIRED",
    value: "EXPIRED",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
var __VLS_23;
const __VLS_48 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_50 = __VLS_49({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onClick: (__VLS_ctx.loadList)
};
__VLS_51.slots.default;
var __VLS_51;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    menu: "ucp.external_accounts",
    op: "U",
    type: "warning",
    icon: (__VLS_ctx.Clock),
}));
const __VLS_57 = __VLS_56({
    ...{ 'onClick': {} },
    menu: "ucp.external_accounts",
    op: "U",
    type: "warning",
    icon: (__VLS_ctx.Clock),
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
let __VLS_59;
let __VLS_60;
let __VLS_61;
const __VLS_62 = {
    onClick: (__VLS_ctx.onScanExpired)
};
__VLS_58.slots.default;
var __VLS_58;
const __VLS_63 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_65 = __VLS_64({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_66.slots.default;
const __VLS_67 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    prop: "id",
    label: "ID",
    width: "70",
}));
const __VLS_69 = __VLS_68({
    prop: "id",
    label: "ID",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
const __VLS_71 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    prop: "request_code",
    label: "请求号",
    minWidth: "200",
}));
const __VLS_73 = __VLS_72({
    prop: "request_code",
    label: "请求号",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
const __VLS_75 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
    prop: "business_type",
    label: "业务类型",
    width: "180",
    showOverflowTooltip: true,
}));
const __VLS_77 = __VLS_76({
    prop: "business_type",
    label: "业务类型",
    width: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
const __VLS_79 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    prop: "business_key",
    label: "业务对象",
    width: "180",
    showOverflowTooltip: true,
}));
const __VLS_81 = __VLS_80({
    prop: "business_key",
    label: "业务对象",
    width: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
__VLS_82.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_82.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (row.business_key);
}
var __VLS_82;
const __VLS_83 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    prop: "action",
    label: "动作",
    width: "80",
}));
const __VLS_85 = __VLS_84({
    prop: "action",
    label: "动作",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
__VLS_86.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_86.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (row.action);
}
var __VLS_86;
const __VLS_87 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
    prop: "approval_mode",
    label: "模式",
    width: "80",
    align: "center",
}));
const __VLS_89 = __VLS_88({
    prop: "approval_mode",
    label: "模式",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_88));
const __VLS_91 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    prop: "status",
    label: "状态",
    width: "100",
}));
const __VLS_93 = __VLS_92({
    prop: "status",
    label: "状态",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
__VLS_94.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_94.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_95 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
        size: "small",
        type: (__VLS_ctx.statusTagType(row.status)),
    }));
    const __VLS_97 = __VLS_96({
        size: "small",
        type: (__VLS_ctx.statusTagType(row.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_96));
    __VLS_98.slots.default;
    (row.status);
    var __VLS_98;
}
var __VLS_94;
const __VLS_99 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
    label: "进度",
    width: "120",
    align: "center",
}));
const __VLS_101 = __VLS_100({
    label: "进度",
    width: "120",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
__VLS_102.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_102.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_103 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        size: "small",
        type: "success",
    }));
    const __VLS_105 = __VLS_104({
        size: "small",
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    __VLS_106.slots.default;
    (row.approved_count);
    var __VLS_106;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.total_steps);
}
var __VLS_102;
const __VLS_107 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
    prop: "triggered_by",
    label: "提交人",
    width: "120",
}));
const __VLS_109 = __VLS_108({
    prop: "triggered_by",
    label: "提交人",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_108));
const __VLS_111 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
    prop: "expires_at",
    label: "过期时间",
    width: "170",
}));
const __VLS_113 = __VLS_112({
    prop: "expires_at",
    label: "过期时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_112));
__VLS_114.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_114.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.expires_at));
}
var __VLS_114;
const __VLS_115 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
    prop: "created_at",
    label: "提交时间",
    width: "170",
}));
const __VLS_117 = __VLS_116({
    prop: "created_at",
    label: "提交时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_116));
__VLS_118.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_118.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.created_at));
}
var __VLS_118;
const __VLS_119 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
    label: "操作",
    width: "120",
    fixed: "right",
}));
const __VLS_121 = __VLS_120({
    label: "操作",
    width: "120",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_120));
__VLS_122.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_122.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_123 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_125 = __VLS_124({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_124));
    let __VLS_127;
    let __VLS_128;
    let __VLS_129;
    const __VLS_130 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openDetail(row);
        }
    };
    __VLS_126.slots.default;
    var __VLS_126;
}
var __VLS_122;
var __VLS_66;
const __VLS_131 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.totalCount),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_133 = __VLS_132({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "pager" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.totalCount),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_132));
let __VLS_135;
let __VLS_136;
let __VLS_137;
const __VLS_138 = {
    onCurrentChange: (__VLS_ctx.loadList)
};
const __VLS_139 = {
    onSizeChange: (__VLS_ctx.loadList)
};
var __VLS_134;
const __VLS_140 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.detailVisible),
    title: (`审批详情 - ${__VLS_ctx.current?.request_code || ''}`),
    width: "900px",
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.detailVisible),
    title: (`审批详情 - ${__VLS_ctx.current?.request_code || ''}`),
    width: "900px",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
if (__VLS_ctx.current) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_144 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        column: (2),
        border: true,
    }));
    const __VLS_146 = __VLS_145({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_147.slots.default;
    const __VLS_148 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        label: "请求号",
    }));
    const __VLS_150 = __VLS_149({
        label: "请求号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    __VLS_151.slots.default;
    (__VLS_ctx.current.request_code);
    var __VLS_151;
    const __VLS_152 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        label: "业务类型",
    }));
    const __VLS_154 = __VLS_153({
        label: "业务类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_155.slots.default;
    (__VLS_ctx.current.business_type);
    var __VLS_155;
    const __VLS_156 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        label: "业务对象",
    }));
    const __VLS_158 = __VLS_157({
        label: "业务对象",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (__VLS_ctx.current.business_key);
    var __VLS_159;
    const __VLS_160 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        label: "动作",
    }));
    const __VLS_162 = __VLS_161({
        label: "动作",
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (__VLS_ctx.current.action);
    var __VLS_163;
    const __VLS_164 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        label: "审批模式",
    }));
    const __VLS_166 = __VLS_165({
        label: "审批模式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    (__VLS_ctx.current.approval_mode);
    var __VLS_167;
    const __VLS_168 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        label: "二次确认",
    }));
    const __VLS_170 = __VLS_169({
        label: "二次确认",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    __VLS_171.slots.default;
    (__VLS_ctx.current.confirmation_type);
    if (__VLS_ctx.current.confirmation_token) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
            ...{ class: "text-warning" },
        });
        (__VLS_ctx.current.confirmation_token);
    }
    var __VLS_171;
    const __VLS_172 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "状态",
    }));
    const __VLS_174 = __VLS_173({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    const __VLS_176 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        type: (__VLS_ctx.statusTagType(__VLS_ctx.current.status)),
    }));
    const __VLS_178 = __VLS_177({
        type: (__VLS_ctx.statusTagType(__VLS_ctx.current.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    (__VLS_ctx.current.status);
    var __VLS_179;
    var __VLS_175;
    const __VLS_180 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        label: "进度",
    }));
    const __VLS_182 = __VLS_181({
        label: "进度",
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
    __VLS_183.slots.default;
    const __VLS_184 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        size: "small",
        type: "success",
    }));
    const __VLS_186 = __VLS_185({
        size: "small",
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    (__VLS_ctx.current.approved_count);
    var __VLS_187;
    (__VLS_ctx.current.total_steps);
    var __VLS_183;
    const __VLS_188 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        label: "提交人",
    }));
    const __VLS_190 = __VLS_189({
        label: "提交人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    (__VLS_ctx.current.triggered_by);
    var __VLS_191;
    const __VLS_192 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        label: "触发来源",
    }));
    const __VLS_194 = __VLS_193({
        label: "触发来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    (__VLS_ctx.current.trigger_source);
    var __VLS_195;
    if (__VLS_ctx.current.reason) {
        const __VLS_196 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            label: "申请理由",
            span: (2),
        }));
        const __VLS_198 = __VLS_197({
            label: "申请理由",
            span: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        __VLS_199.slots.default;
        (__VLS_ctx.current.reason);
        var __VLS_199;
    }
    if (__VLS_ctx.current.business_summary) {
        const __VLS_200 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            label: "业务摘要",
            span: (2),
        }));
        const __VLS_202 = __VLS_201({
            label: "业务摘要",
            span: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        __VLS_203.slots.default;
        (__VLS_ctx.current.business_summary);
        var __VLS_203;
    }
    if (__VLS_ctx.current.action_payload) {
        const __VLS_204 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            label: "动作参数",
            span: (2),
        }));
        const __VLS_206 = __VLS_205({
            label: "动作参数",
            span: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        __VLS_207.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
            ...{ class: "json-block" },
        });
        (JSON.stringify(__VLS_ctx.current.action_payload, null, 2));
        var __VLS_207;
    }
    if (__VLS_ctx.current.execution_error) {
        const __VLS_208 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
            label: "执行错误",
            span: (2),
        }));
        const __VLS_210 = __VLS_209({
            label: "执行错误",
            span: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        __VLS_211.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-danger" },
        });
        (__VLS_ctx.current.execution_error);
        var __VLS_211;
    }
    var __VLS_147;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "section-title" },
    });
    const __VLS_212 = {}.ElTimeline;
    /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({}));
    const __VLS_214 = __VLS_213({}, ...__VLS_functionalComponentArgsRest(__VLS_213));
    __VLS_215.slots.default;
    for (const [step] of __VLS_getVForSourceType((__VLS_ctx.current.steps))) {
        const __VLS_216 = {}.ElTimelineItem;
        /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            key: (step.id),
            type: (__VLS_ctx.stepTypeColor(step.status)),
            timestamp: (__VLS_ctx.formatTime(step.action_at) || '待审批'),
        }));
        const __VLS_218 = __VLS_217({
            key: (step.id),
            type: (__VLS_ctx.stepTypeColor(step.status)),
            timestamp: (__VLS_ctx.formatTime(step.action_at) || '待审批'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (step.approver_name || step.approver_id);
        const __VLS_220 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            size: "small",
            type: (__VLS_ctx.stepTypeColor(step.status)),
            ...{ style: {} },
        }));
        const __VLS_222 = __VLS_221({
            size: "small",
            type: (__VLS_ctx.stepTypeColor(step.status)),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        (step.status);
        var __VLS_223;
        if (step.comment) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "step-comment" },
            });
            (step.comment);
        }
        if (step.transferred_to) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "step-comment" },
            });
            (step.transferred_to);
        }
        var __VLS_219;
    }
    var __VLS_215;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "section-title" },
    });
    const __VLS_224 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        data: (__VLS_ctx.current.actions || []),
        size: "small",
        border: true,
    }));
    const __VLS_226 = __VLS_225({
        data: (__VLS_ctx.current.actions || []),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_227.slots.default;
    const __VLS_228 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        prop: "action",
        label: "动作",
        width: "100",
    }));
    const __VLS_230 = __VLS_229({
        prop: "action",
        label: "动作",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    __VLS_231.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_231.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.action);
    }
    var __VLS_231;
    const __VLS_232 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
        prop: "operator_name",
        label: "操作人",
        width: "120",
    }));
    const __VLS_234 = __VLS_233({
        prop: "operator_name",
        label: "操作人",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    const __VLS_236 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        prop: "comment",
        label: "备注",
        minWidth: "200",
        showOverflowTooltip: true,
    }));
    const __VLS_238 = __VLS_237({
        prop: "comment",
        label: "备注",
        minWidth: "200",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    const __VLS_240 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        prop: "created_at",
        label: "时间",
        width: "170",
    }));
    const __VLS_242 = __VLS_241({
        prop: "created_at",
        label: "时间",
        width: "170",
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    __VLS_243.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_243.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatTime(row.created_at));
    }
    var __VLS_243;
    var __VLS_227;
    if (__VLS_ctx.canApprove(__VLS_ctx.current)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-bar" },
        });
        const __VLS_244 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
            modelValue: (__VLS_ctx.actionComment),
            type: "textarea",
            rows: (2),
            placeholder: "审批意见 (可选)",
            ...{ style: {} },
        }));
        const __VLS_246 = __VLS_245({
            modelValue: (__VLS_ctx.actionComment),
            type: "textarea",
            rows: (2),
            placeholder: "审批意见 (可选)",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_245));
        const __VLS_248 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
            ...{ 'onClick': {} },
            type: "success",
            icon: (__VLS_ctx.Check),
            loading: (__VLS_ctx.actionSubmitting),
        }));
        const __VLS_250 = __VLS_249({
            ...{ 'onClick': {} },
            type: "success",
            icon: (__VLS_ctx.Check),
            loading: (__VLS_ctx.actionSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_249));
        let __VLS_252;
        let __VLS_253;
        let __VLS_254;
        const __VLS_255 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.current))
                    return;
                if (!(__VLS_ctx.canApprove(__VLS_ctx.current)))
                    return;
                __VLS_ctx.onApprove(__VLS_ctx.current);
            }
        };
        __VLS_251.slots.default;
        var __VLS_251;
        const __VLS_256 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            ...{ 'onClick': {} },
            type: "danger",
            icon: (__VLS_ctx.Close),
            loading: (__VLS_ctx.actionSubmitting),
        }));
        const __VLS_258 = __VLS_257({
            ...{ 'onClick': {} },
            type: "danger",
            icon: (__VLS_ctx.Close),
            loading: (__VLS_ctx.actionSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        let __VLS_260;
        let __VLS_261;
        let __VLS_262;
        const __VLS_263 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.current))
                    return;
                if (!(__VLS_ctx.canApprove(__VLS_ctx.current)))
                    return;
                __VLS_ctx.onReject(__VLS_ctx.current);
            }
        };
        __VLS_259.slots.default;
        var __VLS_259;
        const __VLS_264 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            ...{ 'onClick': {} },
            type: "warning",
            icon: (__VLS_ctx.Promotion),
        }));
        const __VLS_266 = __VLS_265({
            ...{ 'onClick': {} },
            type: "warning",
            icon: (__VLS_ctx.Promotion),
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        let __VLS_268;
        let __VLS_269;
        let __VLS_270;
        const __VLS_271 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.current))
                    return;
                if (!(__VLS_ctx.canApprove(__VLS_ctx.current)))
                    return;
                __VLS_ctx.onTransfer(__VLS_ctx.current);
            }
        };
        __VLS_267.slots.default;
        var __VLS_267;
    }
    else if (__VLS_ctx.canWithdraw(__VLS_ctx.current)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-bar" },
        });
        const __VLS_272 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
            ...{ 'onClick': {} },
            type: "info",
            icon: (__VLS_ctx.Refresh),
            loading: (__VLS_ctx.actionSubmitting),
        }));
        const __VLS_274 = __VLS_273({
            ...{ 'onClick': {} },
            type: "info",
            icon: (__VLS_ctx.Refresh),
            loading: (__VLS_ctx.actionSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_273));
        let __VLS_276;
        let __VLS_277;
        let __VLS_278;
        const __VLS_279 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.current))
                    return;
                if (!!(__VLS_ctx.canApprove(__VLS_ctx.current)))
                    return;
                if (!(__VLS_ctx.canWithdraw(__VLS_ctx.current)))
                    return;
                __VLS_ctx.onWithdraw(__VLS_ctx.current);
            }
        };
        __VLS_275.slots.default;
        var __VLS_275;
    }
    else if (__VLS_ctx.canExecute(__VLS_ctx.current)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-bar" },
        });
        if (__VLS_ctx.current.confirmation_type === 'TOKEN') {
            const __VLS_280 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                type: "warning",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }));
            const __VLS_282 = __VLS_281({
                type: "warning",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_281));
            __VLS_283.slots.default;
            var __VLS_283;
        }
        if (__VLS_ctx.current.confirmation_type === 'TOKEN') {
            const __VLS_284 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                modelValue: (__VLS_ctx.confirmationToken),
                placeholder: "输入二次确认令牌",
                ...{ style: {} },
            }));
            const __VLS_286 = __VLS_285({
                modelValue: (__VLS_ctx.confirmationToken),
                placeholder: "输入二次确认令牌",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_285));
        }
        const __VLS_288 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.VideoPlay),
            loading: (__VLS_ctx.actionSubmitting),
        }));
        const __VLS_290 = __VLS_289({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.VideoPlay),
            loading: (__VLS_ctx.actionSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_289));
        let __VLS_292;
        let __VLS_293;
        let __VLS_294;
        const __VLS_295 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.current))
                    return;
                if (!!(__VLS_ctx.canApprove(__VLS_ctx.current)))
                    return;
                if (!!(__VLS_ctx.canWithdraw(__VLS_ctx.current)))
                    return;
                if (!(__VLS_ctx.canExecute(__VLS_ctx.current)))
                    return;
                __VLS_ctx.onExecute(__VLS_ctx.current);
            }
        };
        __VLS_291.slots.default;
        var __VLS_291;
    }
}
var __VLS_143;
const __VLS_296 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
    modelValue: (__VLS_ctx.transferVisible),
    title: "转交审批",
    width: "420px",
}));
const __VLS_298 = __VLS_297({
    modelValue: (__VLS_ctx.transferVisible),
    title: "转交审批",
    width: "420px",
}, ...__VLS_functionalComponentArgsRest(__VLS_297));
__VLS_299.slots.default;
const __VLS_300 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
    model: (__VLS_ctx.transferForm),
    labelWidth: "100px",
}));
const __VLS_302 = __VLS_301({
    model: (__VLS_ctx.transferForm),
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_301));
__VLS_303.slots.default;
const __VLS_304 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
    label: "转交给",
}));
const __VLS_306 = __VLS_305({
    label: "转交给",
}, ...__VLS_functionalComponentArgsRest(__VLS_305));
__VLS_307.slots.default;
const __VLS_308 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
    modelValue: (__VLS_ctx.transferForm.to_user_id),
    placeholder: "用户 ID",
}));
const __VLS_310 = __VLS_309({
    modelValue: (__VLS_ctx.transferForm.to_user_id),
    placeholder: "用户 ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_309));
var __VLS_307;
const __VLS_312 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
    label: "用户姓名",
}));
const __VLS_314 = __VLS_313({
    label: "用户姓名",
}, ...__VLS_functionalComponentArgsRest(__VLS_313));
__VLS_315.slots.default;
const __VLS_316 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
    modelValue: (__VLS_ctx.transferForm.to_user_name),
    placeholder: "(可选) 用于显示",
}));
const __VLS_318 = __VLS_317({
    modelValue: (__VLS_ctx.transferForm.to_user_name),
    placeholder: "(可选) 用于显示",
}, ...__VLS_functionalComponentArgsRest(__VLS_317));
var __VLS_315;
const __VLS_320 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
    label: "备注",
}));
const __VLS_322 = __VLS_321({
    label: "备注",
}, ...__VLS_functionalComponentArgsRest(__VLS_321));
__VLS_323.slots.default;
const __VLS_324 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
    modelValue: (__VLS_ctx.transferForm.comment),
    type: "textarea",
    rows: (2),
}));
const __VLS_326 = __VLS_325({
    modelValue: (__VLS_ctx.transferForm.comment),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_325));
var __VLS_323;
var __VLS_303;
{
    const { footer: __VLS_thisSlot } = __VLS_299.slots;
    const __VLS_328 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
        ...{ 'onClick': {} },
    }));
    const __VLS_330 = __VLS_329({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_329));
    let __VLS_332;
    let __VLS_333;
    let __VLS_334;
    const __VLS_335 = {
        onClick: (...[$event]) => {
            __VLS_ctx.transferVisible = false;
        }
    };
    __VLS_331.slots.default;
    var __VLS_331;
    const __VLS_336 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.actionSubmitting),
    }));
    const __VLS_338 = __VLS_337({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.actionSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_337));
    let __VLS_340;
    let __VLS_341;
    let __VLS_342;
    const __VLS_343 = {
        onClick: (__VLS_ctx.submitTransfer)
    };
    __VLS_339.slots.default;
    var __VLS_339;
}
var __VLS_299;
/** @type {__VLS_StyleScopedClasses['approval-inbox']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['pager']} */ ;
/** @type {__VLS_StyleScopedClasses['text-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['json-block']} */ ;
/** @type {__VLS_StyleScopedClasses['text-danger']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['step-comment']} */ ;
/** @type {__VLS_StyleScopedClasses['step-comment']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['action-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['action-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['action-bar']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            Check: Check,
            Close: Close,
            Promotion: Promotion,
            VideoPlay: VideoPlay,
            Clock: Clock,
            PermissionButton: PermissionButton,
            items: items,
            totalCount: totalCount,
            loading: loading,
            page: page,
            pageSize: pageSize,
            filterStatus: filterStatus,
            activeTab: activeTab,
            todoCount: todoCount,
            detailVisible: detailVisible,
            current: current,
            actionComment: actionComment,
            actionSubmitting: actionSubmitting,
            confirmationToken: confirmationToken,
            transferVisible: transferVisible,
            transferForm: transferForm,
            statusTagType: statusTagType,
            stepTypeColor: stepTypeColor,
            formatTime: formatTime,
            onTabChange: onTabChange,
            onFilterChange: onFilterChange,
            loadList: loadList,
            openDetail: openDetail,
            canApprove: canApprove,
            canWithdraw: canWithdraw,
            canExecute: canExecute,
            onApprove: onApprove,
            onReject: onReject,
            onTransfer: onTransfer,
            submitTransfer: submitTransfer,
            onWithdraw: onWithdraw,
            onExecute: onExecute,
            onScanExpired: onScanExpired,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
