/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, VideoPlay, Edit, Delete, InfoFilled } from '@element-plus/icons-vue';
import { api } from '@/api/client';
import { useUserStore } from '@/stores/user';
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue';
const userStore = useUserStore();
const configs = ref([]);
const runs = ref([]);
const loading = ref(false);
async function load() {
    loading.value = true;
    try {
        const res = await api.get('/warehouse/scd-configs');
        configs.value = res.data.items;
    }
    catch {
        configs.value = [];
    }
    finally {
        loading.value = false;
    }
}
// ── 候选字段检测 ──────────────────────────────
const candidateLoading = ref(false);
const candidates = ref(null);
async function detectCandidates(tableName) {
    if (!tableName)
        return;
    candidateLoading.value = true;
    try {
        const res = await api.get('/warehouse/scd-detect-candidates', { params: { table_name: tableName } });
        candidates.value = res.data;
    }
    catch (e) {
        candidates.value = null;
        ElMessage.error(e?.response?.data?.detail || '检测失败');
    }
    finally {
        candidateLoading.value = false;
    }
}
// ── 创建/编辑弹窗 ──────────────────────────────
const dialogVisible = ref(false);
const editId = ref(null);
const form = ref({
    name: '', source_table: '', target_table: '',
    business_key: '', effective_from_field: 'effective_from',
    effective_to_field: 'effective_to', current_flag_field: 'current_flag',
    compare_fields: [],
});
const saving = ref(false);
const compareInput = ref('');
function openCreate() {
    editId.value = null;
    form.value = { name: '', source_table: '', target_table: '', business_key: '', effective_from_field: 'effective_from', effective_to_field: 'effective_to', current_flag_field: 'current_flag', compare_fields: [] };
    candidates.value = null;
    dialogVisible.value = true;
}
function openEdit(c) {
    editId.value = c.id;
    form.value = {
        name: c.name, source_table: c.source_table, target_table: c.target_table,
        business_key: c.business_key || '',
        effective_from_field: c.effective_from_field || 'effective_from',
        effective_to_field: c.effective_to_field || 'effective_to',
        current_flag_field: c.current_flag_field || 'current_flag',
        compare_fields: c.compare_fields || [],
    };
    candidates.value = null;
    dialogVisible.value = true;
}
async function save() {
    saving.value = true;
    try {
        const payload = { ...form.value, compare_fields: form.value.compare_fields.filter(Boolean) };
        if (editId.value) {
            await api.patch(`/warehouse/scd-configs/${editId.value}`, payload);
            ElMessage.success('已更新');
        }
        else {
            await api.post('/warehouse/scd-configs', payload);
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
        await api.delete(`/warehouse/scd-configs/${id}`);
        ElMessage.success('已删除');
        load();
    }
    catch { }
}
// ── 执行 ───────────────────────────────────────
const executing = ref(new Set());
async function doExecute(configId) {
    executing.value.add(configId);
    try {
        const res = await api.post(`/warehouse/scd-configs/${configId}/execute`);
        ElMessage.success(`拉链完成：新增 ${res.data.new_count}，变更 ${res.data.updated_count}，关闭 ${res.data.closed_count}`);
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '执行失败');
    }
    finally {
        executing.value.delete(configId);
    }
}
// ── 运行记录 ───────────────────────────────────
const runsVisible = ref(false);
const runsConfigId = ref(0);
async function showRuns(configId) {
    runsConfigId.value = configId;
    try {
        const res = await api.get('/warehouse/scd-runs', { params: { config_id: configId, page_size: 50 } });
        runs.value = res.data.items;
    }
    catch {
        runs.value = [];
    }
    runsVisible.value = true;
}
// ── 定时配置 ───────────────────────────────────
const scheduleVisible = ref(false);
const scheduleBizId = ref(0);
const scheduleBizName = ref('');
function openSchedule(c) {
    scheduleBizId.value = c.id;
    scheduleBizName.value = c.name;
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
const __VLS_8 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    type: "warning",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_10 = __VLS_9({
    type: "warning",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { title: __VLS_thisSlot } = __VLS_11.slots;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({});
var __VLS_11;
const __VLS_12 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    shadow: "never",
}));
const __VLS_14 = __VLS_13({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    data: (__VLS_ctx.configs),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无 SCD 配置",
}));
const __VLS_18 = __VLS_17({
    data: (__VLS_ctx.configs),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无 SCD 配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_19.slots.default;
const __VLS_20 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    prop: "name",
    label: "名称",
    minWidth: "140",
}));
const __VLS_22 = __VLS_21({
    prop: "name",
    label: "名称",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    prop: "source_table",
    label: "来源表",
    width: "140",
}));
const __VLS_26 = __VLS_25({
    prop: "source_table",
    label: "来源表",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    prop: "target_table",
    label: "拉链表",
    width: "140",
}));
const __VLS_30 = __VLS_29({
    prop: "target_table",
    label: "拉链表",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    prop: "business_key",
    label: "业务键",
    width: "150",
}));
const __VLS_34 = __VLS_33({
    prop: "business_key",
    label: "业务键",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "对比字段",
    minWidth: "160",
}));
const __VLS_38 = __VLS_37({
    label: "对比字段",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_39.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    for (const [f] of __VLS_getVForSourceType(((row.compare_fields || []).slice(0, 5)))) {
        const __VLS_40 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            key: (f),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_42 = __VLS_41({
            key: (f),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        (f);
        var __VLS_43;
    }
    if ((row.compare_fields || []).length > 5) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (row.compare_fields.length - 5);
    }
}
var __VLS_39;
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "状态",
    width: "80",
    align: "center",
}));
const __VLS_46 = __VLS_45({
    label: "状态",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_47.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_48 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        size: "small",
        type: (row.last_status === 'success' ? 'success' : row.last_status === 'failed' ? 'danger' : 'info'),
    }));
    const __VLS_50 = __VLS_49({
        size: "small",
        type: (row.last_status === 'success' ? 'success' : row.last_status === 'failed' ? 'danger' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (row.last_status || '—');
    var __VLS_51;
}
var __VLS_47;
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "上次执行",
    width: "140",
}));
const __VLS_54 = __VLS_53({
    label: "上次执行",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.last_run_at) || '—');
}
var __VLS_55;
const __VLS_56 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "操作",
    width: "260",
    fixed: "right",
}));
const __VLS_58 = __VLS_57({
    label: "操作",
    width: "260",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_59.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_60 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.VideoPlay),
        type: "success",
        loading: (__VLS_ctx.executing.has(row.id)),
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.VideoPlay),
        type: "success",
        loading: (__VLS_ctx.executing.has(row.id)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onClick: (...[$event]) => {
            __VLS_ctx.doExecute(row.id);
        }
    };
    __VLS_63.slots.default;
    var __VLS_63;
    const __VLS_68 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }));
    const __VLS_70 = __VLS_69({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Edit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    let __VLS_72;
    let __VLS_73;
    let __VLS_74;
    const __VLS_75 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_71.slots.default;
    var __VLS_71;
    const __VLS_76 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
    }));
    const __VLS_78 = __VLS_77({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    let __VLS_80;
    let __VLS_81;
    let __VLS_82;
    const __VLS_83 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showRuns(row.id);
        }
    };
    __VLS_79.slots.default;
    var __VLS_79;
    const __VLS_84 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
    }));
    const __VLS_86 = __VLS_85({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    let __VLS_88;
    let __VLS_89;
    let __VLS_90;
    const __VLS_91 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openSchedule(row);
        }
    };
    __VLS_87.slots.default;
    var __VLS_87;
    const __VLS_92 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_94 = __VLS_93({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    let __VLS_96;
    let __VLS_97;
    let __VLS_98;
    const __VLS_99 = {
        onClick: (...[$event]) => {
            __VLS_ctx.doDelete(row.id);
        }
    };
    __VLS_95.slots.default;
    var __VLS_95;
}
var __VLS_59;
var __VLS_19;
var __VLS_15;
const __VLS_100 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editId ? '编辑 SCD 配置' : '新建 SCD 配置'),
    width: "620px",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editId ? '编辑 SCD 配置' : '新建 SCD 配置'),
    width: "620px",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
const __VLS_104 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    labelWidth: "110px",
    size: "small",
}));
const __VLS_106 = __VLS_105({
    labelWidth: "110px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "名称",
    required: true,
}));
const __VLS_110 = __VLS_109({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "128",
}));
const __VLS_114 = __VLS_113({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "128",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
var __VLS_111;
const __VLS_116 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    label: "来源表",
    required: true,
}));
const __VLS_118 = __VLS_117({
    label: "来源表",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
const __VLS_120 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.source_table),
    placeholder: "源表名",
}));
const __VLS_122 = __VLS_121({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.source_table),
    placeholder: "源表名",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
let __VLS_124;
let __VLS_125;
let __VLS_126;
const __VLS_127 = {
    onChange: ((v) => { if (v)
        __VLS_ctx.detectCandidates(v); })
};
var __VLS_123;
var __VLS_119;
const __VLS_128 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "拉链表 Target",
    required: true,
}));
const __VLS_130 = __VLS_129({
    label: "拉链表 Target",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    modelValue: (__VLS_ctx.form.target_table),
    placeholder: "目标拉链表名（需不同于来源表）",
}));
const __VLS_134 = __VLS_133({
    modelValue: (__VLS_ctx.form.target_table),
    placeholder: "目标拉链表名（需不同于来源表）",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
var __VLS_131;
const __VLS_136 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "业务键",
    required: true,
}));
const __VLS_138 = __VLS_137({
    label: "业务键",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.form.business_key),
    placeholder: "逗号分隔，如 employee_id",
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.form.business_key),
    placeholder: "逗号分隔，如 employee_id",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
if (__VLS_ctx.candidates?.business_key_candidates?.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [k] of __VLS_getVForSourceType((__VLS_ctx.candidates.business_key_candidates))) {
        const __VLS_144 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            ...{ 'onClick': {} },
            key: (k),
            link: true,
            size: "small",
        }));
        const __VLS_146 = __VLS_145({
            ...{ 'onClick': {} },
            key: (k),
            link: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        let __VLS_148;
        let __VLS_149;
        let __VLS_150;
        const __VLS_151 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.candidates?.business_key_candidates?.length))
                    return;
                __VLS_ctx.form.business_key = __VLS_ctx.form.business_key ? __VLS_ctx.form.business_key + ',' + k : k;
            }
        };
        __VLS_147.slots.default;
        (k);
        var __VLS_147;
    }
}
var __VLS_139;
const __VLS_152 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    label: "生效起始字段",
}));
const __VLS_154 = __VLS_153({
    label: "生效起始字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_155.slots.default;
const __VLS_156 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    modelValue: (__VLS_ctx.form.effective_from_field),
    ...{ style: {} },
}));
const __VLS_158 = __VLS_157({
    modelValue: (__VLS_ctx.form.effective_from_field),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
var __VLS_155;
const __VLS_160 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    label: "生效结束字段",
}));
const __VLS_162 = __VLS_161({
    label: "生效结束字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    modelValue: (__VLS_ctx.form.effective_to_field),
    ...{ style: {} },
}));
const __VLS_166 = __VLS_165({
    modelValue: (__VLS_ctx.form.effective_to_field),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
var __VLS_163;
const __VLS_168 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    label: "当前标记字段",
}));
const __VLS_170 = __VLS_169({
    label: "当前标记字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
__VLS_171.slots.default;
const __VLS_172 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    modelValue: (__VLS_ctx.form.current_flag_field),
    ...{ style: {} },
}));
const __VLS_174 = __VLS_173({
    modelValue: (__VLS_ctx.form.current_flag_field),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
var __VLS_171;
const __VLS_176 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "对比变更字段",
}));
const __VLS_178 = __VLS_177({
    label: "对比变更字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
__VLS_179.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_180 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.compareInput),
    placeholder: "字段名（回车添加）",
}));
const __VLS_182 = __VLS_181({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.compareInput),
    placeholder: "字段名（回车添加）",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
let __VLS_184;
let __VLS_185;
let __VLS_186;
const __VLS_187 = {
    onKeyup: ((e) => { const v = e.target?.value?.trim(); if (v && !__VLS_ctx.form.compare_fields.includes(v)) {
        __VLS_ctx.form.compare_fields.push(v);
        e.target.value = '';
    } })
};
var __VLS_183;
if (__VLS_ctx.candidates?.compare_candidates?.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_188 = {}.ElCheckboxGroup;
    /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        modelValue: (__VLS_ctx.form.compare_fields),
        size: "small",
    }));
    const __VLS_190 = __VLS_189({
        modelValue: (__VLS_ctx.form.compare_fields),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    for (const [f] of __VLS_getVForSourceType((__VLS_ctx.candidates.compare_candidates))) {
        const __VLS_192 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            key: (f),
            label: (f),
            value: (f),
            ...{ style: {} },
        }));
        const __VLS_194 = __VLS_193({
            key: (f),
            label: (f),
            value: (f),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        __VLS_195.slots.default;
        (f);
        var __VLS_195;
    }
    var __VLS_191;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.compare_fields))) {
    const __VLS_196 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        ...{ 'onClose': {} },
        key: (f),
        closable: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_198 = __VLS_197({
        ...{ 'onClose': {} },
        key: (f),
        closable: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    let __VLS_200;
    let __VLS_201;
    let __VLS_202;
    const __VLS_203 = {
        onClose: (...[$event]) => {
            __VLS_ctx.form.compare_fields = __VLS_ctx.form.compare_fields.filter(x => x !== f);
        }
    };
    __VLS_199.slots.default;
    (f);
    var __VLS_199;
}
var __VLS_179;
if (__VLS_ctx.candidates) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_204 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        ...{ style: {} },
    }));
    const __VLS_206 = __VLS_205({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    const __VLS_208 = {}.InfoFilled;
    /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({}));
    const __VLS_210 = __VLS_209({}, ...__VLS_functionalComponentArgsRest(__VLS_209));
    var __VLS_207;
    (__VLS_ctx.candidates.table_name);
    for (const [w] of __VLS_getVForSourceType((__VLS_ctx.candidates.risk_warnings))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (w),
            ...{ style: {} },
        });
        (w);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.candidates.columns?.length || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [col] of __VLS_getVForSourceType((__VLS_ctx.candidates.columns))) {
        const __VLS_212 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            key: (col.name),
            size: "small",
            type: "info",
            effect: "plain",
        }));
        const __VLS_214 = __VLS_213({
            key: (col.name),
            size: "small",
            type: "info",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        (col.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (col.type);
        var __VLS_215;
    }
}
var __VLS_107;
{
    const { footer: __VLS_thisSlot } = __VLS_103.slots;
    const __VLS_216 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
        ...{ 'onClick': {} },
    }));
    const __VLS_218 = __VLS_217({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    let __VLS_220;
    let __VLS_221;
    let __VLS_222;
    const __VLS_223 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_219.slots.default;
    var __VLS_219;
    const __VLS_224 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_226 = __VLS_225({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    let __VLS_228;
    let __VLS_229;
    let __VLS_230;
    const __VLS_231 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_227.slots.default;
    var __VLS_227;
}
var __VLS_103;
const __VLS_232 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.runsVisible),
    title: "SCD 执行记录",
    width: "780px",
}));
const __VLS_234 = __VLS_233({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.runsVisible),
    title: "SCD 执行记录",
    width: "780px",
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
let __VLS_236;
let __VLS_237;
let __VLS_238;
const __VLS_239 = {
    onClose: (...[$event]) => {
        __VLS_ctx.runs = [];
    }
};
__VLS_235.slots.default;
const __VLS_240 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    data: (__VLS_ctx.runs),
    size: "small",
    border: true,
    maxHeight: "400",
}));
const __VLS_242 = __VLS_241({
    data: (__VLS_ctx.runs),
    size: "small",
    border: true,
    maxHeight: "400",
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
__VLS_243.slots.default;
const __VLS_244 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
    prop: "id",
    label: "ID",
    width: "70",
}));
const __VLS_246 = __VLS_245({
    prop: "id",
    label: "ID",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_245));
const __VLS_248 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_250 = __VLS_249({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_249));
__VLS_251.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_251.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_252 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        size: "small",
        type: (row.status === 'success' ? 'success' : 'danger'),
    }));
    const __VLS_254 = __VLS_253({
        size: "small",
        type: (row.status === 'success' ? 'success' : 'danger'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    __VLS_255.slots.default;
    (row.status);
    var __VLS_255;
}
var __VLS_251;
const __VLS_256 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
    prop: "new_count",
    label: "新增",
    width: "70",
    align: "center",
}));
const __VLS_258 = __VLS_257({
    prop: "new_count",
    label: "新增",
    width: "70",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_257));
const __VLS_260 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
    prop: "updated_count",
    label: "变更",
    width: "70",
    align: "center",
}));
const __VLS_262 = __VLS_261({
    prop: "updated_count",
    label: "变更",
    width: "70",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_261));
const __VLS_264 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
    prop: "closed_count",
    label: "关闭",
    width: "70",
    align: "center",
}));
const __VLS_266 = __VLS_265({
    prop: "closed_count",
    label: "关闭",
    width: "70",
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
    minWidth: "140",
    showOverflowTooltip: true,
}));
const __VLS_278 = __VLS_277({
    prop: "error_message",
    label: "错误",
    minWidth: "140",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_277));
var __VLS_243;
var __VLS_235;
/** @type {[typeof ScheduleConfigDialog, ]} */ ;
// @ts-ignore
const __VLS_280 = __VLS_asFunctionalComponent(ScheduleConfigDialog, new ScheduleConfigDialog({
    visible: (__VLS_ctx.scheduleVisible),
    kind: "scd_run",
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: ({ config_id: __VLS_ctx.scheduleBizId }),
}));
const __VLS_281 = __VLS_280({
    visible: (__VLS_ctx.scheduleVisible),
    kind: "scd_run",
    businessId: (__VLS_ctx.scheduleBizId),
    businessName: (__VLS_ctx.scheduleBizName),
    payload: ({ config_id: __VLS_ctx.scheduleBizId }),
}, ...__VLS_functionalComponentArgsRest(__VLS_280));
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Plus: Plus,
            VideoPlay: VideoPlay,
            Edit: Edit,
            Delete: Delete,
            InfoFilled: InfoFilled,
            ScheduleConfigDialog: ScheduleConfigDialog,
            userStore: userStore,
            configs: configs,
            runs: runs,
            loading: loading,
            candidates: candidates,
            detectCandidates: detectCandidates,
            dialogVisible: dialogVisible,
            editId: editId,
            form: form,
            saving: saving,
            compareInput: compareInput,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            doDelete: doDelete,
            executing: executing,
            doExecute: doExecute,
            runsVisible: runsVisible,
            showRuns: showRuns,
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
