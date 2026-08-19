/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { onMounted, ref } from 'vue';
import { useUserStore } from '@/stores/user';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, VideoPlay, Edit, Delete, Clock, RefreshRight } from '@element-plus/icons-vue';
import { api } from '@/api/client';
import { schedulerApi } from '@/api/scheduler';
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue';
const userStore = useUserStore();
const jobs = ref([]);
const runs = ref([]);
const loading = ref(false);
async function load() {
    loading.value = true;
    try {
        const res = await api.get('/warehouse/snapshots');
        jobs.value = res.data.items;
    }
    catch {
        jobs.value = [];
    }
    finally {
        loading.value = false;
    }
}
const dialogVisible = ref(false);
const editId = ref(null);
const form = ref({ name: '', source_table: '', target_table: '', snapshot_keys: [], period: 'monthly', retention: 12 });
const saving = ref(false);
const keysInput = ref('');
function openCreate() { editId.value = null; form.value = { name: '', source_table: '', target_table: '', snapshot_keys: [], period: 'monthly', retention: 12 }; dialogVisible.value = true; }
function openEdit(j) { editId.value = j.id; form.value = { name: j.name, source_table: j.source_table, target_table: j.target_table, snapshot_keys: j.snapshot_keys || [], period: j.period || 'monthly', retention: j.retention || 12 }; dialogVisible.value = true; }
function addKey() { const v = keysInput.value.trim(); if (v && !form.value.snapshot_keys.includes(v))
    form.value.snapshot_keys.push(v); keysInput.value = ''; }
function removeKey(k) { form.value.snapshot_keys = form.value.snapshot_keys.filter(x => x !== k); }
async function save() {
    saving.value = true;
    try {
        if (editId.value) {
            await api.patch(`/warehouse/snapshots/${editId.value}`, form.value);
            ElMessage.success('已更新');
        }
        else {
            await api.post('/warehouse/snapshots', form.value);
            ElMessage.success('已创建');
        }
        dialogVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function doDelete(id) {
    try {
        await ElMessageBox.confirm('确定删除？', '确认', { type: 'warning' });
        await api.delete(`/warehouse/snapshots/${id}`);
        ElMessage.success('已删除');
        load();
    }
    catch { }
}
const triggerVisible = ref(false);
const triggerJobId = ref(null);
const triggerPeriod = ref('');
const triggering = ref(false);
const runsVisible = ref(false);
const runsJobId = ref(0);
const retrying = ref(new Set());
function openTrigger(jobId) { triggerJobId.value = jobId; triggerPeriod.value = new Date().toISOString().substring(0, 7); triggerVisible.value = true; }
async function doTrigger() {
    triggering.value = true;
    try {
        await api.post(`/warehouse/snapshots/${triggerJobId.value}/trigger`, { period_value: triggerPeriod.value });
        ElMessage.success('快照已触发');
        triggerVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '触发失败');
    }
    finally {
        triggering.value = false;
    }
}
async function showRuns(jobId) {
    runsJobId.value = jobId;
    try {
        const res = await api.get('/warehouse/snapshots/runs', { params: { job_id: jobId, page_size: 50 } });
        runs.value = res.data.items;
        runsVisible.value = true;
    }
    catch {
        runs.value = [];
    }
}
async function retryRun(runId) {
    retrying.value.add(runId);
    try {
        const res = await schedulerApi.retryRun(runId, '手动重试快照');
        if (res.ok) {
            ElMessage.success('重跑成功');
            showRuns(runsJobId.value);
        }
        else {
            ElMessage.error(res.message || '重跑失败');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '重跑失败');
    }
    finally {
        retrying.value.delete(runId);
    }
}
// 定时配置
const scheduleVisible = ref(false);
const scheduleBizId = ref(0);
const scheduleBizName = ref('');
function openSchedule(j) {
    scheduleBizId.value = j.id;
    scheduleBizName.value = j.name;
    scheduleVisible.value = true;
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
if (__VLS_ctx.userStore.hasOp('warehouse.modeling', 'C')) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    shadow: "never",
}));
const __VLS_10 = __VLS_9({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    data: (__VLS_ctx.jobs),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无快照任务",
}));
const __VLS_14 = __VLS_13({
    data: (__VLS_ctx.jobs),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无快照任务",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_15.slots.default;
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    prop: "name",
    label: "名称",
    minWidth: "140",
}));
const __VLS_18 = __VLS_17({
    prop: "name",
    label: "名称",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_20 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    prop: "source_table",
    label: "来源表",
    width: "140",
}));
const __VLS_22 = __VLS_21({
    prop: "source_table",
    label: "来源表",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "标识字段",
    minWidth: "120",
}));
const __VLS_26 = __VLS_25({
    label: "标识字段",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    for (const [k] of __VLS_getVForSourceType((row.snapshot_keys))) {
        const __VLS_28 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            key: (k),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_30 = __VLS_29({
            key: (k),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        (k);
        var __VLS_31;
    }
}
var __VLS_27;
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    prop: "period",
    label: "周期",
    width: "70",
}));
const __VLS_34 = __VLS_33({
    prop: "period",
    label: "周期",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    prop: "retention",
    label: "保留期",
    width: "70",
    align: "center",
}));
const __VLS_38 = __VLS_37({
    prop: "retention",
    label: "保留期",
    width: "70",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_39.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.retention);
}
var __VLS_39;
const __VLS_40 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "状态",
    width: "70",
    align: "center",
}));
const __VLS_42 = __VLS_41({
    label: "状态",
    width: "70",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_43.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_44 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        size: "small",
        type: (row.enabled ? 'success' : 'info'),
    }));
    const __VLS_46 = __VLS_45({
        size: "small",
        type: (row.enabled ? 'success' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    (row.enabled ? '启用' : '停用');
    var __VLS_47;
}
var __VLS_43;
const __VLS_48 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    label: "上次执行",
    width: "140",
}));
const __VLS_50 = __VLS_49({
    label: "上次执行",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_51.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.last_run_at) || '—');
}
var __VLS_51;
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "操作",
    width: "280",
    fixed: "right",
}));
const __VLS_54 = __VLS_53({
    label: "操作",
    width: "280",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_56 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.VideoPlay),
        type: "success",
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.VideoPlay),
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openTrigger(row.id);
        }
    };
    __VLS_59.slots.default;
    var __VLS_59;
    const __VLS_64 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_67.slots.default;
    var __VLS_67;
    const __VLS_72 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showRuns(row.id);
        }
    };
    __VLS_75.slots.default;
    var __VLS_75;
    const __VLS_80 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Clock),
    }));
    const __VLS_82 = __VLS_81({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Clock),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    let __VLS_84;
    let __VLS_85;
    let __VLS_86;
    const __VLS_87 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openSchedule(row);
        }
    };
    __VLS_83.slots.default;
    var __VLS_83;
    const __VLS_88 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onClick: (...[$event]) => {
            __VLS_ctx.doDelete(row.id);
        }
    };
    __VLS_91.slots.default;
    var __VLS_91;
}
var __VLS_55;
var __VLS_15;
var __VLS_11;
const __VLS_96 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editId ? '编辑快照' : '新建快照'),
    width: "520px",
}));
const __VLS_98 = __VLS_97({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editId ? '编辑快照' : '新建快照'),
    width: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    labelWidth: "80px",
    size: "small",
}));
const __VLS_102 = __VLS_101({
    labelWidth: "80px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
const __VLS_104 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "名称",
    required: true,
}));
const __VLS_106 = __VLS_105({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "128",
}));
const __VLS_110 = __VLS_109({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "128",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
var __VLS_107;
const __VLS_112 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    label: "来源表",
    required: true,
}));
const __VLS_114 = __VLS_113({
    label: "来源表",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
const __VLS_116 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    modelValue: (__VLS_ctx.form.source_table),
    placeholder: "ODS/DWD 表名",
}));
const __VLS_118 = __VLS_117({
    modelValue: (__VLS_ctx.form.source_table),
    placeholder: "ODS/DWD 表名",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
var __VLS_115;
const __VLS_120 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "目标表前缀",
    required: true,
}));
const __VLS_122 = __VLS_121({
    label: "目标表前缀",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    modelValue: (__VLS_ctx.form.target_table),
    placeholder: "snap_employee",
}));
const __VLS_126 = __VLS_125({
    modelValue: (__VLS_ctx.form.target_table),
    placeholder: "snap_employee",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
var __VLS_123;
const __VLS_128 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "标识字段",
}));
const __VLS_130 = __VLS_129({
    label: "标识字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_132 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keysInput),
    placeholder: "如 employee_id",
}));
const __VLS_134 = __VLS_133({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keysInput),
    placeholder: "如 employee_id",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
let __VLS_136;
let __VLS_137;
let __VLS_138;
const __VLS_139 = {
    onKeyup: (__VLS_ctx.addKey)
};
var __VLS_135;
const __VLS_140 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    ...{ 'onClick': {} },
}));
const __VLS_142 = __VLS_141({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
let __VLS_144;
let __VLS_145;
let __VLS_146;
const __VLS_147 = {
    onClick: (__VLS_ctx.addKey)
};
__VLS_143.slots.default;
var __VLS_143;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
for (const [k] of __VLS_getVForSourceType((__VLS_ctx.form.snapshot_keys))) {
    const __VLS_148 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        ...{ 'onClose': {} },
        key: (k),
        closable: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_150 = __VLS_149({
        ...{ 'onClose': {} },
        key: (k),
        closable: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    let __VLS_152;
    let __VLS_153;
    let __VLS_154;
    const __VLS_155 = {
        onClose: (...[$event]) => {
            __VLS_ctx.removeKey(k);
        }
    };
    __VLS_151.slots.default;
    (k);
    var __VLS_151;
}
var __VLS_131;
const __VLS_156 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    label: "周期",
}));
const __VLS_158 = __VLS_157({
    label: "周期",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
const __VLS_160 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    modelValue: (__VLS_ctx.form.period),
}));
const __VLS_162 = __VLS_161({
    modelValue: (__VLS_ctx.form.period),
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    label: "每日",
    value: "daily",
}));
const __VLS_166 = __VLS_165({
    label: "每日",
    value: "daily",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
const __VLS_168 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    label: "每周",
    value: "weekly",
}));
const __VLS_170 = __VLS_169({
    label: "每周",
    value: "weekly",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
const __VLS_172 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    label: "每月",
    value: "monthly",
}));
const __VLS_174 = __VLS_173({
    label: "每月",
    value: "monthly",
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
const __VLS_176 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "每季",
    value: "quarterly",
}));
const __VLS_178 = __VLS_177({
    label: "每季",
    value: "quarterly",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
const __VLS_180 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    label: "每年",
    value: "yearly",
}));
const __VLS_182 = __VLS_181({
    label: "每年",
    value: "yearly",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
var __VLS_163;
var __VLS_159;
const __VLS_184 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    label: "保留期",
}));
const __VLS_186 = __VLS_185({
    label: "保留期",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
const __VLS_188 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    modelValue: (__VLS_ctx.form.retention),
    min: (1),
    max: (120),
}));
const __VLS_190 = __VLS_189({
    modelValue: (__VLS_ctx.form.retention),
    min: (1),
    max: (120),
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
var __VLS_187;
var __VLS_103;
{
    const { footer: __VLS_thisSlot } = __VLS_99.slots;
    const __VLS_192 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        ...{ 'onClick': {} },
    }));
    const __VLS_194 = __VLS_193({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    let __VLS_196;
    let __VLS_197;
    let __VLS_198;
    const __VLS_199 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_195.slots.default;
    var __VLS_195;
    const __VLS_200 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_202 = __VLS_201({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    let __VLS_204;
    let __VLS_205;
    let __VLS_206;
    const __VLS_207 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_203.slots.default;
    var __VLS_203;
}
var __VLS_99;
const __VLS_208 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    modelValue: (__VLS_ctx.triggerVisible),
    title: "触发快照",
    width: "360px",
}));
const __VLS_210 = __VLS_209({
    modelValue: (__VLS_ctx.triggerVisible),
    title: "触发快照",
    width: "360px",
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
__VLS_211.slots.default;
const __VLS_212 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
    labelWidth: "80px",
    size: "small",
}));
const __VLS_214 = __VLS_213({
    labelWidth: "80px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_213));
__VLS_215.slots.default;
const __VLS_216 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
    label: "周期值",
    required: true,
}));
const __VLS_218 = __VLS_217({
    label: "周期值",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_217));
__VLS_219.slots.default;
const __VLS_220 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    modelValue: (__VLS_ctx.triggerPeriod),
    placeholder: "2026-07",
}));
const __VLS_222 = __VLS_221({
    modelValue: (__VLS_ctx.triggerPeriod),
    placeholder: "2026-07",
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
var __VLS_219;
var __VLS_215;
{
    const { footer: __VLS_thisSlot } = __VLS_211.slots;
    const __VLS_224 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        ...{ 'onClick': {} },
    }));
    const __VLS_226 = __VLS_225({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    let __VLS_228;
    let __VLS_229;
    let __VLS_230;
    const __VLS_231 = {
        onClick: (...[$event]) => {
            __VLS_ctx.triggerVisible = false;
        }
    };
    __VLS_227.slots.default;
    var __VLS_227;
    const __VLS_232 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.triggering),
    }));
    const __VLS_234 = __VLS_233({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.triggering),
    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    let __VLS_236;
    let __VLS_237;
    let __VLS_238;
    const __VLS_239 = {
        onClick: (__VLS_ctx.doTrigger)
    };
    __VLS_235.slots.default;
    var __VLS_235;
}
var __VLS_211;
const __VLS_240 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.runsVisible),
    title: "快照记录",
    width: "780px",
}));
const __VLS_242 = __VLS_241({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.runsVisible),
    title: "快照记录",
    width: "780px",
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
let __VLS_244;
let __VLS_245;
let __VLS_246;
const __VLS_247 = {
    onClose: (...[$event]) => {
        __VLS_ctx.runs = [];
    }
};
__VLS_243.slots.default;
const __VLS_248 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
    data: (__VLS_ctx.runs),
    size: "small",
    border: true,
    maxHeight: "400",
}));
const __VLS_250 = __VLS_249({
    data: (__VLS_ctx.runs),
    size: "small",
    border: true,
    maxHeight: "400",
}, ...__VLS_functionalComponentArgsRest(__VLS_249));
__VLS_251.slots.default;
const __VLS_252 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
    prop: "period_value",
    label: "周期值",
    width: "100",
}));
const __VLS_254 = __VLS_253({
    prop: "period_value",
    label: "周期值",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_253));
const __VLS_256 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_258 = __VLS_257({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_257));
__VLS_259.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_259.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_260 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        size: "small",
        type: (row.status === 'success' ? 'success' : 'danger'),
    }));
    const __VLS_262 = __VLS_261({
        size: "small",
        type: (row.status === 'success' ? 'success' : 'danger'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    __VLS_263.slots.default;
    (row.status);
    var __VLS_263;
}
var __VLS_259;
const __VLS_264 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
    prop: "row_count",
    label: "行数",
    width: "80",
    align: "center",
}));
const __VLS_266 = __VLS_265({
    prop: "row_count",
    label: "行数",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_265));
const __VLS_268 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
    prop: "started_at",
    label: "开始时间",
    width: "150",
}));
const __VLS_270 = __VLS_269({
    prop: "started_at",
    label: "开始时间",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_269));
__VLS_271.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_271.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.started_at));
}
var __VLS_271;
const __VLS_272 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
    prop: "finished_at",
    label: "结束时间",
    width: "150",
}));
const __VLS_274 = __VLS_273({
    prop: "finished_at",
    label: "结束时间",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_273));
__VLS_275.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_275.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.finished_at));
}
var __VLS_275;
const __VLS_276 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
    prop: "error_message",
    label: "错误",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_278 = __VLS_277({
    prop: "error_message",
    label: "错误",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_277));
const __VLS_280 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
    label: "操作",
    width: "70",
    fixed: "right",
}));
const __VLS_282 = __VLS_281({
    label: "操作",
    width: "70",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_281));
__VLS_283.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_283.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.status === 'failed') {
        const __VLS_284 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.RefreshRight),
            loading: (__VLS_ctx.retrying.has(row.id)),
        }));
        const __VLS_286 = __VLS_285({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
            icon: (__VLS_ctx.RefreshRight),
            loading: (__VLS_ctx.retrying.has(row.id)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_285));
        let __VLS_288;
        let __VLS_289;
        let __VLS_290;
        const __VLS_291 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'failed'))
                    return;
                __VLS_ctx.retryRun(row.id);
            }
        };
        __VLS_287.slots.default;
        var __VLS_287;
    }
}
var __VLS_283;
var __VLS_251;
var __VLS_243;
/** @type {[typeof ScheduleConfigDialog, ]} */ ;
// @ts-ignore
const __VLS_292 = __VLS_asFunctionalComponent(ScheduleConfigDialog, new ScheduleConfigDialog({
    visible: (__VLS_ctx.scheduleVisible),
    kind: "snapshot_run",
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: ({ job_id: __VLS_ctx.scheduleBizId }),
}));
const __VLS_293 = __VLS_292({
    visible: (__VLS_ctx.scheduleVisible),
    kind: "snapshot_run",
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: ({ job_id: __VLS_ctx.scheduleBizId }),
}, ...__VLS_functionalComponentArgsRest(__VLS_292));
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Plus: Plus,
            VideoPlay: VideoPlay,
            Edit: Edit,
            Delete: Delete,
            Clock: Clock,
            RefreshRight: RefreshRight,
            ScheduleConfigDialog: ScheduleConfigDialog,
            userStore: userStore,
            jobs: jobs,
            runs: runs,
            loading: loading,
            dialogVisible: dialogVisible,
            editId: editId,
            form: form,
            saving: saving,
            keysInput: keysInput,
            openCreate: openCreate,
            openEdit: openEdit,
            addKey: addKey,
            removeKey: removeKey,
            save: save,
            doDelete: doDelete,
            triggerVisible: triggerVisible,
            triggerPeriod: triggerPeriod,
            triggering: triggering,
            runsVisible: runsVisible,
            retrying: retrying,
            openTrigger: openTrigger,
            doTrigger: doTrigger,
            showRuns: showRuns,
            retryRun: retryRun,
            scheduleVisible: scheduleVisible,
            scheduleBizId: scheduleBizId,
            scheduleBizName: scheduleBizName,
            openSchedule: openSchedule,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
