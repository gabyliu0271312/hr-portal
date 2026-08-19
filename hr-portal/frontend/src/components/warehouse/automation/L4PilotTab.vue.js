/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CircleCheck, Refresh } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { getWarehouseFeatures, listL4Approvals, createL4Approval, approveL4Approval, rejectL4Approval, revokeL4Approval, listMetrics, getL4Timeline, rollbackL4Metric, getL4Status } from '@/api/warehouse';
const userStore = useUserStore();
const isAdmin = userStore.hasOp('warehouse.metrics', 'U'); // U=更新权限 → 管理员
const featureEnabled = ref(false);
const loading = ref(true);
const approvals = ref([]);
const emergencyStopped = ref(false);
const showCreate = ref(false);
const creating = ref(false);
const createForm = ref({ metric_id: undefined, max_auto_frequency: 1, auto_rollback_enabled: true, reason: '' });
const metrics = ref([]);
const showTimeline = ref(false);
const timelineMetricId = ref(null);
const timelineData = ref(null);
const RISK_LABELS = { low: '低风险', medium: '中风险', high: '高风险' };
const STATUS_LABELS = { pending: '审批中', approved: '已通过', rejected: '已驳回', revoked: '已撤销' };
const STATUS_TAG = { pending: 'warning', approved: 'success', rejected: 'info', revoked: 'info' };
async function load() {
    loading.value = true;
    try {
        const f = await getWarehouseFeatures();
        featureEnabled.value = f.l4_full_auto;
        if (featureEnabled.value) {
            approvals.value = await listL4Approvals();
            try {
                const s = await getL4Status();
                emergencyStopped.value = s?.emergency_stop || false;
            }
            catch { }
        }
    }
    catch {
        featureEnabled.value = false;
        approvals.value = [];
    }
    finally {
        loading.value = false;
    }
}
async function doApprove(a) {
    try {
        await approveL4Approval(a.id);
        ElMessage.success(`已通过 ${a.metric_name}`);
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function doReject(a) {
    try {
        const { value } = await ElMessageBox.prompt('驳回原因（可选）', '驳回试点申请', { confirmButtonText: '确定驳回', cancelButtonText: '取消' });
        await rejectL4Approval(a.id, value || undefined);
        ElMessage.success(`已驳回 ${a.metric_name}`);
        await load();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function doRevoke(a) {
    try {
        await ElMessageBox.confirm(`确定撤销 ${a.metric_name} 的试点？`, '确认撤销', { type: 'warning' });
        await revokeL4Approval(a.id);
        ElMessage.success('已撤销');
        await load();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function openCreate() {
    try {
        const r = await listMetrics({ page: 1, page_size: 100 });
        metrics.value = r.items || [];
    }
    catch {
        metrics.value = [];
    }
    createForm.value = { metric_id: undefined, max_auto_frequency: 1, auto_rollback_enabled: true, reason: '' };
    showCreate.value = true;
}
async function doCreate() {
    if (!createForm.value.metric_id) {
        ElMessage.warning('请选择指标');
        return;
    }
    creating.value = true;
    try {
        await createL4Approval({ metric_id: createForm.value.metric_id, max_auto_frequency: createForm.value.max_auto_frequency, auto_rollback_enabled: createForm.value.auto_rollback_enabled, reason: createForm.value.reason });
        ElMessage.success('试点申请已提交');
        showCreate.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
    finally {
        creating.value = false;
    }
}
async function openTimeline(metricId) {
    timelineMetricId.value = metricId;
    showTimeline.value = true;
    try {
        timelineData.value = await getL4Timeline(metricId);
    }
    catch {
        timelineData.value = null;
    }
}
const rollbackTarget = ref(null);
const showRollbackConfirm = ref(false);
async function doRollback(row) {
    try {
        const tl = await getL4Timeline(row.metric_id);
        rollbackTarget.value = { metric_name: row.metric_name || row.metric_code || `#${row.metric_id}`, metric_id: row.metric_id, timeline: tl };
        showRollbackConfirm.value = true;
    }
    catch (e) {
        ElMessage.error('无法加载审计信息');
    }
}
async function confirmRollback() {
    if (!rollbackTarget.value)
        return;
    try {
        const r = await rollbackL4Metric(rollbackTarget.value.metric_id);
        ElMessage.success(r.message || '回滚完成');
        showRollbackConfirm.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
if (!__VLS_ctx.featureEnabled && !__VLS_ctx.loading) {
    const __VLS_0 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_3.slots;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    var __VLS_3;
}
if (__VLS_ctx.featureEnabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.isAdmin) {
        const __VLS_4 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
            icon: (__VLS_ctx.CircleCheck),
        }));
        const __VLS_6 = __VLS_5({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
            icon: (__VLS_ctx.CircleCheck),
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        let __VLS_8;
        let __VLS_9;
        let __VLS_10;
        const __VLS_11 = {
            onClick: (__VLS_ctx.openCreate)
        };
        __VLS_7.slots.default;
        var __VLS_7;
    }
    const __VLS_12 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Refresh),
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Refresh),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_15.slots.default;
    var __VLS_15;
    if (!__VLS_ctx.isAdmin) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
if (__VLS_ctx.featureEnabled) {
    const __VLS_20 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        data: (__VLS_ctx.approvals),
        border: true,
        stripe: true,
        size: "default",
        emptyText: "暂无试点申请",
    }));
    const __VLS_22 = __VLS_21({
        data: (__VLS_ctx.approvals),
        border: true,
        stripe: true,
        size: "default",
        emptyText: "暂无试点申请",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_23.slots.default;
    const __VLS_24 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        label: "指标",
        minWidth: "160",
    }));
    const __VLS_26 = __VLS_25({
        label: "指标",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_27.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.metric_name || row.metric_code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (row.metric_id);
    }
    var __VLS_27;
    const __VLS_28 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        prop: "requested_by",
        label: "申请人",
        width: "80",
    }));
    const __VLS_30 = __VLS_29({
        prop: "requested_by",
        label: "申请人",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    const __VLS_32 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        label: "风险等级",
        width: "90",
    }));
    const __VLS_34 = __VLS_33({
        label: "风险等级",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_35.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_36 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            type: (row.risk_level === 'high' ? 'danger' : row.risk_level === 'medium' ? 'warning' : 'success'),
            size: "small",
        }));
        const __VLS_38 = __VLS_37({
            type: (row.risk_level === 'high' ? 'danger' : row.risk_level === 'medium' ? 'warning' : 'success'),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        __VLS_39.slots.default;
        (__VLS_ctx.RISK_LABELS[row.risk_level] || row.risk_level);
        var __VLS_39;
    }
    var __VLS_35;
    const __VLS_40 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        prop: "max_auto_frequency",
        label: "频率/天",
        width: "75",
    }));
    const __VLS_42 = __VLS_41({
        prop: "max_auto_frequency",
        label: "频率/天",
        width: "75",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    const __VLS_44 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        label: "状态",
        width: "80",
    }));
    const __VLS_46 = __VLS_45({
        label: "状态",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_47.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_48 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            type: (__VLS_ctx.STATUS_TAG[row.status]),
            size: "small",
        }));
        const __VLS_50 = __VLS_49({
            type: (__VLS_ctx.STATUS_TAG[row.status]),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        (__VLS_ctx.STATUS_LABELS[row.status] || row.status);
        var __VLS_51;
    }
    var __VLS_47;
    const __VLS_52 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        prop: "approved_by",
        label: "审批人",
        width: "80",
    }));
    const __VLS_54 = __VLS_53({
        prop: "approved_by",
        label: "审批人",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    const __VLS_56 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        label: "操作",
        width: "220",
        fixed: "right",
    }));
    const __VLS_58 = __VLS_57({
        label: "操作",
        width: "220",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_59.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.status === 'pending' && __VLS_ctx.isAdmin) {
            const __VLS_60 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
            }));
            const __VLS_62 = __VLS_61({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
            let __VLS_64;
            let __VLS_65;
            let __VLS_66;
            const __VLS_67 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.featureEnabled))
                        return;
                    if (!(row.status === 'pending' && __VLS_ctx.isAdmin))
                        return;
                    __VLS_ctx.doApprove(row);
                }
            };
            __VLS_63.slots.default;
            var __VLS_63;
        }
        if (row.status === 'pending' && __VLS_ctx.isAdmin) {
            const __VLS_68 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                ...{ 'onClick': {} },
                type: "warning",
                size: "small",
            }));
            const __VLS_70 = __VLS_69({
                ...{ 'onClick': {} },
                type: "warning",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            let __VLS_72;
            let __VLS_73;
            let __VLS_74;
            const __VLS_75 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.featureEnabled))
                        return;
                    if (!(row.status === 'pending' && __VLS_ctx.isAdmin))
                        return;
                    __VLS_ctx.doReject(row);
                }
            };
            __VLS_71.slots.default;
            var __VLS_71;
        }
        if (['pending', 'approved'].includes(row.status) && __VLS_ctx.isAdmin) {
            const __VLS_76 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_78 = __VLS_77({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
            let __VLS_80;
            let __VLS_81;
            let __VLS_82;
            const __VLS_83 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.featureEnabled))
                        return;
                    if (!(['pending', 'approved'].includes(row.status) && __VLS_ctx.isAdmin))
                        return;
                    __VLS_ctx.doRevoke(row);
                }
            };
            __VLS_79.slots.default;
            var __VLS_79;
        }
        const __VLS_84 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_86 = __VLS_85({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        let __VLS_88;
        let __VLS_89;
        let __VLS_90;
        const __VLS_91 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.featureEnabled))
                    return;
                __VLS_ctx.openTimeline(row.metric_id);
            }
        };
        __VLS_87.slots.default;
        var __VLS_87;
        const __VLS_92 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
        }));
        const __VLS_94 = __VLS_93({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        let __VLS_96;
        let __VLS_97;
        let __VLS_98;
        const __VLS_99 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.featureEnabled))
                    return;
                __VLS_ctx.doRollback(row.metric_id);
            }
        };
        __VLS_95.slots.default;
        var __VLS_95;
    }
    var __VLS_59;
    var __VLS_23;
}
const __VLS_100 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.showCreate),
    title: "新建 L4 试点申请",
    width: "500px",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.showCreate),
    title: "新建 L4 试点申请",
    width: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
const __VLS_104 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    labelPosition: "top",
}));
const __VLS_106 = __VLS_105({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "选择指标",
}));
const __VLS_110 = __VLS_109({
    label: "选择指标",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    modelValue: (__VLS_ctx.createForm.metric_id),
    filterable: true,
    ...{ style: {} },
    placeholder: "请选择指标",
}));
const __VLS_114 = __VLS_113({
    modelValue: (__VLS_ctx.createForm.metric_id),
    filterable: true,
    ...{ style: {} },
    placeholder: "请选择指标",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
for (const [m] of __VLS_getVForSourceType((__VLS_ctx.metrics))) {
    const __VLS_116 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        key: (m.id),
        label: (`${m.metric_name || m.metric_code} #${m.id}`),
        value: (m.id),
    }));
    const __VLS_118 = __VLS_117({
        key: (m.id),
        label: (`${m.metric_name || m.metric_code} #${m.id}`),
        value: (m.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
}
var __VLS_115;
var __VLS_111;
const __VLS_120 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "每日最大执行次数",
}));
const __VLS_122 = __VLS_121({
    label: "每日最大执行次数",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    modelValue: (__VLS_ctx.createForm.max_auto_frequency),
    min: (1),
    max: (100),
    ...{ style: {} },
}));
const __VLS_126 = __VLS_125({
    modelValue: (__VLS_ctx.createForm.max_auto_frequency),
    min: (1),
    max: (100),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
var __VLS_123;
const __VLS_128 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "失败自动回滚",
}));
const __VLS_130 = __VLS_129({
    label: "失败自动回滚",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    modelValue: (__VLS_ctx.createForm.auto_rollback_enabled),
}));
const __VLS_134 = __VLS_133({
    modelValue: (__VLS_ctx.createForm.auto_rollback_enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
var __VLS_131;
const __VLS_136 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "申请理由",
}));
const __VLS_138 = __VLS_137({
    label: "申请理由",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.createForm.reason),
    type: "textarea",
    rows: (2),
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.createForm.reason),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
var __VLS_139;
var __VLS_107;
{
    const { footer: __VLS_thisSlot } = __VLS_103.slots;
    const __VLS_144 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        ...{ 'onClick': {} },
    }));
    const __VLS_146 = __VLS_145({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    let __VLS_148;
    let __VLS_149;
    let __VLS_150;
    const __VLS_151 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showCreate = false;
        }
    };
    __VLS_147.slots.default;
    var __VLS_147;
    const __VLS_152 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.creating),
    }));
    const __VLS_154 = __VLS_153({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.creating),
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    let __VLS_156;
    let __VLS_157;
    let __VLS_158;
    const __VLS_159 = {
        onClick: (__VLS_ctx.doCreate)
    };
    __VLS_155.slots.default;
    var __VLS_155;
}
var __VLS_103;
const __VLS_160 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    modelValue: (__VLS_ctx.showRollbackConfirm),
    title: "确认回滚",
    width: "480px",
}));
const __VLS_162 = __VLS_161({
    modelValue: (__VLS_ctx.showRollbackConfirm),
    title: "确认回滚",
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
if (__VLS_ctx.rollbackTarget) {
    const __VLS_164 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        type: "warning",
        closable: (false),
        showIcon: true,
        title: "即将回滚最近一次 L4 自动发布的全部资产",
        ...{ style: {} },
    }));
    const __VLS_166 = __VLS_165({
        type: "warning",
        closable: (false),
        showIcon: true,
        title: "即将回滚最近一次 L4 自动发布的全部资产",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.rollbackTarget.metric_name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
}
{
    const { footer: __VLS_thisSlot } = __VLS_163.slots;
    const __VLS_168 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        ...{ 'onClick': {} },
    }));
    const __VLS_170 = __VLS_169({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    let __VLS_172;
    let __VLS_173;
    let __VLS_174;
    const __VLS_175 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showRollbackConfirm = false;
        }
    };
    __VLS_171.slots.default;
    var __VLS_171;
    const __VLS_176 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        ...{ 'onClick': {} },
        type: "danger",
    }));
    const __VLS_178 = __VLS_177({
        ...{ 'onClick': {} },
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    let __VLS_180;
    let __VLS_181;
    let __VLS_182;
    const __VLS_183 = {
        onClick: (__VLS_ctx.confirmRollback)
    };
    __VLS_179.slots.default;
    var __VLS_179;
}
var __VLS_163;
const __VLS_184 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    modelValue: (__VLS_ctx.showTimeline),
    title: "L4 执行审计",
    size: "500px",
}));
const __VLS_186 = __VLS_185({
    modelValue: (__VLS_ctx.showTimeline),
    title: "L4 执行审计",
    size: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
if (__VLS_ctx.timelineData?.events?.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    for (const [e] of __VLS_getVForSourceType((__VLS_ctx.timelineData.events.slice(0, 20)))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (e.execution_id),
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (e.trigger_type);
        const __VLS_188 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
            size: "small",
            type: (e.status === 'success' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'),
        }));
        const __VLS_190 = __VLS_189({
            size: "small",
            type: (e.status === 'success' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_189));
        __VLS_191.slots.default;
        (e.status);
        var __VLS_191;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.formatDateTime(e.started_at) || '-');
        (__VLS_ctx.formatDateTime(e.finished_at) || '-');
        if (e.steps?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            for (const [s] of __VLS_getVForSourceType((e.steps))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (s.step),
                    ...{ style: {} },
                });
                (s.step);
                (s.status);
            }
        }
    }
}
else {
    const __VLS_192 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        description: "暂无 L4 执行记录",
    }));
    const __VLS_194 = __VLS_193({
        description: "暂无 L4 执行记录",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
}
var __VLS_187;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            CircleCheck: CircleCheck,
            Refresh: Refresh,
            isAdmin: isAdmin,
            featureEnabled: featureEnabled,
            loading: loading,
            approvals: approvals,
            showCreate: showCreate,
            creating: creating,
            createForm: createForm,
            metrics: metrics,
            showTimeline: showTimeline,
            timelineData: timelineData,
            RISK_LABELS: RISK_LABELS,
            STATUS_LABELS: STATUS_LABELS,
            STATUS_TAG: STATUS_TAG,
            load: load,
            doApprove: doApprove,
            doReject: doReject,
            doRevoke: doRevoke,
            openCreate: openCreate,
            doCreate: doCreate,
            openTimeline: openTimeline,
            rollbackTarget: rollbackTarget,
            showRollbackConfirm: showRollbackConfirm,
            doRollback: doRollback,
            confirmRollback: confirmRollback,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
