/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { formatDateTime } from '@/utils/datetime';
import ServiceStatusBadge from '@/components/warehouse/ServiceStatusBadge.vue';
import ServiceSourcePicker from '@/components/warehouse/ServiceSourcePicker.vue';
import DeliveryTargetEditor from '@/components/warehouse/DeliveryTargetEditor.vue';
import ScheduleEditor from '@/components/warehouse/ScheduleEditor.vue';
import { subscriptionsApi } from '@/api/subscriptions';
const items = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editing = ref(null);
const running = ref(null);
const form = ref({
    name: '', source_type: 'table', source_id: '',
    field_scope: [], recipients: [],
    delivery_target: 'feishu', frequency: 'manual',
    push_format: 'json',
});
const sourceRef = ref({ source_type: 'table', source_id: '', source_label: '' });
const deliveryRef = ref({ target: 'feishu', address: '' });
const scheduleRef = ref({ frequency: 'manual', cron_expr: '' });
const recipientId = ref('');
async function load() {
    loading.value = true;
    try {
        items.value = await subscriptionsApi.list();
    }
    catch {
        items.value = [];
    }
    finally {
        loading.value = false;
    }
}
function openCreate() {
    editing.value = null;
    form.value = { name: '', source_type: 'table', source_id: '', field_scope: [], recipients: [], delivery_target: 'feishu', frequency: 'manual', push_format: 'json' };
    sourceRef.value = { source_type: 'table', source_id: '', source_label: '' };
    deliveryRef.value = { target: 'feishu', address: '' };
    recipientId.value = '';
    scheduleRef.value = { frequency: 'manual', cron_expr: '' };
    dialogVisible.value = true;
}
function openEdit(item) {
    editing.value = item;
    form.value = { name: item.name, description: item.description, source_type: item.source_type, source_id: item.source_id, source_label: item.source_label, source_layer: item.source_layer || undefined, field_scope: item.field_scope, recipients: item.recipients, delivery_target: item.delivery_target, frequency: item.frequency, cron_expr: item.cron_expr, push_format: item.push_format };
    sourceRef.value = { source_type: item.source_type, source_id: item.source_id, source_label: item.source_label || '' };
    deliveryRef.value = { target: item.delivery_target, address: '' };
    recipientId.value = String(item.recipients[0]?.id || '');
    scheduleRef.value = { frequency: item.frequency, cron_expr: item.cron_expr || '' };
    dialogVisible.value = true;
}
async function save() {
    const payload = {
        ...form.value,
        source_type: sourceRef.value.source_type,
        source_id: sourceRef.value.source_id,
        source_label: sourceRef.value.source_label,
        recipients: [{ type: "user", id: recipientId.value }],
        delivery_target: deliveryRef.value.target,
        frequency: scheduleRef.value.frequency,
        cron_expr: scheduleRef.value.cron_expr || null,
    };
    try {
        if (editing.value) {
            await subscriptionsApi.update(editing.value.id, payload);
            ElMessage.success('已更新');
        }
        else {
            await subscriptionsApi.create(payload);
            ElMessage.success('已创建');
        }
        dialogVisible.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
}
async function toggle(item) {
    try {
        await subscriptionsApi.toggle(item.id);
        ElMessage.success(item.status === 'enabled' ? '已暂停' : '已启用');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function runNow(item) {
    running.value = item.id;
    try {
        const res = await subscriptionsApi.run(item.id);
        ElMessage.success(res.data?.message || '已触发');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '触发失败');
    }
    finally {
        running.value = null;
    }
}
async function remove(item) {
    await ElMessageBox.confirm(`删除「${item.name}」？`, '确认删除', { type: 'warning' });
    try {
        await subscriptionsApi.remove(item.id);
        ElMessage.success('已删除');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
onMounted(() => load());
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ style: {} },
});
(__VLS_ctx.items.length);
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Plus),
    type: "primary",
    size: "small",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Plus),
    type: "primary",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.openCreate)
};
__VLS_3.slots.default;
var __VLS_3;
const __VLS_8 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    data: (__VLS_ctx.items),
    stripe: true,
    size: "small",
}));
const __VLS_10 = __VLS_9({
    data: (__VLS_ctx.items),
    stripe: true,
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_11.slots.default;
const __VLS_12 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    prop: "name",
    label: "名称",
    minWidth: "130",
    showOverflowTooltip: true,
}));
const __VLS_14 = __VLS_13({
    prop: "name",
    label: "名称",
    minWidth: "130",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    prop: "frequency",
    label: "频率",
    width: "80",
}));
const __VLS_18 = __VLS_17({
    prop: "frequency",
    label: "频率",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_19.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    ({ manual: '手动', daily: '每天', weekly: '每周', monthly: '每月', event: '事件' }[row.frequency] || row.frequency);
}
var __VLS_19;
const __VLS_20 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "投递",
    width: "80",
}));
const __VLS_22 = __VLS_21({
    label: "投递",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_23.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    ({ feishu: '飞书', email: '邮件', webhook: 'Webhook', file: '文件' }[row.delivery_target] || row.delivery_target);
}
var __VLS_23;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    prop: "status",
    label: "状态",
    width: "80",
}));
const __VLS_26 = __VLS_25({
    prop: "status",
    label: "状态",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof ServiceStatusBadge, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(ServiceStatusBadge, new ServiceStatusBadge({
        status: (row.status),
    }));
    const __VLS_29 = __VLS_28({
        status: (row.status),
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
}
var __VLS_27;
const __VLS_31 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    prop: "last_sent_at",
    label: "最近投递",
    width: "150",
}));
const __VLS_33 = __VLS_32({
    prop: "last_sent_at",
    label: "最近投递",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_34.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.last_sent_at ? __VLS_ctx.formatDateTime(row.last_sent_at) : '-');
}
var __VLS_34;
const __VLS_35 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    label: "操作",
    width: "240",
    fixed: "right",
}));
const __VLS_37 = __VLS_36({
    label: "操作",
    width: "240",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_38.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_39 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "primary",
    }));
    const __VLS_41 = __VLS_40({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    let __VLS_43;
    let __VLS_44;
    let __VLS_45;
    const __VLS_46 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_42.slots.default;
    var __VLS_42;
    const __VLS_47 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: (row.status === 'enabled' ? 'warning' : 'success'),
    }));
    const __VLS_49 = __VLS_48({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: (row.status === 'enabled' ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    let __VLS_51;
    let __VLS_52;
    let __VLS_53;
    const __VLS_54 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggle(row);
        }
    };
    __VLS_50.slots.default;
    (row.status === 'enabled' ? '暂停' : '启用');
    var __VLS_50;
    const __VLS_55 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "primary",
        loading: (__VLS_ctx.running === row.id),
    }));
    const __VLS_57 = __VLS_56({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "primary",
        loading: (__VLS_ctx.running === row.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    let __VLS_59;
    let __VLS_60;
    let __VLS_61;
    const __VLS_62 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runNow(row);
        }
    };
    __VLS_58.slots.default;
    var __VLS_58;
    const __VLS_63 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "danger",
    }));
    const __VLS_65 = __VLS_64({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    let __VLS_67;
    let __VLS_68;
    let __VLS_69;
    const __VLS_70 = {
        onClick: (...[$event]) => {
            __VLS_ctx.remove(row);
        }
    };
    __VLS_66.slots.default;
    var __VLS_66;
}
var __VLS_38;
var __VLS_11;
const __VLS_71 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editing ? '编辑订阅' : '新建订阅'),
    width: "680px",
    destroyOnClose: true,
}));
const __VLS_73 = __VLS_72({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editing ? '编辑订阅' : '新建订阅'),
    width: "680px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
__VLS_74.slots.default;
const __VLS_75 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
    labelWidth: "100px",
    labelPosition: "left",
}));
const __VLS_77 = __VLS_76({
    labelWidth: "100px",
    labelPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
__VLS_78.slots.default;
const __VLS_79 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    label: "名称",
    required: true,
}));
const __VLS_81 = __VLS_80({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
__VLS_82.slots.default;
const __VLS_83 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如: 每周薪酬报表推送",
}));
const __VLS_85 = __VLS_84({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如: 每周薪酬报表推送",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
var __VLS_82;
const __VLS_87 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
    label: "描述",
}));
const __VLS_89 = __VLS_88({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_88));
__VLS_90.slots.default;
const __VLS_91 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_93 = __VLS_92({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
var __VLS_90;
const __VLS_95 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
    label: "来源资产",
    required: true,
}));
const __VLS_97 = __VLS_96({
    label: "来源资产",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_96));
__VLS_98.slots.default;
/** @type {[typeof ServiceSourcePicker, ]} */ ;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent(ServiceSourcePicker, new ServiceSourcePicker({
    modelValue: (__VLS_ctx.sourceRef),
}));
const __VLS_100 = __VLS_99({
    modelValue: (__VLS_ctx.sourceRef),
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
var __VLS_98;
const __VLS_102 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_103 = __VLS_asFunctionalComponent(__VLS_102, new __VLS_102({
    label: "接收人",
    required: true,
}));
const __VLS_104 = __VLS_103({
    label: "接收人",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_103));
__VLS_105.slots.default;
const __VLS_106 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_107 = __VLS_asFunctionalComponent(__VLS_106, new __VLS_106({
    modelValue: (__VLS_ctx.recipientId),
    placeholder: "用户ID 或 群ID",
    ...{ style: {} },
}));
const __VLS_108 = __VLS_107({
    modelValue: (__VLS_ctx.recipientId),
    placeholder: "用户ID 或 群ID",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_107));
var __VLS_105;
const __VLS_110 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_111 = __VLS_asFunctionalComponent(__VLS_110, new __VLS_110({
    label: "投递方式",
}));
const __VLS_112 = __VLS_111({
    label: "投递方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_111));
__VLS_113.slots.default;
/** @type {[typeof DeliveryTargetEditor, ]} */ ;
// @ts-ignore
const __VLS_114 = __VLS_asFunctionalComponent(DeliveryTargetEditor, new DeliveryTargetEditor({
    modelValue: (__VLS_ctx.deliveryRef),
}));
const __VLS_115 = __VLS_114({
    modelValue: (__VLS_ctx.deliveryRef),
}, ...__VLS_functionalComponentArgsRest(__VLS_114));
var __VLS_113;
const __VLS_117 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
    label: "调度",
}));
const __VLS_119 = __VLS_118({
    label: "调度",
}, ...__VLS_functionalComponentArgsRest(__VLS_118));
__VLS_120.slots.default;
/** @type {[typeof ScheduleEditor, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(ScheduleEditor, new ScheduleEditor({
    modelValue: (__VLS_ctx.scheduleRef),
}));
const __VLS_122 = __VLS_121({
    modelValue: (__VLS_ctx.scheduleRef),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
var __VLS_120;
var __VLS_78;
{
    const { footer: __VLS_thisSlot } = __VLS_74.slots;
    const __VLS_124 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onClick': {} },
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
    const __VLS_132 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_134 = __VLS_133({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    let __VLS_136;
    let __VLS_137;
    let __VLS_138;
    const __VLS_139 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_135.slots.default;
    var __VLS_135;
}
var __VLS_74;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            formatDateTime: formatDateTime,
            ServiceStatusBadge: ServiceStatusBadge,
            ServiceSourcePicker: ServiceSourcePicker,
            DeliveryTargetEditor: DeliveryTargetEditor,
            ScheduleEditor: ScheduleEditor,
            items: items,
            loading: loading,
            dialogVisible: dialogVisible,
            editing: editing,
            running: running,
            form: form,
            sourceRef: sourceRef,
            deliveryRef: deliveryRef,
            scheduleRef: scheduleRef,
            recipientId: recipientId,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            toggle: toggle,
            runNow: runNow,
            remove: remove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
