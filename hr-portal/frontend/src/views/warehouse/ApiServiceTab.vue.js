/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { formatDateTime } from '@/utils/datetime';
import ServiceStatusBadge from '@/components/warehouse/ServiceStatusBadge.vue';
import ServiceSourcePicker from '@/components/warehouse/ServiceSourcePicker.vue';
import ServiceFieldSelector from '@/components/warehouse/ServiceFieldSelector.vue';
import PermissionPolicyEditor from '@/components/warehouse/PermissionPolicyEditor.vue';
import { apiServicesApi } from '@/api/api_services';
const items = ref([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editing = ref(null);
const form = ref({
    name: '', source_type: 'table', source_id: '',
    field_whitelist: [], filter_fields: [],
    auth_policy: {}, page_size_max: 500,
});
const sourceRef = ref({ source_type: 'table', source_id: '', source_label: '' });
async function load() {
    loading.value = true;
    try {
        items.value = await apiServicesApi.list();
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
    form.value = { name: '', source_type: 'table', source_id: '', field_whitelist: [], filter_fields: [], auth_policy: {}, page_size_max: 500 };
    sourceRef.value = { source_type: 'table', source_id: '', source_label: '' };
    dialogVisible.value = true;
}
function openEdit(item) {
    editing.value = item;
    form.value = { name: item.name, description: item.description, source_type: item.source_type, source_id: item.source_id, source_label: item.source_label, source_layer: item.source_layer || undefined, field_whitelist: item.field_whitelist, filter_fields: item.filter_fields, default_sort: item.default_sort || undefined, page_size_max: item.page_size_max, auth_policy: item.auth_policy, rate_limit: item.rate_limit, timeout_seconds: item.timeout_seconds };
    sourceRef.value = { source_type: item.source_type, source_id: item.source_id, source_label: item.source_label || '' };
    dialogVisible.value = true;
}
async function save() {
    const payload = { ...form.value, source_type: sourceRef.value.source_type, source_id: sourceRef.value.source_id, source_label: sourceRef.value.source_label };
    try {
        if (editing.value) {
            await apiServicesApi.update(editing.value.id, payload);
            ElMessage.success('已更新');
        }
        else {
            await apiServicesApi.create(payload);
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
        await apiServicesApi.toggle(item.id);
        ElMessage.success(item.status === 'enabled' ? '已停用' : '已启用');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function remove(item) {
    await ElMessageBox.confirm(`删除「${item.name}」？`, '确认删除', { type: 'warning' });
    try {
        await apiServicesApi.remove(item.id);
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
    minWidth: "140",
    showOverflowTooltip: true,
}));
const __VLS_14 = __VLS_13({
    prop: "name",
    label: "名称",
    minWidth: "140",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "来源",
    minWidth: "180",
}));
const __VLS_18 = __VLS_17({
    label: "来源",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_19.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.source_label || row.source_id);
    const __VLS_20 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        size: "small",
        type: "info",
    }));
    const __VLS_22 = __VLS_21({
        size: "small",
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    (row.source_layer || row.source_type);
    var __VLS_23;
}
var __VLS_19;
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
    label: "鉴权",
    width: "80",
}));
const __VLS_33 = __VLS_32({
    label: "鉴权",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_34.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    ((row.auth_policy || {}).type || '登录态');
}
var __VLS_34;
const __VLS_35 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    prop: "updated_at",
    label: "更新",
    width: "150",
}));
const __VLS_37 = __VLS_36({
    prop: "updated_at",
    label: "更新",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_38.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.updated_at));
}
var __VLS_38;
const __VLS_39 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    label: "操作",
    width: "200",
    fixed: "right",
}));
const __VLS_41 = __VLS_40({
    label: "操作",
    width: "200",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_42.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_42.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_43 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "primary",
    }));
    const __VLS_45 = __VLS_44({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    let __VLS_47;
    let __VLS_48;
    let __VLS_49;
    const __VLS_50 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_46.slots.default;
    var __VLS_46;
    const __VLS_51 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: (row.status === 'enabled' ? 'warning' : 'success'),
    }));
    const __VLS_53 = __VLS_52({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: (row.status === 'enabled' ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    let __VLS_55;
    let __VLS_56;
    let __VLS_57;
    const __VLS_58 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggle(row);
        }
    };
    __VLS_54.slots.default;
    (row.status === 'enabled' ? '停用' : '启用');
    var __VLS_54;
    const __VLS_59 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "danger",
    }));
    const __VLS_61 = __VLS_60({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    let __VLS_63;
    let __VLS_64;
    let __VLS_65;
    const __VLS_66 = {
        onClick: (...[$event]) => {
            __VLS_ctx.remove(row);
        }
    };
    __VLS_62.slots.default;
    var __VLS_62;
}
var __VLS_42;
var __VLS_11;
const __VLS_67 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editing ? '编辑 API 服务' : '新建 API 服务'),
    width: "680px",
    destroyOnClose: true,
}));
const __VLS_69 = __VLS_68({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editing ? '编辑 API 服务' : '新建 API 服务'),
    width: "680px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
__VLS_70.slots.default;
const __VLS_71 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    labelWidth: "100px",
    labelPosition: "left",
}));
const __VLS_73 = __VLS_72({
    labelWidth: "100px",
    labelPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
__VLS_74.slots.default;
const __VLS_75 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
    label: "名称",
    required: true,
}));
const __VLS_77 = __VLS_76({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
__VLS_78.slots.default;
const __VLS_79 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如: 员工查询API",
}));
const __VLS_81 = __VLS_80({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如: 员工查询API",
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
var __VLS_78;
const __VLS_83 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    label: "描述",
}));
const __VLS_85 = __VLS_84({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
__VLS_86.slots.default;
const __VLS_87 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_89 = __VLS_88({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_88));
var __VLS_86;
const __VLS_91 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    label: "来源资产",
    required: true,
}));
const __VLS_93 = __VLS_92({
    label: "来源资产",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
__VLS_94.slots.default;
/** @type {[typeof ServiceSourcePicker, ]} */ ;
// @ts-ignore
const __VLS_95 = __VLS_asFunctionalComponent(ServiceSourcePicker, new ServiceSourcePicker({
    modelValue: (__VLS_ctx.sourceRef),
}));
const __VLS_96 = __VLS_95({
    modelValue: (__VLS_ctx.sourceRef),
}, ...__VLS_functionalComponentArgsRest(__VLS_95));
var __VLS_94;
const __VLS_98 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
    label: "返回字段",
    required: true,
}));
const __VLS_100 = __VLS_99({
    label: "返回字段",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
__VLS_101.slots.default;
/** @type {[typeof ServiceFieldSelector, ]} */ ;
// @ts-ignore
const __VLS_102 = __VLS_asFunctionalComponent(ServiceFieldSelector, new ServiceFieldSelector({
    modelValue: (__VLS_ctx.form.field_whitelist),
}));
const __VLS_103 = __VLS_102({
    modelValue: (__VLS_ctx.form.field_whitelist),
}, ...__VLS_functionalComponentArgsRest(__VLS_102));
var __VLS_101;
const __VLS_105 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
    label: "过滤字段",
}));
const __VLS_107 = __VLS_106({
    label: "过滤字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_106));
__VLS_108.slots.default;
const __VLS_109 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
    modelValue: (__VLS_ctx.form.filter_fields),
    multiple: true,
    filterable: true,
    allowCreate: true,
    placeholder: "可选填",
    ...{ style: {} },
}));
const __VLS_111 = __VLS_110({
    modelValue: (__VLS_ctx.form.filter_fields),
    multiple: true,
    filterable: true,
    allowCreate: true,
    placeholder: "可选填",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_110));
__VLS_112.slots.default;
for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.field_whitelist))) {
    const __VLS_113 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        key: (f.field),
        label: (f.alias || f.field),
        value: (f.field),
    }));
    const __VLS_115 = __VLS_114({
        key: (f.field),
        label: (f.alias || f.field),
        value: (f.field),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
}
var __VLS_112;
var __VLS_108;
const __VLS_117 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
    label: "鉴权策略",
}));
const __VLS_119 = __VLS_118({
    label: "鉴权策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_118));
__VLS_120.slots.default;
/** @type {[typeof PermissionPolicyEditor, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(PermissionPolicyEditor, new PermissionPolicyEditor({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: __VLS_ctx.form.auth_policy,
}));
const __VLS_122 = __VLS_121({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: __VLS_ctx.form.auth_policy,
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
let __VLS_124;
let __VLS_125;
let __VLS_126;
const __VLS_127 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.form.auth_policy = $event;
    }
};
var __VLS_123;
var __VLS_120;
var __VLS_74;
{
    const { footer: __VLS_thisSlot } = __VLS_70.slots;
    const __VLS_128 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        ...{ 'onClick': {} },
    }));
    const __VLS_130 = __VLS_129({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    let __VLS_132;
    let __VLS_133;
    let __VLS_134;
    const __VLS_135 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_131.slots.default;
    var __VLS_131;
    const __VLS_136 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_138 = __VLS_137({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    let __VLS_140;
    let __VLS_141;
    let __VLS_142;
    const __VLS_143 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_139.slots.default;
    var __VLS_139;
}
var __VLS_70;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            formatDateTime: formatDateTime,
            ServiceStatusBadge: ServiceStatusBadge,
            ServiceSourcePicker: ServiceSourcePicker,
            ServiceFieldSelector: ServiceFieldSelector,
            PermissionPolicyEditor: PermissionPolicyEditor,
            items: items,
            loading: loading,
            dialogVisible: dialogVisible,
            editing: editing,
            form: form,
            sourceRef: sourceRef,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            toggle: toggle,
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
